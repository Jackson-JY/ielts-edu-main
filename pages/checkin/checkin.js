// pages/checkin/checkin.js
const cloudDB = require('../../utils/cloudDB');
const { formatDate } = require('../../utils/dateUtil');
const { calculateStreak } = require('../../utils/checkinUtil');

Page({
  data: {
    currentStreak: 0,
    totalDays: 0,
    achievementCount: 0,
    currentMonth: new Date().getMonth() + 1,
    currentYear: new Date().getFullYear(),
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    todayChecked: false,
    checkinFeed: [],
  },

  onLoad() {
    this.initCalendar();
  },

  onShow() {
    this.checkTodayStatus();
    this.loadStats();
    this.loadFeed();
  },

  initCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    this.setData({ currentYear: year, currentMonth: month });
    this.generateCalendarDays();
    this.checkTodayStatus();
  },

  /**
   * 从云数据库加载打卡记录，生成日历
   */
  async generateCalendarDays() {
    const { currentYear, currentMonth } = this.data;
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();
    const today = new Date();
    const todayStr = today.toDateString();

    // 查询当月打卡数据
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    let checkedDates = [];
    try {
      const db = wx.cloud.database();
      const res = await cloudDB.getMy('checkins', (q) =>
        q.where({
          date: db.command.gte(monthStart).and(db.command.lte(monthEnd)),
        })
      );
      if (res.success) {
        checkedDates = res.data.map(c => c.date);
      }
    } catch (e) {
      // 加载打卡日历失败
    }

    const calendarDays = [];
    for (let i = 0; i < startDay; i++) {
      calendarDays.push({ day: '', isCurrentMonth: false, isToday: false, isChecked: false });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(currentYear, currentMonth - 1, i);
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isToday = date.toDateString() === todayStr;
      const isChecked = checkedDates.includes(dateStr);
      calendarDays.push({ day: i, isCurrentMonth: true, isToday, isChecked });
    }

    this.setData({ calendarDays });
  },

  /**
   * 检查今日打卡状态
   */
  async checkTodayStatus() {
    const today = formatDate(new Date());
    try {
      const res = await cloudDB.getMy('checkins', (q) =>
        q.where({ date: today })
      );
      const todayChecked = res.success && res.data.length > 0;
      this.setData({ todayChecked });
    } catch (e) {
      console.error('检查今日打卡状态失败', e);
    }
  },

  /**
   * 加载打卡统计数据
   */
  async loadStats() {
    try {
      const res = await cloudDB.getMy('checkins');
      const totalDays = res.success ? res.data.length : 0;

      // 计算连续打卡
      let currentStreak = 0;
      if (res.success && res.data.length > 0) {
        const dates = res.data.map(c => c.date);
        currentStreak = calculateStreak(dates);
      }

      // 简单计算成就数（每7天连续获得1个）
      const achievementCount = Math.floor(currentStreak / 7);

      this.setData({ currentStreak, totalDays, achievementCount });
    } catch (e) {
      console.error('加载统计数据失败', e);
    }
  },

  /**
   * 加载打卡动态
   */
  async loadFeed() {
    try {
      const res = await cloudDB.get('checkins', (q) =>
        q.orderBy('_createTime', 'desc').limit(10)
      );
      if (res.success) {
        // 格式化动态数据
        const feed = res.data.map(c => ({
          avatar: c._userId ? c._userId.slice(-2) : '??',
          name: c.userName || `用户${(c._userId || '?').slice(-4)}`,
          text: c.content || '完成了打卡',
          time: this.getRelativeTime(c._createTime),
          types: c.types || [],
        }));
        this.setData({ checkinFeed: feed });
      }
    } catch (e) {
      console.error('加载打卡动态失败', e);
    }
  },

  getRelativeTime(date) {
    if (!date) return '';
    const now = Date.now();
    const diff = now - (date.getTime ? date.getTime() : new Date(date).getTime());
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return `${Math.floor(days / 7)}周前`;
  },

  prevMonth() {
    let { currentMonth, currentYear } = this.data;
    if (currentMonth === 1) { currentMonth = 12; currentYear -= 1; }
    else { currentMonth -= 1; }
    this.setData({ currentMonth, currentYear });
    this.generateCalendarDays();
  },

  nextMonth() {
    let { currentMonth, currentYear } = this.data;
    if (currentMonth === 12) { currentMonth = 1; currentYear += 1; }
    else { currentMonth += 1; }
    this.setData({ currentMonth, currentYear });
    this.generateCalendarDays();
  },

  /**
   * 执行打卡
   */
  async doCheckin() {
    if (this.data.todayChecked) {
      wx.showToast({ title: '今日已打卡', icon: 'none' });
      return;
    }

    try {
      const today = formatDate(new Date());
      const res = await cloudDB.addMy('checkins', {
        date: today,
        types: ['checkin'],
        content: '完成打卡',
      });

      if (res.success) {
        this.setData({ todayChecked: true });
        await Promise.all([this.generateCalendarDays(), this.loadStats(), this.loadFeed()]);
        wx.showToast({ title: '打卡成功！', icon: 'success' });
      } else {
        wx.showToast({ title: '打卡失败', icon: 'none' });
      }
    } catch (e) {
      console.error('打卡失败', e);
      wx.showToast({ title: '打卡失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    return { title: '我已坚持打卡，一起来学习吧！', path: '/pages/checkin/checkin' };
  },
});
