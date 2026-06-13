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
    // 是否为管理员
    isAdmin: false,
    // 学生名称映射（管理员：_id -> 昵称）
    studentNameMap: {},
    // 当前登录用户昵称（学生本人视角展示自己的昵称）
    currentUserName: '',
    // 自定义成功提示（替代原生 toast，风格统一）
    showSuccessToast: false,
    successToastText: '',
  },

  /** 展示自定义成功提示，自动消失 */
  popSuccessToast(text) {
    this.setData({ successToastText: text, showSuccessToast: true });
    clearTimeout(this._successToastTimer);
    this._successToastTimer = setTimeout(() => {
      this.setData({ showSuccessToast: false });
    }, 1600);
  },

  onLoad() {
    this.initDate();
    this.loadImageUrls();
    this.checkAdminAndLoad();
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

  /**
   * 检查管理员身份并加载数据
   */
  checkAdminAndLoad() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    const isAdmin = userInfo && userInfo.isAdmin === true;
    const currentUserName = (userInfo && userInfo.nickName) || '';
    this.setData({ isAdmin, currentUserName }, () => {
      this.loadCourses();
      if (isAdmin) {
        this.loadStudentNames();
      }
    });
  },

  /**
   * 加载学生名称映射（管理员使用）
   */
  async loadStudentNames() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllUsers',
      });

      if (res.result && res.result.success) {
        const studentNameMap = {};
        (res.result.data || []).forEach(user => {
          studentNameMap[user._id] = user.nickName || '未命名用户';
        });
        this.setData({ studentNameMap }, () => {
          // 名单到达后，回填已加载课程的学生昵称并刷新列表（规避异步竞态）
          if (this.data.isAdmin && this.data.courses.length > 0) {
            const courses = this.data.courses.map(c => ({
              ...c,
              studentName: studentNameMap[c.studentId] || c.studentName || '',
            }));
            this.setData({ courses }, () => this.filterCourses());
          }
        });
      }
    } catch (e) {
      console.error('加载学生名称映射失败', e);
    }
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
   * 从云数据库加载课程数据
   * @description 管理员加载所有课程，普通用户只加载自己的课程
   */
  async loadCourses() {
    this.setData({ isLoading: true });
    try {
      const app = getApp();
      const userInfo = app.globalData.userInfo;
      const userId = userInfo && userInfo.userId;
      const isAdmin = userInfo && userInfo.isAdmin === true;

      // 如果用户未登录，返回空数据
      if (!userId && !isAdmin) {
        this.setData({ courses: [] }, () => {
          this.filterCourses();
        });
        return;
      }

      let courses = [];

      if (isAdmin) {
        // 管理员：使用云函数获取所有课程
        courses = await this.loadAllCoursesAdmin();
      } else {
        // 普通用户：查询自己的课程（通过 studentId 关联）
        const res = await cloudDB.get('courses', (dbQuery) => {
          return dbQuery.where({
            studentId: userId
          }).orderBy('date', 'asc').orderBy('startTime', 'asc');
        });

        if (res.success) {
          courses = res.data;
        }
      }

      // 根据当前时间计算课程状态，并补全学生昵称
      // 管理员：按 studentId 查名单映射；学生本人：展示自己的昵称
      courses = courses.map(course => ({
        ...course,
        status: this.isCourseCompleted(course.date, course.endTime) ? '已完成' : '待上课',
        studentName: isAdmin
          ? (this.data.studentNameMap[course.studentId] || '')
          : (this.data.currentUserName || ''),
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
   * 管理员加载所有课程（分页获取）
   */
  async loadAllCoursesAdmin() {
    try {
      let allData = [];
      let skip = 0;
      const pageSize = 500;
      let hasMore = true;

      while (hasMore) {
        const res = await wx.cloud.callFunction({
          name: 'getCourses',
          data: {
            startDate: '2020-01-01', // 获取所有历史课程
            endDate: '2099-12-31',
            skip,
            limit: pageSize,
          }
        });

        if (res.result && res.result.success) {
          const list = res.result.data || [];
          allData = allData.concat(list);
          skip += pageSize;
          hasMore = list.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allData;
    } catch (e) {
      console.error('管理员加载课程失败', e);
      return [];
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
    
    // 如果是展开，则加载该课程的作业数据
    if (newExpandedCourse) {
      this.loadHomeworkForCourse(id);
      return;
    }
    
    this.setData({
      expandedCourse: newExpandedCourse,
    });
  },

  /**
   * 展开课程时初始化作业录入表单
   * 新交互：一个课程可一次添加多条作业项，每条 = { 作业内容, 预估完成时间(分钟) }
   * 科目沿用课程科目，不再单独填写截止时间/描述
   */
  loadHomeworkForCourse(courseId) {
    const course = this.data.courses.find(c => c._id === courseId);
    const homework = { ...this.data.homework };

    // 保留已在编辑中的表单；首次展开则初始化一条空作业项
    if (!homework[courseId] || !homework[courseId].items || homework[courseId].items.length === 0) {
      homework[courseId] = {
        subject: course?.subject || '阅读',
        subjectLabel: this.getSubjectLabel(course?.subject),
        items: [{ content: '', estimatedTime: '' }],
      };
    }

    this.setData({ expandedCourse: courseId, homework });
  },

  /** 作业项 - 内容输入 */
  onHomeworkItemContentInput(e) {
    const { id, index } = e.currentTarget.dataset;
    this.setData({ [`homework.${id}.items[${Number(index)}].content`]: e.detail.value });
  },

  /** 作业项 - 预估完成时间输入（分钟） */
  onHomeworkItemTimeInput(e) {
    const { id, index } = e.currentTarget.dataset;
    this.setData({ [`homework.${id}.items[${Number(index)}].estimatedTime`]: e.detail.value });
  },

  /** 继续添加一条空作业项 */
  addHomeworkItem(e) {
    const { id } = e.currentTarget.dataset;
    const items = (this.data.homework[id].items || []).concat([{ content: '', estimatedTime: '' }]);
    this.setData({ [`homework.${id}.items`]: items });
  },

  /** 删除某条作业项 */
  removeHomeworkItem(e) {
    const { id, index } = e.currentTarget.dataset;
    const idx = Number(index);
    const items = (this.data.homework[id].items || []).filter((_, i) => i !== idx);
    // 至少保留一条
    this.setData({ [`homework.${id}.items`]: items.length ? items : [{ content: '', estimatedTime: '' }] });
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
   * 保存作业到云数据库
   * 适配统一的 homework 表结构
   */
  async saveHomework(e) {
    const id = e.currentTarget.dataset.id;
    const formData = this.data.homework[id];

    // 过滤出有内容的作业项（空行忽略）
    const validItems = (formData && formData.items || []).filter(it => (it.content || '').trim());
    if (validItems.length === 0) {
      wx.showToast({ title: '请至少填写一条作业内容', icon: 'none' });
      return;
    }

    try {
      const course = this.data.courses.find(c => c._id === id);
      const subjectLabel = formData.subjectLabel || this.getSubjectLabel(course?.subject);

      // 多条作业项并行写入，每条一条 homework 记录
      const ops = validItems.map((it) => {
        const content = it.content.trim();
        return cloudDB.addMy('homework', {
          courseId: id,
          courseName: course ? course.title : '',
          // 标题按科目自动生成（兼容旧结构），作业内容即描述
          title: `${subjectLabel}作业`,
          description: content,
          content,
          subject: subjectLabel,
          // 预估完成时间（分钟）
          estimatedTime: parseInt(it.estimatedTime) || 0,
          status: 'pending',
          submitted: false,
          assignedAt: new Date(),
          date: this.data.selectedDate,
        });
      });

      const results = await Promise.all(ops);
      const okCount = results.filter(r => r && r.success).length;

      if (okCount === validItems.length) {
        const newHomework = { ...this.data.homework };
        delete newHomework[id];
        this.setData({ expandedCourse: null, homework: newHomework });
        this.popSuccessToast(`已布置 ${okCount} 条作业`);
      } else if (okCount > 0) {
        wx.showToast({ title: `${okCount}/${validItems.length} 条保存成功`, icon: 'none' });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } catch (err) {
      console.error('保存作业失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    return {
      title: '雅思课程安排',
      path: '/pages/courses/courses',
    };
  },
});
