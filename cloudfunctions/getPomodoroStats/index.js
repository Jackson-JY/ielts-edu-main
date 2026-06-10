const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const $ = db.command.aggregate;

/**
 * 获取番茄时钟统计数据（今日 + 历史累计）
 *
 * 设计要点：
 * 1. 用 getWXContext().OPENID 在服务端强制按当前用户过滤，客户端无法越权读他人数据
 * 2. 用聚合（aggregate）在服务端汇总，绕过客户端 .get() 单次最多 20 条的限制，
 *    保证「累计」统计覆盖该用户全部历史记录
 *
 * @param {Object} event
 *   - date: 今日日期字符串 YYYY-MM-DD（由客户端传入，避免时区误差）
 * @returns {Object}
 *   { success, todayPomodoros, todayFocusMinutes, totalPomodoros, totalFocusMinutes }
 */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { date } = event;

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  try {
    // ─── 历史累计（聚合，覆盖全部记录，仅当前用户）───────────────
    // completedPomodoros: 完整番茄计 1，部分专注计 0 → sum 即"累计完成番茄数"
    // totalFocusMinutes: 每条记录的实际专注分钟 → sum 即"累计专注分钟"
    const totalAgg = await db.collection('pomodoro_sessions')
      .aggregate()
      .match({ _openid: openid })
      .group({
        _id: null,
        totalPomodoros: $.sum('$completedPomodoros'),
        totalFocusMinutes: $.sum('$totalFocusMinutes'),
      })
      .end();

    const totalRow = (totalAgg.list && totalAgg.list[0]) || {};
    const totalPomodoros = totalRow.totalPomodoros || 0;
    const totalFocusMinutes = totalRow.totalFocusMinutes || 0;

    // ─── 今日统计（聚合，仅当前用户 + 今日）──────────────────────
    let todayPomodoros = 0;
    let todayFocusMinutes = 0;
    if (date) {
      const todayAgg = await db.collection('pomodoro_sessions')
        .aggregate()
        .match({ _openid: openid, date })
        .group({
          _id: null,
          todayPomodoros: $.sum('$completedPomodoros'),
          todayFocusMinutes: $.sum('$totalFocusMinutes'),
        })
        .end();

      const todayRow = (todayAgg.list && todayAgg.list[0]) || {};
      todayPomodoros = todayRow.todayPomodoros || 0;
      todayFocusMinutes = todayRow.todayFocusMinutes || 0;
    }

    return {
      success: true,
      todayPomodoros,
      todayFocusMinutes,
      totalPomodoros,
      totalFocusMinutes,
    };
  } catch (e) {
    console.error('[getPomodoroStats] 统计失败', e);
    return {
      success: false,
      error: e.message,
      todayPomodoros: 0,
      todayFocusMinutes: 0,
      totalPomodoros: 0,
      totalFocusMinutes: 0,
    };
  }
};
