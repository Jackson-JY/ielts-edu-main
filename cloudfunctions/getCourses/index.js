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

/**
 * 获取课程列表（支持日期范围和分页）
 * @param {Object} event - 传入参数
 *   - startDate: 开始日期 YYYY-MM-DD
 *   - endDate: 结束日期 YYYY-MM-DD
 *   - skip: 跳过的记录数（可选，默认0）
 *   - limit: 每页数量（可选，默认100）
 * @returns {Object} 课程列表和总数
 */
exports.main = async (event, context) => {
  event = normalizeEvent(event);
  const { startDate, endDate, skip = 0, limit = 100 } = event;

  try {
    const auth = await authenticate(event);
    if (!auth.ok) {
      return auth.authError
        ? { success: false, authError: true, error: '登录已过期', data: [], total: 0 }
        : { success: false, error: '无权获取课程列表，仅管理员可操作', data: [], total: 0 };
    }

    // 构建查询条件
    const whereCondition = {
      date: db.command.gte(startDate).and(db.command.lte(endDate))
    };

    // 获取总数
    const countResult = await db.collection('courses')
      .where(whereCondition)
      .count();

    // 获取数据列表（按日期和时间排序）
    const listResult = await db.collection('courses')
      .where(whereCondition)
      .orderBy('date', 'asc')
      .orderBy('startTime', 'asc')
      .skip(skip)
      .limit(limit)
      .get();

    return {
      success: true,
      data: listResult.data || [],
      total: countResult.total,
      skip,
      limit,
    };
  } catch (e) {
    console.error('[getCourses] 获取课程列表失败', e);
    return {
      success: false,
      error: e.message,
      data: [],
      total: 0,
    };
  }
};
