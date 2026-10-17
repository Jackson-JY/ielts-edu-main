// 云函数：initAdmin —— 初始化/重置管理员账号密码（账号密码登录用）
//
// 用途：给小程序端已标记 isAdmin=true 的用户设置登录名和密码，
//       用于管理端「账号密码登录」兜底（无需微信开放平台资质）。
//
// 安全：仅当环境变量 ALLOW_DEV_LOGIN=true 时才可用。
//       上线后请删除该环境变量，本云函数即不可调用，账号密码也无法再被重置。
//
// 调用示例（云函数测试）：
//   { openid: '管理员openid', username: 'admin', password: '你的密码' }
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const hashPassword = require('./_common').hashPassword;

exports.main = async (event) => {
  try {
    if (process.env.ALLOW_DEV_LOGIN !== 'true') {
      return { success: false, error: '初始化功能仅在开发模式可用（需配置 ALLOW_DEV_LOGIN=true）' };
    }

    const { openid, username, password } = event || {};
    if (!openid || !username || !password) {
      return { success: false, error: '参数不完整（需 openid / username / password）' };
    }
    if (String(password).length < 6) {
      return { success: false, error: '密码至少 6 位' };
    }

    const r = await db.collection('users').where({ _openid: openid, isAdmin: true }).limit(1).get();
    const user = r.data && r.data[0];
    if (!user) return { success: false, error: '未找到该管理员（需 users.isAdmin=true）' };

    await db.collection('users').doc(user._id).update({
      data: {
        adminUsername: username,
        adminPasswordHash: hashPassword(username, password),
      },
    });

    return { success: true, message: '管理员账号已设置' };
  } catch (e) {
    console.error('[initAdmin] 失败', e);
    return { success: false, error: e.message || '初始化失败' };
  }
};
