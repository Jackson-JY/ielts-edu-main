// 云函数：删除课程（管理员）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
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
  try {
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

    const res = await db.collection('users').where({ _openid: openid }).get();
    if (res.data && res.data.length > 0 && res.data[0].isAdmin === true) return { ok: true };
    return { ok: false };
  } catch (e) {
    console.error('验证管理员失败', e);
    return { ok: false };
  }
}

/**
 * 删除课程（管理员）
 */
async function deleteCourseById(id) {
  try {
    // 直接删除课程记录（云函数拥有管理员权限）
    const res = await db.collection('courses').doc(id).remove();

    if (res.stats && res.stats.removed > 0) {
      return {
        success: true,
        message: '课程已删除'
      };
    } else {
      return {
        success: false,
        error: '课程不存在或已被删除'
      };
    }
  } catch (e) {
    console.error('删除课程失败', e);
    return {
      success: false,
      error: e.message || '删除失败'
    };
  }
}

exports.main = async (event, context) => {
  event = normalizeEvent(event);
  const { id } = event;

  if (!id) {
    return {
      success: false,
      error: '缺少课程ID'
    };
  }

  // 验证管理员身份
  const auth = await authenticate(event);
  if (!auth.ok) {
    return auth.authError
      ? { success: false, authError: true, error: '登录已过期' }
      : { success: false, error: '无权删除课程，仅管理员可操作' };
  }

  try {
    return await deleteCourseById(id);
  } catch (e) {
    console.error('云函数执行失败', e);
    return {
      success: false,
      error: e.message || '服务器错误'
    };
  }
};
