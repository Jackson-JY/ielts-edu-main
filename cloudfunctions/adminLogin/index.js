// 云函数：adminLogin —— 管理端登录（微信扫码 / 开发模式）
//
// 登录方式：
//   1. action='wechat'  微信开放平台「网站应用」扫码登录
//      - 用 code 调微信 oauth2 换 access_token + openid + unionid
//      - 通过 unionid（优先）或 openid 查 users 表中 isAdmin=true 的管理员
//   2. action='dev'     开发模式登录（仅本地联调用）
//      - 需环境变量 ALLOW_DEV_LOGIN=true 才启用
//      - 直接指定管理员 openid 登录
//
// 环境变量（在云函数控制台配置）：
//   WX_WEB_APPID    微信开放平台「网站应用」AppID
//   WX_WEB_SECRET   微信开放平台「网站应用」AppSecret
//   ALLOW_DEV_LOGIN 设为 'true' 时开放开发模式登录
//
// 依赖：wx-server-sdk（node 内置 https/crypto，无需额外依赖）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const SESSION_TTL = 7 * 24 * 3600 * 1000; // token 有效期 7 天
const PASSWORD_SALT = 'ielts-edu-admin-v1'; // 账号密码哈希盐

/**
 * 归一化 event：兼容 SDK 调用（event 直接是数据对象）与 HTTP 调用（event.body 是 JSON 字符串）
 * Web 端在匿名登录未开启时会降级为 HTTP 调用，此时 event 结构不同，需统一解析。
 */
function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  if (event.body && typeof event.body === 'object') {
    return event.body;
  }
  return event;
}

/** 密码哈希（sha256 + 盐，与 initAdmin 云函数保持一致） */
function hashPassword(username, password) {
  return crypto.createHash('sha256').update(`${username}:${password}:${PASSWORD_SALT}`).digest('hex');
}

/** 用 code 换微信 oauth2 access_token（网站应用扫码登录） */
function wxCode2Session(code) {
  const appid = process.env.WX_WEB_APPID;
  const secret = process.env.WX_WEB_SECRET;
  if (!appid || !secret) {
    return Promise.reject(new Error('未配置 WX_WEB_APPID / WX_WEB_SECRET 环境变量'));
  }
  const url =
    `https://api.weixin.qq.com/sns/oauth2/access_token` +
    `?appid=${appid}&secret=${secret}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('微信接口返回解析失败'));
          }
        });
      })
      .on('error', reject);
  });
}

/** 签发 token 并写入 admin_sessions */
async function issueToken(user, openid) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  await db.collection('admin_sessions').add({
    data: {
      token,
      userId: user._id,
      openid: openid || user._openid || '',
      unionid: user.unionid || '',
      nickName: user.nickName || '管理员',
      createdAt: now,
      expireAt: new Date(now.getTime() + SESSION_TTL),
    },
  });
  return {
    token,
    admin: {
      _id: user._id,
      nickName: user.nickName || '管理员',
      openid: openid || user._openid || '',
    },
  };
}

exports.main = async (event) => {
  event = normalizeEvent(event);
  const { action, code, openid } = event || {};

  try {
    // ---------- 微信扫码登录 ----------
    if (action === 'wechat') {
      if (!code) return { success: false, error: '缺少 code' };

      const wxData = await wxCode2Session(code);
      if (wxData.errcode) {
        return { success: false, error: `微信授权失败：${wxData.errmsg || wxData.errcode}` };
      }

      // 优先 unionid，其次 openid
      let user = null;
      if (wxData.unionid) {
        const r = await db
          .collection('users')
          .where({ unionid: wxData.unionid, isAdmin: true })
          .limit(1)
          .get();
        user = r.data && r.data[0];
      }
      if (!user && wxData.openid) {
        const r = await db
          .collection('users')
          .where({ _openid: wxData.openid, isAdmin: true })
          .limit(1)
          .get();
        user = r.data && r.data[0];
      }
      if (!user) return { success: false, error: '该微信账号未绑定管理员' };

      const result = await issueToken(user, wxData.openid);
      return { success: true, ...result };
    }

    // ---------- 开发模式登录 ----------
    if (action === 'dev') {
      if (process.env.ALLOW_DEV_LOGIN !== 'true') {
        return { success: false, error: '开发模式登录未开启（需配置 ALLOW_DEV_LOGIN=true）' };
      }
      if (!openid) return { success: false, error: '缺少 openid' };

      const r = await db.collection('users').where({ _openid: openid, isAdmin: true }).limit(1).get();
      const user = r.data && r.data[0];
      if (!user) return { success: false, error: '未找到该管理员账号' };

      const result = await issueToken(user, openid);
      return { success: true, ...result };
    }

    // ---------- 账号密码登录（兜底，无需开放平台资质） ----------
    if (action === 'password') {
      const { username, password } = event || {};
      if (!username || !password) return { success: false, error: '请输入账号和密码' };

      const hash = hashPassword(username, password);
      const r = await db
        .collection('users')
        .where({ adminUsername: username, isAdmin: true })
        .limit(1)
        .get();
      const user = r.data && r.data[0];
      if (!user || user.adminPasswordHash !== hash) {
        return { success: false, error: '账号或密码错误' };
      }

      const result = await issueToken(user, user._openid);
      return { success: true, ...result };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    console.error('[adminLogin] 失败', e);
    return { success: false, error: e.message || '登录失败' };
  }
};
