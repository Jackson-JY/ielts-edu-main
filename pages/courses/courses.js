// pages/courses/courses.js
const { formatDate } = require('../../utils/dateUtil');
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

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
    // 课程类型图标
    iconSpeaking: '',
    iconListening: '',
    iconReading: '',
    iconWriting: '',
    iconBook: '',
  },

  onLoad() {
    this.initDate();
    this.loadImageUrls();
    this.loadCourses();
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconPen,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconSpeaking: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconListening: urlMap[CLOUD_IMAGES.iconHeadphones] || '',
        iconReading: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconWriting: urlMap[CLOUD_IMAGES.iconPen] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
      });
    } catch (e) {
      console.error('[课程页] 加载图片 URL 失败', e);
    }
  },

  /**
   * 获取课程类型图标
   */
  getCourseTypeIcon(type) {
    const typeMap = {
      'speaking': this.data.iconSpeaking,
      'listening': this.data.iconListening,
      'reading': this.data.iconReading,
      'writing': this.data.iconWriting,
    };
    return typeMap[type] || '';
  },

  onShow() {
    this.loadCourses();
  },

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
    const now = new Date();
    // 切换到周/月视图时，默认选择当前日期
    this.setData({
      viewMode: mode,
      selectedDate: formatDate(now),
      selectedDay: now.getDate(),
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
   * 从云数据库加载当前用户的课程数据
   */
  async loadCourses() {
    this.setData({ isLoading: true });
    try {
      const res = await cloudDB.getMy('courses');
      let courses = [];
      if (res.success) {
        courses = res.data;
      }
      // 根据当前时间计算课程状态
      courses = courses.map(course => ({
        ...course,
        status: this.isCourseCompleted(course.date, course.endTime) ? '已完成' : '待上课'
      }));
      this.setData({ courses }, () => {
        this.filterCourses();
      });
    } catch (e) {
      console.error('加载课程数据失败', e);
      this.setData({ courses: [] }, () => {
        this.filterCourses();
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  /**
   * 判断课程是否已完成（根据结束时间）
   * @param {string} date - 课程日期 YYYY-MM-DD
   * @param {string} endTime - 结束时间 HH:mm
   * @returns {boolean}
   */
  isCourseCompleted(date, endTime) {
    if (!date || !endTime) return false;
    const now = new Date();
    const [year, month, day] = date.split('-');
    const [hour, minute] = endTime.split(':');
    const courseEndTime = new Date(year, month - 1, day, hour, minute);
    return now > courseEndTime;
  },

  /**
   * 过滤课程
   * @description 根据当前视图模式和选中日期过滤课程
   */
  filterCourses() {
    const { selectedDate, courses } = this.data;
    // 所有视图都只展示选中日期的课程
    const filteredCourses = courses.filter(course => course.date === selectedDate);
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
    const newExpandedCourse = this.data.expandedCourse === id ? null : id;
    
    // 如果是展开，则为该课程的作业添加 subjectLabel
    if (newExpandedCourse) {
      const homework = { ...this.data.homework };
      const course = this.data.courses.find(c => c._id === id);
      if (course && !homework[id]?.subjectLabel) {
        const subjectLabel = this.getSubjectLabel(homework[id]?.subject || course.subject);
        homework[id] = { ...homework[id], subjectLabel };
        this.setData({ expandedCourse: newExpandedCourse, homework });
        return;
      }
    }
    
    this.setData({
      expandedCourse: newExpandedCourse,
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
   * 作业截止时间选择
   */
  onHomeworkDeadlineChange(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const homework = this.data.homework;
    if (!homework[id]) homework[id] = {};
    homework[id].deadline = value;
    this.setData({ homework });
  },

  /**
   * 作业科目选择
   */
  onHomeworkSubjectChange(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const homework = this.data.homework;
    if (!homework[id]) homework[id] = {};
    const subjects = ['听力', '阅读', '写作', '口语'];
    homework[id].subject = subjects[value];
    this.setData({ homework });
  },

  /**
   * 作业描述输入
   */
  onHomeworkDescriptionInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const homework = this.data.homework;
    if (!homework[id]) homework[id] = {};
    homework[id].description = value;
    this.setData({ homework });
  },

  /**
   * 获取科目显示标签（与 homework.js 保持一致）
   */
  getSubjectLabel(subject) {
    const labelMap = {
      'listening': '听力',
      'reading': '阅读',
      'writing': '写作',
      'speaking': '口语',
      '听力': '听力',
      '阅读': '阅读',
      '写作': '写作',
      '口语': '口语',
    };
    return labelMap[subject] || subject || '阅读';
  },

  /**
   * 获取课程类型对应的科目
   */
  getSubjectFromCourseType(courseType) {
    return this.getSubjectLabel(courseType);
  },

  /**
   * 保存作业到云数据库
   * 适配统一的 homework 表结构
   */
  async saveHomework(e) {
    const id = e.currentTarget.dataset.id;
    const homework = this.data.homework[id];

    if (!homework || !homework.title) {
      wx.showToast({ title: '请填写作业标题', icon: 'none' });
      return;
    }

    try {
      const course = this.data.courses.find(c => c._id === id);
      
      // 构建作业数据，适配统一表结构
      const homeworkData = {
        // 关联信息
        courseId: id,
        courseName: course ? course.title : '',
        
        // 基础信息
        title: homework.title,
        description: homework.description || homework.content || '',
        content: homework.content || '',
        
        // 科目（优先使用选择的，否则根据课程类型）
        subject: homework.subject || this.getSubjectFromCourseType(course?.type),
        
        // 截止时间
        deadline: homework.deadline ? new Date(homework.deadline) : null,
        
        // 状态
        status: 'pending',
        submitted: false,
        
        // 布置时间
        assignedAt: new Date(),
        date: this.data.selectedDate,
      };

      const res = await cloudDB.addMy('homework', homeworkData);

      if (res.success) {
        wx.showToast({ title: '作业已保存', icon: 'success' });
        // 清空当前课程的作业表单
        const newHomework = { ...this.data.homework };
        delete newHomework[id];
        this.setData({ 
          expandedCourse: null,
          homework: newHomework
        });
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
