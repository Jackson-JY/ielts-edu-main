/**
 * 云函数：submitCheckin —— 提交/切换每日打卡任务完成状态
 *
 * 入参：
 *   action: 'toggle'         切换某一项任务的完成状态
 *   date:   'YYYY-MM-DD'     打卡日期
 *   taskId: string           daily_tasks 的 _id
 *   itemId: string           任务项 id
 *   done:   boolean          目标完成状态（true=完成, false=取消）
 *   actualMinutes?: number   实际用时（分钟，可选，仅完成时填写）
 *
 * 返回：
 *   success, completedCount, allDone, streakDays, record
 *
 * 集合 checkin_records：
 *   {_openid, userId, nickName, date, taskId, totalItems,
 *    items:[{id,subject,done,doneAt,actualMinutes}],
 *    completedCount, checked, allDone, sharedAt, posterSavedAt, createdAt, updatedAt}
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  if (event.body && typeof event.body === 'object') return event.body;
  return event;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 计算连续打卡天数：从今天往前数，有记录且 completedCount>0 即计一天
async function calcStreak(openid) {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const res = await db.collection('checkin_records')
      .where({ _openid: openid, date: dateStr })
      .limit(1).get();
    const rec = res.data && res.data[0];
    if (rec && rec.completedCount > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

exports.main = async (event) => {
  event = normalizeEvent(event);
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '缺少 openid' };

  try {
    const { action } = event;

    // action: toggle —— 切换某一项任务完成态
    if (action === 'toggle') {
      const { date, taskId, itemId, done, actualMinutes } = event;
      if (!date || !taskId || !itemId || done === undefined) {
        return { success: false, error: '缺少必要参数' };
      }

      // 取当日任务定义（用于 totalItems 和 item.subject）
      const taskRes = await db.collection('daily_tasks').doc(taskId).get();
      const task = taskRes.data;
      if (!task) return { success: false, error: '任务不存在' };
      const taskItem = (task.items || []).find((it) => it.id === itemId);
      if (!taskItem) return { success: false, error: '任务项不存在' };

      // 查是否已有当日打卡记录
      const existingRes = await db.collection('checkin_records')
        .where({ _openid: openid, date })
        .limit(1).get();
      const existing = existingRes.data && existingRes.data[0];

      const now = new Date();
      // 班级合并任务时客户端会传合并后的总项数；单任务场景保持原逻辑
      const clientTotal = parseInt(event.totalItems, 10);
      const totalItems = Number.isInteger(clientTotal) && clientTotal > 0 ? clientTotal : task.items.length;
      const doneBool = !!done;
      const minutes = doneBool ? (parseInt(actualMinutes, 10) || 0) : 0;

      let items;
      if (existing && Array.isArray(existing.items) && existing.items.length > 0) {
        // 已有记录，更新对应项
        items = existing.items.map((it) => {
          if (it.id === itemId) {
            return {
              id: it.id,
              subject: it.subject || taskItem.subject,
              done: doneBool,
              doneAt: doneBool ? now : (it.doneAt || null),
              actualMinutes: minutes,
            };
          }
          return it;
        });
        // 如果已有 items 中没有这一项，补进去
        if (!items.find((it) => it.id === itemId)) {
          items.push({
            id: itemId,
            subject: taskItem.subject,
            done: doneBool,
            doneAt: doneBool ? now : null,
            actualMinutes: minutes,
          });
        }
      } else {
        // 新建记录：用任务定义初始化所有项，当前项设为目标状态
        items = task.items.map((it) => ({
          id: it.id,
          subject: it.subject,
          done: it.id === itemId ? doneBool : false,
          doneAt: it.id === itemId && doneBool ? now : null,
          actualMinutes: it.id === itemId ? minutes : 0,
        }));
      }

      const completedCount = items.filter((it) => it.done).length;
      const allDone = completedCount === totalItems && totalItems > 0;
      const checked = completedCount > 0;

      const recordData = {
        date,
        taskId,
        totalItems,
        items,
        completedCount,
        checked,
        allDone,
        updatedAt: now,
      };

      let recordId;
      if (existing) {
        recordId = existing._id;
        await db.collection('checkin_records').doc(recordId).update({ data: recordData });
      } else {
        // 获取用户信息
        let userId = '', nickName = '';
        try {
          const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
          const u = userRes.data && userRes.data[0];
          if (u) { userId = u._id; nickName = u.nickName || ''; }
        } catch (e) { /* 忽略 */ }

        const addRes = await db.collection('checkin_records').add({
          data: {
            _openid: openid,
            userId,
            nickName,
            ...recordData,
            sharedAt: null,
            posterSavedAt: null,
            createdAt: now,
          },
        });
        recordId = addRes._id;
      }

      // 计算最新连续天数
      const streakDays = await calcStreak(openid);

      return {
        success: true,
        completedCount,
        allDone,
        streakDays,
        record: { ...recordData, _id: recordId },
      };
    }

    // action: updatePosterSaved —— 回写海报保存时间
    if (action === 'updatePosterSaved') {
      const { date } = event;
      if (!date) return { success: false, error: '缺少日期' };
      const res = await db.collection('checkin_records')
        .where({ _openid: openid, date })
        .limit(1).get();
      const rec = res.data && res.data[0];
      if (!rec) return { success: false, error: '当日无打卡记录' };
      await db.collection('checkin_records').doc(rec._id).update({
        data: { posterSavedAt: new Date() },
      });
      return { success: true };
    }

    // action: updateShared —— 回写分享时间
    if (action === 'updateShared') {
      const { date } = event;
      if (!date) return { success: false, error: '缺少日期' };
      const res = await db.collection('checkin_records')
        .where({ _openid: openid, date })
        .limit(1).get();
      const rec = res.data && res.data[0];
      if (!rec) return { success: false, error: '当日无打卡记录' };
      await db.collection('checkin_records').doc(rec._id).update({
        data: { sharedAt: new Date() },
      });
      return { success: true };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    console.error('[submitCheckin] 失败', e);
    return { success: false, error: e.message || '提交失败' };
  }
};
