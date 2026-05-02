// pages/homework/homework.js - 打卡记录页面逻辑
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

Page({
  data: {
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

    streakDays: 0,
    weekCheckin: 0,
    monthCheckin: 0,

    displayedYear: new Date().getFullYear(),
    displayedMonth: new Date().getMonth(),
    maxYear: new Date().getFullYear(),
    maxMonth: new Date().getMonth(),
    monthLabel: '',
    canGoNext: false,

    dayLabels: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    checkinList: [],
    // 云存储图标（使用临时 URL）
    iconSettings: '',
    iconPlus: '',
  },

  async onLoad() {
    await this.loadImageUrls();
    this.updateMonthLabel();
    this.initCalendar();
    this.loadStats();
    this.loadCheckinList();
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [CLOUD_IMAGES.iconSettings, CLOUD_IMAGES.iconPlus];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconSettings: urlMap[CLOUD_IMAGES.iconSettings] || '',
        iconPlus: urlMap[CLOUD_IMAGES.iconPlus] || '',
      });
    } catch (e) {
      console.error('[作业页] 加载图片 URL 失败', e);
    }
  },

  updateMonthLabel() {
    const { displayedYear, displayedMonth } = this.data;
    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    this.setData({
      monthLabel: `${displayedYear}年${monthNames[displayedMonth]}`,
      canGoNext: displayedYear < this.data.maxYear || (displayedYear === this.data.maxYear && displayedMonth < this.data.maxMonth),
    });
  },

  prevMonth() {
    let { displayedYear, displayedMonth } = this.data;
    if (displayedMonth === 0) { displayedMonth = 11; displayedYear--; }
    else { displayedMonth--; }
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

  /**
   * 加载打卡统计数据（从云数据库）
   */
  async loadStats() {
    try {
      const today = this.formatDate(new Date());
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = this.formatDate(weekStart);
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartStr = this.formatDate(monthStart);

      const [myCheckins, allCheckins] = await Promise.all([
        cloudDB.getMy('checkins'),
        cloudDB.get('checkins'),
      ]);

      let streakDays = 0, weekCheckin = 0, monthCheckin = 0;
      const myDates = myCheckins.success ? myCheckins.data.map(c => c.date) : [];

      // 计算连续打卡
      if (myCheckins.success && myCheckins.data.length > 0) {
        const sorted = [...myDates].sort().reverse();
        let checkDate = new Date(today);
        for (const d of sorted) {
          const expected = this.formatDate(checkDate);
          if (d === expected) {
            streakDays++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      // 本周打卡数
      if (myCheckins.success) {
        weekCheckin = myCheckins.data.filter(c => c.date >= weekStartStr).length;
        monthCheckin = myCheckins.data.filter(c => c.date >= monthStartStr).length;
      }

      this.setData({ streakDays, weekCheckin, monthCheckin });
    } catch (e) {
      console.error('加载统计数据失败', e);
    }
  },

  /**
   * 初始化日历（从云数据库加载热力数据）
   */
  async initCalendar() {
    const now = new Date();
    const { displayedYear, displayedMonth, maxYear, maxMonth } = this.data;
    const isCurrentMonth = displayedYear === maxYear && displayedMonth === maxMonth;
    const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
    const firstDay = new Date(displayedYear, displayedMonth, 1).getDay();

    // 查询当月所有打卡数据
    const monthStart = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    let dateCountMap = {};
    try {
      const res = await cloudDB.getMy('checkins', (q) =>
        q.where({
          date: wx.cloud.database().command.gte(monthStart),
        }).orderBy('date', 'asc')
      );
      if (res.success && res.data.length > 0) {
        res.data.forEach(c => {
          dateCountMap[c.date] = (dateCountMap[c.date] || 0) + 1;
        });
      }
    } catch (e) {
      console.error('加载日历数据失败', e);
    }

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: '', isEmpty: true, heatColor: 'transparent', hasCheckin: false, types: [] });
    }

    const today = this.formatDate(now);
    const typeList = this.data.checkinTypes;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const date = new Date(displayedYear, displayedMonth, d);
      const isFuture = isCurrentMonth && date > now;
      const count = isFuture ? 0 : (dateCountMap[dateStr] || 0);
      const hasCheckin = count > 0;

      // 获取该日期的打卡类型（最多取3个）
      let types = [];
      if (hasCheckin && res && res.success) {
        const dayCheckins = res.data.filter(c => c.date === dateStr);
        const uniqueTypes = [...new Set(dayCheckins.map(c => c.type).filter(Boolean))];
        types = uniqueTypes.slice(0, 3).map(tid => typeList.find(t => t.id === tid) || typeList[0]);
      }

      days.push({
        day: d,
        isEmpty: false,
        date: dateStr,
        heatColor: this.getHeatColor(count),
        heatCount: count,
        hasCheckin,
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

  onTapCalendarCell(e) {
    const { date, count } = e.currentTarget.dataset;
    if (!date) return;
    wx.showToast({ title: `${date}: ${count}次打卡`, icon: 'none', duration: 1200 });
  },

  /**
   * 从云数据库加载打卡列表
   */
  async loadCheckinList() {
    try {
      const res = await cloudDB.getMy('checkins', (q) => q.orderBy('_createTime', 'desc').limit(20));
      if (res.success) {
        const list = res.data.map(c => ({
          id: c._id,
          date: c.date,
          types: c.types || [],
          content: c.content || '',
        }));
        this.setData({ checkinList: list });
      }
    } catch (e) {
      console.error('加载打卡列表失败', e);
    }
  },

  showCheckinForm() { this.setData({ showForm: true }); },
  hideCheckinForm() { this.setData({ showForm: false, selectedTypes: [], checkinContent: '' }); },
  preventBubble() {},

  toggleType(e) {
    const id = e.currentTarget.dataset.id;
    let selected = this.data.selectedTypes.slice();
    const idx = selected.indexOf(id);
    if (idx > -1) selected.splice(idx, 1);
    else selected.push(id);
    this.setData({ selectedTypes: selected });
  },

  onContentInput(e) { this.setData({ checkinContent: e.detail.value }); },

  /**
   * 提交打卡（保存到云数据库）
   */
  async submitCheckin() {
    const { selectedTypes, checkinContent, checkinTypes } = this.data;
    if (selectedTypes.length === 0) {
      wx.showToast({ title: '请选择打卡类型', icon: 'none' });
      return;
    }
    if (!checkinContent.trim()) {
      wx.showToast({ title: '请输入打卡内容', icon: 'none' });
      return;
    }

    const now = new Date();
    const typeObjs = selectedTypes.map(id => checkinTypes.find(t => t.id === id));

    try {
      const res = await cloudDB.addMy('checkins', {
        date: this.formatDate(now),
        types: selectedTypes,
        content: checkinContent,
      });

      if (res.success) {
        // 刷新列表和统计
        await Promise.all([this.loadCheckinList(), this.loadStats(), this.initCalendar()]);
        this.setData({
          showForm: false,
          selectedTypes: [],
          checkinContent: '',
        });
        wx.vibrateShort({ type: 'medium' });
        wx.showToast({ title: '打卡成功！', icon: 'success' });
      } else {
        wx.showToast({ title: '打卡失败', icon: 'none' });
      }
    } catch (e) {
      console.error('打卡失败', e);
      wx.showToast({ title: '打卡失败', icon: 'none' });
    }
  },

  onSettings() {
    wx.showToast({ title: '设置功能开发中', icon: 'none' });
  },
});
