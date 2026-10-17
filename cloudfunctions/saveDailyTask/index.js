// 云函数：saveDailyTask —— 每日打卡任务发布（管理员）
//   action='save'   按 date + classKey upsert 任务（classIds 空 = 全体可见；同一天可发布多组不同对象）
// 鉴权：token 优先（Web），openid+isAdmin 兜底（小程序）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./_common');
const normalizeEvent = common.normalizeEvent;
const authenticate = (event) => common.authenticate(event, db, cloud);
const logAudit = (auth, action, detail) => common.logAudit(db, auth, 'checkin', action, detail);

/** 校验并清洗发布对象：空 = 全体；否则为班级 id 数组（去重，≤10 个） */
function cleanClassIds(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = [...new Set(raw.filter((x) => typeof x === 'string' && x))];
  if (ids.length > 10) throw new Error('发布对象最多选择 10 个班级');
  return ids;
}

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

    const { date, items, classIds } = event;
    if (!date || typeof date !== 'string') return { success: false, error: '缺少日期' };
    if (!Array.isArray(items) || items.length === 0) return { success: false, error: '至少需要一项任务' };
    if (items.length > 4) return { success: false, error: '最多 4 项任务' };

    let targetClassIds;
    try {
      targetClassIds = cleanClassIds(classIds);
    } catch (e) {
      return { success: false, error: e.message };
    }
    const classKey = targetClassIds.slice().sort().join(',');

    // 校验并清洗 items（科目放宽为任意 ≤4 字标签，兼容历史英文 key）
    const cleanItems = items.map((item, i) => {
      const raw = String(item.subject || '').trim().slice(0, 4);
      const subject = raw || '听力';
      const content = String(item.content || '').trim();
      if (!content) throw new Error(`第 ${i + 1} 项内容不能为空`);
      const suggestMinutes = Math.max(1, Math.min(300, parseInt(item.suggestMinutes, 10) || 30));
      return { id: item.id || `t${i + 1}`, subject, content, suggestMinutes };
    });

    const totalMinutes = cleanItems.reduce((sum, it) => sum + it.suggestMinutes, 0);
    const now = new Date();

    // 按 date + classKey 查询是否已存在（同一天可对不同对象发布多组）
    const existing = await db.collection('daily_tasks').where({ date, classKey }).limit(1).get();
    if (existing.data && existing.data.length > 0) {
      const docId = existing.data[0]._id;
      await db.collection('daily_tasks').doc(docId).update({
        data: { items: cleanItems, totalMinutes, classIds: targetClassIds, updatedBy: auth.userId, updatedAt: now },
      });
      await logAudit(auth, 'checkin.save', `更新打卡任务：${date}（${cleanItems.length} 项，${targetClassIds.length ? `指定 ${targetClassIds.length} 个班级` : '全体'}）`);
      return { success: true, message: '已更新', taskId: docId };
    }

    const addRes = await db.collection('daily_tasks').add({
      data: {
        date,
        classIds: targetClassIds,
        classKey,
        items: cleanItems,
        totalMinutes,
        createdBy: auth.userId,
        createdByName: auth.nickName || '',
        createdAt: now,
        updatedAt: now,
      },
    });
    await logAudit(auth, 'checkin.save', `发布打卡任务：${date}（${cleanItems.length} 项，${targetClassIds.length ? `指定 ${targetClassIds.length} 个班级` : '全体'}）`);
    return { success: true, message: '已发布', taskId: addRes._id };
  } catch (e) {
    console.error('[saveDailyTask] 失败', e);
    return { success: false, error: e.message || '保存失败' };
  }
};
