// pages/courses/courses.js
const { formatDate, getDateString } = require('../../utils/dateUtil');

Page({
  data: {
    viewMode: 'day', // 'day', 'week', 'month'
    selectedDate: '', // 当前选中的日期字符串
    selectedDay: null, // 当前选中的天数
    expandedCourse: null, // 当前展开的课程ID
    homework: {}, // 作业数据 { courseId: { title, content } }
    filteredCourses: [], // 过滤后的课程列表
    weekDays: [], // 周视图的日期数组
    monthDays: [], // 月视图的日期数组
    dayNames: ['日', '一', '二', '三', '四', '五', '六'],
    dateRangeText: '', // 日期范围文本
    selectedDateText: '', // 选中日期的文本
    isLoading: false,
    
    // 模拟课程数据
    mockCourses: [
      {
        id: 1,
        name: "雅思词汇精讲",
        time: "09:00-10:00",
        duration: "60分钟",
        status: "已完成",
        date: "2026-04-30",
      },
      {
        id: 2,
        name: "听力技巧训练",
        time: "14:00-15:30",
        duration: "90分钟",
        status: "待上课",
        date: "2026-04-30",
      },
      {
        id: 3,
        name: "口语实战演练",
        time: "10:00-11:30",
        duration: "90分钟",
        status: "待上课",
        date: "2026-05-01",
      },
      {
        id: 4,
        name: "写作技巧提升",
        time: "15:00-16:30",
        duration: "90分钟",
        status: "待上课",
        date: "2026-05-03",
      },
    ],
  },

  onLoad() {
    this.initDate();
    this.loadCourses();
  },

  onShow() {
    // 每次显示页面时刷新数据
  },

  // 初始化日期
  initDate() {
    const now = new Date();
    const currentDate = formatDate(now);
    
    this.setData({
      selectedDate: currentDate,
      selectedDay: now.getDate(),
    });
    
    this.updateDateRangeText();
    this.filterCourses();
    this.updateWeekDays();
    this.updateMonthDays();
  },

  // 切换视图模式
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

  // 切换日期
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

  // 更新日期范围文本
  updateDateRangeText() {
    const selected = new Date(this.data.selectedDate);
    let dateRangeText = '';
    
    if (this.data.viewMode === 'day') {
      const month = selected.getMonth() + 1;
      const day = selected.getDate();
      dateRangeText = `${month}月${day}日`;
    } else if (this.data.viewMode === 'week') {
      const weekStart = new Date(selected);
      weekStart.setDate(selected.getDate() - selected.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const startMonth = weekStart.getMonth() + 1;
      const startDay = weekStart.getDate();
      const endMonth = weekEnd.getMonth() + 1;
      const endDay = weekEnd.getDate();
      
      dateRangeText = `${startMonth}月${startDay}日 - ${endMonth}月${endDay}日`;
    } else {
      const year = selected.getFullYear();
      const month = selected.getMonth() + 1;
      dateRangeText = `${year}年${month}月`;
    }
    
    this.setData({ dateRangeText });
  },

  // 选择日期
  selectDay(e) {
    const day = e.currentTarget.dataset.day;
    const date = e.currentTarget.dataset.date;
    
    if (!date) return; // 防止点击空白日期
    
    this.setData({
      selectedDay: day,
      selectedDate: date,
    });
    
    this.filterCourses();
    this.updateSelectedDateText();
  },

  // 更新选中日期文本
  updateSelectedDateText() {
    if (!this.data.selectedDay) return;
    
    const selected = new Date(this.data.selectedDate);
    const month = selected.getMonth() + 1;
    const day = selected.getDate();
    const dateText = `${month}月${day}日`;
    
    this.setData({ selectedDateText: dateText });
  },

  /**
   * 加载课程数据
   * @description 从服务器加载课程数据
   */
  loadCourses() {
    this.setData({ isLoading: true });
    
    // TODO: 从云数据库加载实际数据
    // 这里使用模拟数据
    setTimeout(() => {
      this.filterCourses();
      this.setData({ isLoading: false });
    }, 500);
  },

  /**
   * 过滤课程
   * @description 根据当前视图模式和选中日期过滤课程
   * ✅ 修复：使用字符串比较代替 toDateString()
   */
  filterCourses() {
    const { viewMode, selectedDate, mockCourses } = this.data;
    const selected = new Date(selectedDate);
    let filteredCourses = [];
    
    if (viewMode === 'day') {
      // ✅ 优化：直接使用 YYYY-MM-DD 字符串比较
      filteredCourses = mockCourses.filter(course => {
        return course.date === selectedDate;
      });
    } else if (viewMode === 'week') {
      const weekStart = new Date(selected);
      weekStart.setDate(selected.getDate() - selected.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      
      filteredCourses = mockCourses.filter(course => {
        const courseDate = new Date(course.date);
        return courseDate >= weekStart && courseDate < weekEnd;
      });
    } else {
      const year = selected.getFullYear();
      const month = selected.getMonth();
      
      filteredCourses = mockCourses.filter(course => {
        const courseDate = new Date(course.date);
        return courseDate.getMonth() === month && courseDate.getFullYear() === year;
      });
    }
    
    this.setData({ filteredCourses });
  },

  // 更新周视图日期
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
      const courseCount = this.data.mockCourses.filter(course => {
        return course.date === dateStr;
      }).length;
      
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

  // 更新月视图日期
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
    
    // 填充前面的空白
    for (let i = 0; i < startDay; i++) {
      monthDays.push(null);
    }
    
    // 填充日期
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = formatDate(new Date(year, month, i));
      const courseCount = this.data.mockCourses.filter(course => {
        return course.date === dateStr;
      }).length;
      
      monthDays.push({
        day: i,
        date: dateStr,
        isToday: dateStr === today,
        courseCount,
      });
    }
    
    this.setData({ monthDays });
  },

  // 展开/折叠课程
  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      expandedCourse: this.data.expandedCourse === id ? null : id,
    });
  },

  // 作业标题输入
  onHomeworkTitleInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    
    const homework = this.data.homework;
    if (!homework[id]) {
      homework[id] = {};
    }
    homework[id].title = value;
    
    this.setData({ homework });
  },

  // 作业内容输入
  onHomeworkContentInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    
    const homework = this.data.homework;
    if (!homework[id]) {
      homework[id] = {};
    }
    homework[id].content = value;
    
    this.setData({ homework });
  },

  // 保存作业
  saveHomework(e) {
    const id = e.currentTarget.dataset.id;
    const homework = this.data.homework[id];
    
    if (!homework || !homework.title || !homework.content) {
      wx.showToast({
        title: '请填写完整的作业信息',
        icon: 'none',
      });
      return;
    }
    
    // TODO: 保存到云数据库
    console.log('保存作业:', id, homework);
    
    wx.showToast({
      title: '作业已保存',
      icon: 'success',
    });
    
    this.setData({
      expandedCourse: null,
    });
  },

  // 跳转到试听预约页
  goToTrialBooking() {
    wx.navigateTo({
      url: '/pages/trial-booking/trial-booking',
    });
  },

  onShareAppMessage() {
    return {
      title: '雅思课程安排',
      path: '/pages/courses/courses',
    };
  },
});
