/**
 * 日期工具函数库
 * @module dateUtil
 */

/**
 * 格式化日期为 YYYY-MM-DD 格式
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期字符串
 */
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 格式化日期为中文格式（如：4月30日）
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期字符串
 */
const formatDateCN = (date) => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};

/**
 * 获取日期的 YYYY-MM-DD 字符串（用于比较）
 * @param {string|Date} date - 日期字符串或对象
 * @returns {string} YYYY-MM-DD 格式字符串
 */
const getDateString = (date) => {
  if (typeof date === 'string') {
    return date.split('T')[0]; // 处理 ISO 格式
  }
  return formatDate(date);
};

/**
 * 获取某月的天数
 * @param {number} year - 年份
 * @param {number} month - 月份（1-12）
 * @returns {number} 该月的天数
 */
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

/**
 * 获取某月第一天是星期几
 * @param {number} year - 年份
 * @param {number} month - 月份（1-12）
 * @returns {number} 星期几（0-6，0表示周日）
 */
const getFirstDayOfMonth = (year, month) => {
  return new Date(year, month - 1, 1).getDay();
};

/**
 * 判断是否为今天
 * @param {string|Date} date - 日期
 * @returns {boolean} 是否为今天
 */
const isToday = (date) => {
  const today = new Date();
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  
  return today.getFullYear() === checkDate.getFullYear() &&
         today.getMonth() === checkDate.getMonth() &&
         today.getDate() === checkDate.getDate();
};

module.exports = {
  formatDate,
  formatDateCN,
  getDateString,
  getDaysInMonth,
  getFirstDayOfMonth,
  isToday
};
