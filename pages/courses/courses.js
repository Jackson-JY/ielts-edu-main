// pages/courses/courses.js
const { formatDate } = require('../../utils/dateUtil');
const cloudDB = require('../../utils/cloudDB');

Page({
  data: {
    viewMode: 'day',
    selectedDate: '',
    selectedDay: null,
    expandedCourse: null,
    homework: {},
    filteredCourses: [],
    weekDays: [],
    monthDays: [],
    dayNames: ['日', '一', '二', '三', '四', '五', '六'],
    dateRangeText: '',
    selectedDateText: '',
    isLoading: false,
    courses: [],
  },

  onLoad() {
    this.initDate();
    this.loadCourses();
  },

  onShow() {},

  initDate() {
    const now = new Date();
    const currentDate = formatDate(now);
    this.setData({
      selectedDate: currentDate,
      selectedDay: now.getDate(),
    });
    this.updateDateRangeText();
    this.updateWeekDays();
    this.updateMonthDays();
  },

  switchViewMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      viewMode: mode,
      selectedDay: null,
    });
    if (mode === 'week') {
      this.updateWeekDays();
    } else if (mode === 'month') {
      this.updateMonthDays();
    }
    this.filterCourses();
  },

  changeDate(e) {
    const direction = parseInt(e.currentTarget.dataset.direction);
    const current = new Date(this.data.selectedDate);
    if (this.data.viewMode === 'day') {
      current.setDate(current.getDate() + direction);
    } else if (this.data.viewMode === 'week') {
      current.setDate(current.getDate() + direction * 7);
    } else {
      current.setMonth(current.getMonth() + direction);
    }
    const newDate = formatDate(current);
    this.setData({
      selectedDate: newDate,
      selectedDay: current.getDate(),
    });
    this.updateDateRangeText();
    this.filterCourses();
    if (this.data.viewMode === 'week') {
      this.updateWeekDays();
    } else if (this.data.viewMode === 'month') {
      this.updateMonthDays();
    }
  },

  updateDateRangeText() {
    const selected = new Date(this.data.selectedDate);
    let dateRangeText = '';
    if (this.data.viewMode === 'day') {
      dateRangeText = `${selected.getMonth() + 1}月${selected.getDate()}日`;
    } else if (this.data.viewMode === 'week') {
      const weekStart = new Date(selected);
      weekStart.setDate(selected.getDate() - selected.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      dateRangeText = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
    } else {
      dateRangeText = `${selected.getFullYear()}年${selected.getMonth() + 1}月`;
    }
    this.setData({ dateRangeText });
  },

  selectDay(e) {
    const day = e.currentTarget.dataset.day;
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({
      selectedDay: day,
      selectedDate: date,
    });
    this.filterCourses();
    this.updateSelectedDateText();
  },

  updateSelectedDateText() {
    if (!this.data.selectedDay) return;
    const selected = new Date(this.data.selectedDate);
    this.setData({ selectedDateText: `${selected.getMonth() + 1}月${selected.getDate()}日` });
  },

  /**
   * 从云数据库加载课程数据
   */
  async loadCourses() {
    this.setData({ isLoading: true });
    try {
      const res = await cloudDB.get('courses');
      if (res.success) {
        this.data.courses = res.data;
      } else {
        this.data.courses = [];
      }
      this.filterCourses();
    } catch (e) {
      console.error('加载课程数据失败', e);
      this.data.courses = [];
      this.filterCourses();
    } finally {
      this.setData({ isLoading: false });
    }
  },

  /**
   * 过滤课程
   * @description 根据当前视图模式和选中日期过滤课程
   */
  filterCourses() {
    const { viewMode, selectedDate, courses } = this.data;
    const selected = new Date(selectedDate);
    let filteredCourses = [];

    if (viewMode === 'day') {
      filteredCourses = courses.filter(course => course.date === selectedDate);
    } else if (viewMode === 'week') {
      const weekStart = new Date(selected);
      weekStart.setDate(selected.getDate() - selected.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      filteredCourses = courses.filter(course => {
        const courseDate = new Date(course.date);
        return courseDate >= weekStart && courseDate < weekEnd;
      });
    } else {
      const year = selected.getFullYear();
      const month = selected.getMonth();
      filteredCourses = courses.filter(course => {
        const courseDate = new Date(course.date);
        return courseDate.getMonth() === month && courseDate.getFullYear() === year;
      });
    }
    this.setData({ filteredCourses });
  },

  updateWeekDays() {
    const selected = new Date(this.data.selectedDate);
    const weekStart = new Date(selected);
    weekStart.setDate(selected.getDate() - selected.getDay());
    const today = formatDate(new Date());
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const dateStr = formatDate(day);
      const courseCount = this.data.courses.filter(c => c.date === dateStr).length;
      weekDays.push({
        day: day.getDate(),
        dayName: this.data.dayNames[i],
        date: dateStr,
        isToday: dateStr === today,
        courseCount,
      });
    }
    this.setData({ weekDays });
  },

  updateMonthDays() {
    const selected = new Date(this.data.selectedDate);
    const year = selected.getFullYear();
    const month = selected.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();
    const today = formatDate(new Date());
    const monthDays = [];
    for (let i = 0; i < startDay; i++) {
      monthDays.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = formatDate(new Date(year, month, i));
      const courseCount = this.data.courses.filter(c => c.date === dateStr).length;
      monthDays.push({
        day: i,
        date: dateStr,
        isToday: dateStr === today,
        courseCount,
      });
    }
    this.setData({ monthDays });
  },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      expandedCourse: this.data.expandedCourse === id ? null : id,
    });
  },

  onHomeworkTitleInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const homework = this.data.homework;
    if (!homework[id]) homework[id] = {};
    homework[id].title = value;
    this.setData({ homework });
  },

  onHomeworkContentInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const homework = this.data.homework;
    if (!homework[id]) homework[id] = {};
    homework[id].content = value;
    this.setData({ homework });
  },

  /**
   * 保存作业到云数据库
   */
  async saveHomework(e) {
    const id = e.currentTarget.dataset.id;
    const homework = this.data.homework[id];

    if (!homework || !homework.title || !homework.content) {
      wx.showToast({ title: '请填写完整的作业信息', icon: 'none' });
      return;
    }

    try {
      const course = this.data.courses.find(c => c._id === id);
      const res = await cloudDB.addMy('homework', {
        courseId: id,
        courseName: course ? course.name : '',
        title: homework.title,
        content: homework.content,
        date: this.data.selectedDate,
        submitted: false,
      });

      if (res.success) {
        wx.showToast({ title: '作业已保存', icon: 'success' });
        this.setData({ expandedCourse: null });
        // 刷新页面数据
        this.loadCourses();
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } catch (err) {
      console.error('保存作业失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  goToTrialBooking() {
    wx.navigateTo({ url: '/pages/trial-booking/trial-booking' });
  },

  onShareAppMessage() {
    return {
      title: '雅思课程安排',
      path: '/pages/courses/courses',
    };
  },
});
