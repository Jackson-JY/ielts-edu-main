// pages/homework/homework.js - 打卡记录页面逻辑
Page({
  data: {
    // 打卡类型
    checkinTypes: [
      { id: 'listening', label: '听力', color: '#A7FBF5' },
      { id: 'speaking',  label: '口语', color: '#E8D4F8' },
      { id: 'reading',   label: '阅读', color: '#FFD4B8' },
      { id: 'writing',   label: '写作', color: '#FFE8F0' },
      { id: 'homework',  label: '作业', color: '#D4E8FF' },
    ],
    selectedTypes: [],
    checkinContent: '',
    showForm: false,

    // 统计
    streakDays: 7,
    weekCheckin: 5,
    monthCheckin: 22,

    // 月份选择
    displayedYear: 2026,
    displayedMonth: 3, // 0-indexed，默认4月
    maxYear: 2026,
    maxMonth: 3,
    monthLabel: '2026年4月',
    canGoNext: false,

    // 日历（含热力背景色）
    dayLabels: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],

    // 打卡列表
    checkinList: [],
  },

  onLoad() {
    const now = new Date();
    this.setData({
      displayedYear: now.getFullYear(),
      displayedMonth: now.getMonth(),
      maxYear: now.getFullYear(),
      maxMonth: now.getMonth(),
    });
    this.updateMonthLabel();
    this.initCalendar();
    this.loadCheckinList();
  },

  // 更新月份标签
  updateMonthLabel() {
    const { displayedYear, displayedMonth } = this.data;
    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    this.setData({
      monthLabel: `${displayedYear}年${monthNames[displayedMonth]}`,
      canGoNext: displayedYear < this.data.maxYear || (displayedYear === this.data.maxYear && displayedMonth < this.data.maxMonth),
    });
  },

  /* ===== 月份切换 ===== */
  prevMonth() {
    let { displayedYear, displayedMonth } = this.data;
    if (displayedMonth === 0) {
      displayedMonth = 11;
      displayedYear--;
    } else {
      displayedMonth--;
    }
    this.setData({ displayedYear, displayedMonth });
    this.updateMonthLabel();
    this.initCalendar();
  },

  nextMonth() {
    const { displayedYear, displayedMonth, maxYear, maxMonth } = this.data;
    if (displayedYear > maxYear || (displayedYear === maxYear && displayedMonth >= maxMonth)) return;
    let y = displayedYear, m = displayedMonth;
    if (m === 11) { m = 0; y++; } else { m++; }
    this.setData({ displayedYear: y, displayedMonth: m });
    this.updateMonthLabel();
    this.initCalendar();
  },

  /* ===== 日历 + 热力图合并 ===== */
  initCalendar() {
    const now = new Date();
    const { displayedYear, displayedMonth, maxYear, maxMonth } = this.data;
    const isCurrentMonth = displayedYear === maxYear && displayedMonth === maxMonth;
    const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
    const firstDay = new Date(displayedYear, displayedMonth, 1).getDay();

    // —— 1. 生成每一天的热力颜色 ——
    const dateColorMap = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(displayedYear, displayedMonth, d);
      const dateStr = this.formatDate(date);
      const isFuture = isCurrentMonth && date > now;
      const daysFromNow = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      let count = 0;
      if (!isFuture) {
        if (daysFromNow <= 2) {
          count = Math.random() > 0.2 ? Math.floor(Math.random() * 4) + 1 : 0;
        } else if (daysFromNow <= 7) {
          count = Math.random() > 0.3 ? Math.floor(Math.random() * 4) + 1 : 0;
        } else if (daysFromNow <= 30) {
          count = Math.random() > 0.4 ? Math.floor(Math.random() * 3) + 1 : 0;
        } else {
          count = Math.random() > 0.6 ? Math.floor(Math.random() * 2) : 0;
        }
      }
      dateColorMap[dateStr] = { color: this.getHeatColor(count), count };
    }

    // —— 2. 构建日历格子数据 ——
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: '', isEmpty: true, heatColor: 'transparent', hasCheckin: false, types: [] });
    }
    const typeList = this.data.checkinTypes;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(displayedYear, displayedMonth, d);
      const dateStr = this.formatDate(date);
      const heat = dateColorMap[dateStr] || { color: '#FFF9F5', count: 0 };
      const has = heat.count > 0;
      const n = has ? (Math.random() > 0.3 ? Math.floor(Math.random() * 3) + 1 : 0) : 0;
      const types = [];
      for (let t = 0; t < n; t++) {
        types.push(typeList[Math.floor(Math.random() * typeList.length)]);
      }
      days.push({
        day: d,
        isEmpty: false,
        date: dateStr,
        heatColor: heat.color,
        heatCount: heat.count,
        hasCheckin: has,
        types,
      });
    }
    this.setData({ calendarDays: days });
  },

  getHeatColor(count) {
    if (count === 0) return '#FFF9F5';
    if (count === 1) return 'rgba(167,251,245,0.2)';
    if (count === 2) return 'rgba(167,251,245,0.5)';
    if (count === 3) return 'rgba(167,251,245,0.75)';
    return '#A7FBF5';
  },

  formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  // 点击日历格子：显示热力提示
  onTapCalendarCell(e) {
    const { date, count } = e.currentTarget.dataset;
    if (!date) return;
    wx.showToast({ title: `${date}: ${count}次打卡`, icon: 'none', duration: 1200 });
  },

  /* ===== 打卡列表 ===== */
  loadCheckinList() {
    const typeList = this.data.checkinTypes;
    const list = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const n = Math.floor(Math.random() * 3) + 1;
      const types = [];
      for (let t = 0; t < n; t++) {
        types.push(typeList[Math.floor(Math.random() * typeList.length)]);
      }
      list.push({
        id: i,
        day: d.getDate(),
        month: d.getMonth() + 1,
        types,
        content: '今天学习了雅思听力Section 3，重点练习了选择题的定位技巧，感觉进步很大！',
      });
    }
    this.setData({ checkinList: list });
  },

  /* ===== 打卡表单 ===== */
  showCheckinForm() {
    this.setData({ showForm: true });
  },

  hideCheckinForm() {
    this.setData({ showForm: false, selectedTypes: [], checkinContent: '' });
  },

  preventBubble() {},

  toggleType(e) {
    const id = e.currentTarget.dataset.id;
    let selected = this.data.selectedTypes.slice();
    const idx = selected.indexOf(id);
    if (idx > -1) {
      selected.splice(idx, 1);
    } else {
      selected.push(id);
    }
    this.setData({ selectedTypes: selected });
  },

  onContentInput(e) {
    this.setData({ checkinContent: e.detail.value });
  },

  submitCheckin() {
    const { selectedTypes, checkinContent, checkinTypes } = this.data;
    if (selectedTypes.length === 0) {
      wx.showToast({ title: '请选择打卡类型', icon: 'none' });
      return;
    }
    if (!checkinContent.trim()) {
      wx.showToast({ title: '请输入打卡内容', icon: 'none' });
      return;
    }

    // 提交打卡（模拟）
    const now = new Date();
    const typeObjs = selectedTypes.map(id => checkinTypes.find(t => t.id === id));
    const newItem = {
      id: Date.now(),
      day: now.getDate(),
      month: now.getMonth() + 1,
      types: typeObjs,
      content: checkinContent,
    };

    const list = [newItem, ...this.data.checkinList];
    const streak = this.data.streakDays + 1;

    this.setData({
      checkinList: list,
      showForm: false,
      selectedTypes: [],
      checkinContent: '',
      streakDays: streak,
      weekCheckin: Math.min(this.data.weekCheckin + 1, 7),
      monthCheckin: Math.min(this.data.monthCheckin + 1, 30),
    });

    wx.vibrateShort({ type: 'medium' });
    wx.showToast({ title: '打卡成功！', icon: 'success' });
  },

  /* ===== 设置 ===== */
  onSettings() {
    wx.showToast({ title: '设置功能开发中', icon: 'none' });
  },
});
