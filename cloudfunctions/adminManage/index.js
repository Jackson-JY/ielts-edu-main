// 云函数：adminManage —— 管理员账号管理（列表 / 新增 / 重置密码 / 自行改密）
//
// action:
//   list            管理员列表（含密码/微信绑定状态）
//   add             新增独立管理员账号（用户名+密码+昵称，仅网页账号密码登录）
//   resetPassword   重置任意管理员的密码（重置后其所有登录态失效）
//   changePassword  登录后自行修改密码（需校验原密码，未设置过密码可直接设置）
//
// 鉴权：token（admin_sessions）优先，openid+isAdmin 兜底（与各管理端云函数一致）
// 审计：所有写操作写入 admin_audit_logs（module='admin'）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const PASSWORD_SALT = 'ielts-edu-admin-v1'; // 与 adminLogin / initAdmin 保持一致

/** 归一化 event：兼容 SDK 调用与 HTTP 调用 */
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

/** 密码哈希（sha256 + 盐，与 adminLogin 保持一致） */
function hashPassword(username, password) {
  return crypto.createHash('sha256').update(`${username}:${password}:${PASSWORD_SALT}`).digest('hex');
}

/** 统一鉴权：返回 { ok, userId, adminName, token } */
async function authenticate(event) {
  const token = event && event._token;
  if (token) {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];
    if (session && session.expireAt && new Date(session.expireAt) > new Date()) {
      return { ok: true, userId: session.userId, adminName: session.nickName || '管理员', token };
    }
    return { ok: false, authError: true };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { ok: false, authError: true };

  const res = await db.collection('users').where({ _openid: openid, isAdmin: true }).limit(1).get();
  const user = res.data && res.data[0];
  if (!user) return { ok: false };
  return { ok: true, userId: user._id, adminName: user.nickName || '管理员', token: '' };
}

/** 写管理员操作审计日志 */
async function logAudit(auth, action, detail) {
  try {
    await db.collection('admin_audit_logs').add({
      data: {
        adminId: auth.userId,
        adminName: auth.adminName,
        module: 'admin',
        action,
        detail: detail || '',
        createdAt: new Date(),
      },
    });
  } catch (e) {
    console.error('[adminManage] 写审计日志失败', e);
  }
}

/** 清除某管理员的所有登录态（keepToken 用于改密后保留当前会话） */
async function clearSessions(userId, keepToken) {
  try {
    const where = keepToken ? { userId, token: _.neq(keepToken) } : { userId };
    await db.collection('admin_sessions').where(where).remove();
  } catch (e) {
    console.error('[adminManage] 清理登录态失败', e);
  }
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

exports.main = async (event) => {
  event = normalizeEvent(event);
  const { action } = event || {};

  try {
    const auth = await authenticate(event);
    if (!auth.ok) {
      return auth.authError
        ? { success: false, authError: true, error: '登录已过期' }
        : { success: false, error: '无权操作，仅管理员可用' };
    }

    // ---------- 管理员列表 ----------
    if (action === 'list') {
      const res = await db
        .collection('users')
        .where({ isAdmin: true })
        .field({
          nickName: true,
          adminUsername: true,
          adminPasswordHash: true,
          _openid: true,
          unionid: true,
          phone: true,
          _createTime: true,
        })
        .orderBy('_createTime', 'asc')
        .limit(100)
        .get();

      const admins = (res.data || []).map((u) => ({
        userId: u._id,
        nickName: u.nickName || '管理员',
        adminUsername: u.adminUsername || '',
        hasPassword: !!u.adminPasswordHash,
        hasWxBind: !!(u.unionid || u._openid),
        phone: u.phone || '',
        createdAt: u._createTime || null,
        isSelf: u._id === auth.userId,
      }));

      return { success: true, admins };
    }

    // ---------- 新增管理员 ----------
    if (action === 'add') {
      const { username, password, nickName } = event || {};
      const uname = String(username || '').trim();
      const pname = String(password || '');
      const nname = String(nickName || '').trim();

      if (!USERNAME_RE.test(uname)) {
        return { success: false, error: '用户名需为 3-20 位字母、数字或下划线' };
      }
      if (pname.length < 6) return { success: false, error: '密码至少 6 位' };
      if (!nname) return { success: false, error: '请填写昵称' };

      const dup = await db.collection('users').where({ adminUsername: uname }).count();
      if (dup.total > 0) return { success: false, error: '该用户名已被使用' };

      const now = new Date();
      const addRes = await db.collection('users').add({
        data: {
          nickName: nname,
          adminUsername: uname,
          adminPasswordHash: hashPassword(uname, pname),
          isAdmin: true,
          webAdmin: true, // 标记：网页端创建的独立管理员账号（无小程序身份）
          loginCount: 0,
          _createTime: now,
        },
      });

      await logAudit(auth, 'admin.add', `新增管理员：${nname}（${uname}）`);
      return { success: true, userId: addRes._id, message: `管理员「${nname}」已创建` };
    }

    // ---------- 重置其他管理员密码 ----------
    if (action === 'resetPassword') {
      const { userId, newPassword } = event || {};
      const pname = String(newPassword || '');
      if (!userId) return { success: false, error: '缺少目标管理员' };
      if (pname.length < 6) return { success: false, error: '密码至少 6 位' };

      const targetRes = await db.collection('users').doc(userId).get();
      const target = targetRes.data;
      if (!target || target.isAdmin !== true) {
        return { success: false, error: '目标账号不是管理员' };
      }

      const username = target.adminUsername || '';
      await db.collection('users').doc(userId).update({
        data: { adminPasswordHash: username ? hashPassword(username, pname) : hashPassword(userId, pname) },
      });

      await clearSessions(userId, auth.userId === userId ? auth.token : null);
      await logAudit(auth, 'admin.resetPassword', `重置密码：${target.nickName || '管理员'}（${username || userId}）`);
      return {
        success: true,
        message:
          auth.userId === userId
            ? '密码已重置，当前会话仍有效'
            : `已重置「${target.nickName || '管理员'}」的密码，其所有登录态已失效`,
      };
    }

    // ---------- 自行修改密码 ----------
    if (action === 'changePassword') {
      const { oldPassword, newPassword } = event || {};
      const pname = String(newPassword || '');
      if (pname.length < 6) return { success: false, error: '新密码至少 6 位' };

      const selfRes = await db.collection('users').doc(auth.userId).get();
      const self = selfRes.data;
      if (!self) return { success: false, error: '账号不存在' };

      if (self.adminPasswordHash) {
        const username = self.adminUsername || '';
        const oldHash = hashPassword(username, String(oldPassword || ''));
        if (oldHash !== self.adminPasswordHash) {
          return { success: false, error: '原密码不正确' };
        }
        if (String(oldPassword || '') === pname) {
          return { success: false, error: '新密码不能与原密码相同' };
        }
      }
      // 未设置过密码（如微信扫码登录的管理员）可直接设置

      const username = self.adminUsername || '';
      await db.collection('users').doc(auth.userId).update({
        data: { adminPasswordHash: username ? hashPassword(username, pname) : hashPassword(auth.userId, pname) },
      });

      await clearSessions(auth.userId, auth.token); // 保留当前会话，踢掉其他设备
      await logAudit(auth, 'admin.changePassword', `修改密码：${self.nickName || '管理员'}`);
      return { success: true, message: '密码已修改' };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    console.error('[adminManage] 失败', e);
    return { success: false, error: e.message || '操作失败' };
  }
};
