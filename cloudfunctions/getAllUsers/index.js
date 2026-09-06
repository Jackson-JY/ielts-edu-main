const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

/**
 * 归一化 event：兼容 SDK 调用（event 直接是数据对象）与 HTTP 调用（event.body 是 JSON 字符串）
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

// 统一鉴权：token 优先（Web 端），openid+isAdmin 兜底（小程序端）
async function authenticate(event) {
  const token = event && event._token;
  if (token) {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];
    if (session && session.expireAt && new Date(session.expireAt) > new Date()) return { ok: true };
    return { ok: false, authError: true };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { ok: false, authError: true };

  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  if (res.data && res.data[0] && res.data[0].isAdmin === true) return { ok: true };
  return { ok: false };
}

// 云函数入口函数
exports.main = async (event, context) => {
  event = normalizeEvent(event);
  try {
    const auth = await authenticate(event);
    if (!auth.ok) {
      return auth.authError
        ? { success: false, authError: true, error: '登录已过期', data: [] }
        : { success: false, error: '无权获取用户列表，仅管理员可操作', data: [] };
    }

    // 获取所有用户，排除敏感信息
    // 注：_openid 是作业等私有集合按用户隔离的关联键，
    // 教师端需要据此把作业记录映射回学员姓名，因此必须返回。
    const res = await db.collection('users')
      .field({
        nickName: true,
        avatarUrl: true,
        _id: true,
        _openid: true,
        isAdmin: true,
        _createTime: true,
      })
      .orderBy('_createTime', 'desc')
      .get();

    return {
      success: true,
      data: res.data || [],
    };
  } catch (e) {
    console.error('[getAllUsers] 获取用户列表失败', e);
    return {
      success: false,
      error: e.message,
      data: [],
    };
  }
};
