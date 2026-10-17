/**
 * 打卡日历热力图工具（从 profile 页抽取）：色阶 + 月网格构建
 */
const { formatDate } = require('./dateUtil');

/** 热力图色阶：薄荷绿系，与图例 #F2F2F7 → #E6F7F5 → #80DED5 → #12B7A8 → #0E8C81 对齐 */
function getHeatColor(count) {
  if (count === 0) return '#F2F2F7';
  if (count === 1) return '#E6F7F5';
  if (count === 2) return '#80DED5';
  if (count === 3) return '#12B7A8';
  return '#0E8C81';
}

/**
 * 构建某月的日历网格（前置空格 + 当月每天的打卡信息）
 * @param {Object} args
 * @param {number} args.displayedYear
 * @param {number} args.displayedMonth - 0-11
 * @param {number} args.maxYear
 * @param {number} args.maxMonth - 0-11
 * @param {Object} args.dateCountMap - { 'YYYY-MM-DD': 打卡条数 }
 * @param {Array|null} args.checkinRecords - 当月 checkins 原始记录（用于取 types），失败时传 null
 * @param {boolean} args.checkinSuccess - 当月记录查询是否成功
 * @param {Array} args.typeList - 科目类型列表（元素含 id）
 * @param {Date} [args.now] - 当前时间（默认 new Date()）
 * @returns {Array} 日历单元格数组
 */
function buildMonthDays({
  displayedYear,
  displayedMonth,
  maxYear,
  maxMonth,
  dateCountMap,
  checkinRecords,
  checkinSuccess,
  typeList,
  now = new Date(),
}) {
  const isCurrentMonth = displayedYear === maxYear && displayedMonth === maxMonth;
  const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
  const firstDay = new Date(displayedYear, displayedMonth, 1).getDay();
  const today = formatDate(now);

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push({ day: '', isEmpty: true, heatColor: 'transparent', hasCheckin: false, types: [], isToday: false });
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${displayedYear}-${pad2(displayedMonth + 1)}-${pad2(d)}`;
    const date = new Date(displayedYear, displayedMonth, d);
    const isFuture = isCurrentMonth && date > now;
    const count = isFuture ? 0 : (dateCountMap[dateStr] || 0);
    const hasCheckin = count > 0;
    const isToday = dateStr === today;

    let types = [];
    if (hasCheckin && checkinSuccess && checkinRecords) {
      const dayCheckins = checkinRecords.filter(c => c.date === dateStr);
      const allTypes = dayCheckins.flatMap(c => c.types || []);
      const uniqueTypes = [...new Set(allTypes.filter(Boolean))];
      types = uniqueTypes.slice(0, 3).map(tid => typeList.find(t => t.id === tid) || typeList[0]);
    }

    days.push({
      day: d,
      isEmpty: false,
      date: dateStr,
      // 今日无打卡时用 #E6F7F5 高亮；有打卡按热力色阶
      heatColor: isToday && !hasCheckin ? '#E6F7F5' : getHeatColor(count),
      heatCount: count,
      hasCheckin,
      isToday,
      types,
    });
  }

  return days;
}

module.exports = { getHeatColor, buildMonthDays };
