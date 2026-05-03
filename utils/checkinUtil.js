/**
 * 打卡工具函数
 * 统一管理打卡相关的计算逻辑
 */

const { formatDate } = require('./dateUtil');

/**
 * 计算连续打卡天数
 * @param {string[]} dates - 打卡日期数组 ['2024-01-01', '2024-01-02', ...]
 * @param {string|Date} fromDate - 起始日期，默认为今天
 * @returns {number} 连续打卡天数
 */
function calculateStreak(dates, fromDate = new Date()) {
  if (!dates || dates.length === 0) return 0;
  
  // 去重并按日期倒序排列
  const uniqueDates = [...new Set(dates)].sort().reverse();
  
  const todayStr = typeof fromDate === 'string' ? fromDate : formatDate(fromDate);
  let checkDate = new Date(todayStr);
  let streak = 0;
  
  for (const d of uniqueDates) {
    const expected = formatDate(checkDate);
    if (d === expected) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (d < expected) {
      // 如果比预期日期小但还没断开，说明中间有断层
      break;
    }
  }
  
  return streak;
}

/**
 * 计算本周打卡天数
 * @param {string[]} dates - 打卡日期数组
 * @param {Date} referenceDate - 参照日期，默认为今天
 * @returns {number} 本周打卡天数
 */
function calculateWeekCheckins(dates, referenceDate = new Date()) {
  if (!dates || dates.length === 0) return 0;
  
  // 计算本周一
  const weekStart = new Date(referenceDate);
  const dayOfWeek = weekStart.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysFromMonday);
  const weekStartStr = formatDate(weekStart);
  const todayStr = formatDate(referenceDate);
  
  const uniqueDates = [...new Set(dates)];
  return uniqueDates.filter(d => d >= weekStartStr && d <= todayStr).length;
}

/**
 * 计算本月打卡天数
 * @param {string[]} dates - 打卡日期数组
 * @param {Date} referenceDate - 参照日期，默认为今天
 * @returns {number} 本月打卡天数
 */
function calculateMonthCheckins(dates, referenceDate = new Date()) {
  if (!dates || dates.length === 0) return 0;
  
  const monthStart = formatDate(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1));
  const todayStr = formatDate(referenceDate);
  
  const uniqueDates = [...new Set(dates)];
  return uniqueDates.filter(d => d >= monthStart && d <= todayStr).length;
}

module.exports = {
  calculateStreak,
  calculateWeekCheckins,
  calculateMonthCheckins,
};
