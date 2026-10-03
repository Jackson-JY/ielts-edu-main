// 云函数：saveDailyTask —— 每日打卡任务发布（管理员）
//   action='save'   按 date upsert 当日任务
// 鉴权：token 优先（Web），openid+isAdmin 兜底（小程序）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  if (event.body && typeof event.body === 'object') return event.body;
  return event;
}

async function authenticate(event) {
  const token = event && event._token;
  if (token) {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];
    if (session && session.expireAt && new Date(session.expireAt) > new Date()) {
      return { ok: true, userId: session.userId, nickName: session.nickName };
    }
    return { ok: false, authError: true };
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (openid) {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
    const user = res.data && res.data[0];
    if (user && user.isAdmin === true) return { ok: true, userId: user._id, nickName: user.nickName };
    return { ok: false };
  }
  return { ok: false, authError: true };
}

const VALID_SUBJECTS = ['listening', 'reading', 'writing', 'speaking'];

exports.main = async (event) => {
  event = normalizeEvent(event);
  try {
    const auth = await authenticate(event);
    if (!auth.ok) {
      return auth.authError
        ? { success: false, authError: true, error: '登录已过期' }
        : { success: false, error: '无权操作，仅管理员可操作' };
    }

    const { action } = event || {};
    if (action !== 'save') return { success: false, error: '未知操作' };

    const { date, items } = event;
    if (!date || typeof date !== 'string') return { success: false, error: '缺少日期' };
    if (!Array.isArray(items) || items.length === 0) return { success: false, error: '至少需要一项任务' };
    if (items.length > 4) return { success: false, error: '最多 4 项任务' };

    // 校验并清洗 items
    const cleanItems = items.map((item, i) => {
      const subject = VALID_SUBJECTS.includes(item.subject) ? item.subject : 'listening';
      const content = String(item.content || '').trim();
      if (!content) throw new Error(`第 ${i + 1} 项内容不能为空`);
      const suggestMinutes = Math.max(1, Math.min(300, parseInt(item.suggestMinutes, 10) || 30));
      return { id: item.id || `t${i + 1}`, subject, content, suggestMinutes };
    });

    const totalMinutes = cleanItems.reduce((sum, it) => sum + it.suggestMinutes, 0);
    const now = new Date();

    // 按 date 查询是否已存在
    const existing = await db.collection('daily_tasks').where({ date }).limit(1).get();
    if (existing.data && existing.data.length > 0) {
      const docId = existing.data[0]._id;
      await db.collection('daily_tasks').doc(docId).update({
        data: { items: cleanItems, totalMinutes, updatedBy: auth.userId, updatedAt: now },
      });
      return { success: true, message: '已更新', taskId: docId };
    }

    const addRes = await db.collection('daily_tasks').add({
      data: {
        date,
        items: cleanItems,
        totalMinutes,
        createdBy: auth.userId,
        createdByName: auth.nickName || '',
        createdAt: now,
        updatedAt: now,
      },
    });
    return { success: true, message: '已发布', taskId: addRes._id };
  } catch (e) {
    console.error('[saveDailyTask] 失败', e);
    return { success: false, error: e.message || '保存失败' };
  }
};
