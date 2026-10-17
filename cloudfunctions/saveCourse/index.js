// 云函数：saveCourse —— 排课写操作（管理员）
// 支持单节排课（add/update）与循环排课（add + recurring 配置）
// 鉴权：优先 token（Web 端），回退 openid + isAdmin（小程序端）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const common = require('./_common');
const normalizeEvent = common.normalizeEvent;
const authenticate = (event) => common.authenticate(event, db, cloud);
const logAudit = (auth, action, detail) => common.logAudit(db, auth, 'course', action, detail);

/** 生成循环排课列表 */
function generateRecurring(base, recurring) {
  const list = [];
  const startDate = new Date(base.date);
  const { weekdays, weekCount } = recurring;
  const sorted = [...weekdays].sort((a, b) => a - b);

  for (let week = 0; week < weekCount; week++) {
    sorted.forEach((weekday) => {
      const d = new Date(startDate);
      const cur = startDate.getDay();
      const adjustedCur = cur === 0 ? 7 : cur;
      const dayDiff = weekday - adjustedCur + week * 7;
      d.setDate(startDate.getDate() + dayDiff);
      const dateStr =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      list.push({ ...base, date: dateStr, weekNumber: week + 1, weekday });
    });
  }
  return list;
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

    const { action, courseId, course, recurring } = event || {};
    if (!course || !course.date || !course.startTime || !course.endTime) {
      return { success: false, error: '课程信息不完整' };
    }

    // 更新时间戳
    const now = new Date();
    const record = { ...course, _updateTime: now, updatedBy: auth.userId };

    if (action === 'update') {
      if (!courseId) return { success: false, error: '缺少 courseId' };
      await db.collection('courses').doc(courseId).update({ data: record });
      await logAudit(auth, 'course.update', `更新课程：${course.date} ${course.startTime}-${course.endTime}`);
      return { success: true, message: '已更新' };
    }

    if (action === 'add') {
      // 循环排课（分批并行写入，避免串行 N 次往返）
      if (recurring && Array.isArray(recurring.weekdays) && recurring.weekdays.length) {
        const repeatGroupId = `repeat_${Date.now()}`;
        const list = generateRecurring(course, recurring);
        const BATCH = 20; // 每批 20 条，控制在云数据库并发写上限内
        for (let i = 0; i < list.length; i += BATCH) {
          const batch = list.slice(i, i + BATCH);
          await Promise.all(
            batch.map((c) =>
              db.collection('courses').add({
                data: {
                  ...c,
                  _createTime: now,
                  scheduleMode: '循环',
                  repeatGroupId,
                  createdBy: auth.userId,
                },
              })
            )
          );
        }
        await logAudit(auth, 'course.add', `循环排课：${course.date} 起 ${list.length} 节`);
        return { success: true, message: `已创建 ${list.length} 节课程` };
      }

      // 单节排课
      await db.collection('courses').add({
        data: {
          ...record,
          _createTime: now,
          scheduleMode: 'single',
          createdBy: auth.userId,
        },
      });
      await logAudit(auth, 'course.add', `新增课程：${course.date} ${course.startTime}-${course.endTime}`);
      return { success: true, message: '已创建' };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    console.error('[saveCourse] 失败', e);
    return { success: false, error: e.message || '保存失败' };
  }
};
