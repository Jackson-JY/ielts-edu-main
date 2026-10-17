/**
 * 云函数：getMyCheckinStats —— 获取我的打卡统计
 *
 * 返回：
 *   success, streakDays, totalDays, heatmap: [{date, completedCount, totalItems, rate}]
 *
 * heatmap 覆盖近 371 天（53 周×7 天），rate = completedCount/totalItems (0~1)
 * 前端按 rate 着色：0 无色，(0,0.25] 1级，(0.25,0.5] 2级，(0.5,0.75] 3级，(0.75,1] 4级，=1 5级
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { normalizeEvent } = require('./_common');

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

exports.main = async (event) => {
  event = normalizeEvent(event);
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return { success: false, error: '缺少 openid' };

  const DAYS = 371; // 53 周 × 7 天
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (DAYS - 1));

  try {
    // 取近 DAYS 天的打卡记录
    const startStr = formatDate(startDate);
    const res = await db.collection('checkin_records')
      .where({
        _openid: openid,
        date: _.gte(startStr),
      })
      .limit(DAYS)
      .get();

    const records = res.data || [];
    const recordMap = {};
    records.forEach((r) => { recordMap[r.date] = r; });

    // 生成热力图数组
    const heatmap = [];
    let totalDays = 0;
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      const rec = recordMap[dateStr];
      const completedCount = rec ? rec.completedCount || 0 : 0;
      const totalItems = rec ? rec.totalItems || 0 : 0;
      const rate = totalItems > 0 ? completedCount / totalItems : 0;
      heatmap.push({ date: dateStr, completedCount, totalItems, rate });
      if (completedCount > 0) totalDays++;
    }

    // 连续打卡天数
    let streakDays = 0;
    for (let i = DAYS - 1; i >= 0; i--) {
      if (heatmap[i].completedCount > 0) streakDays++;
      else break;
    }

    return {
      success: true,
      streakDays,
      totalDays,
      heatmap,
    };
  } catch (e) {
    // 集合不存在时返回空数据
    if (e.errCode === -502005 || (e.message && e.message.includes('-502005'))) {
      return { success: true, streakDays: 0, totalDays: 0, heatmap: [] };
    }
    console.error('[getMyCheckinStats] 失败', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
