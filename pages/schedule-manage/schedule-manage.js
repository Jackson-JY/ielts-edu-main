// pages/schedule-manage/schedule-manage.js - 管理员排课页面
const app = getApp();
const cloudDB = require('../../utils/cloudDB');
const { CLOUD_IMAGES } = require('../../config/images');
const cloudStorage = require('../../utils/cloudStorage');

Page({
  data: {
    isAdmin: false,
    loading: true,
    scheduleList: [],
    filteredScheduleList: [],
    showAddModal: false,
    editingSchedule: null,
    // 排课模式: 'single' 单节课, '循环' 循环排课
    scheduleMode: 'single',
    // 循环排课相关
    repeatConfig: {
      enabled: false,
      weekCount: 4, // 重复周数
      weekdays: [], // 选中的星期 [1,3,5] 表示周一、周三、周五
    },
    formData: {
      title: '',
      teacher: '',
      date: '',
      startTime: '09:00',
      endTime: '10:00',
      subject: '听力',
      location: '',
      description: '',
      studentName: '',
      studentId: '',
    },
    subjects: ['听力', '阅读', '写作', '口语'],
    subjectColors: {
      '听力': '#A7FBF5',
      '阅读': '#FFD4B8',
      '写作': '#FFE8F0',
      '口语': '#E8D4F8',
    },
    // 云存储图标
    iconHeadphones: '',
    iconBook: '',
    iconPen: '',
    iconMic: '',
    maxDate: '',
    // 学生列表
    studentList: [],
    showStudentPicker: false,
    filteredStudents: [],
    studentSearchKeyword: '',
    // 视图相关
    viewMode: 'day', // day/week/month
    selectedDate: '',
    selectedDay: null,
    weekDays: [],
    monthDays: [],
    dayNames: ['日', '一', '二', '三', '四', '五', '六'],
    dateRangeText: '',
    // 学生筛选
    selectedStudentId: '', // 空字符串表示全部学生
    showStudentFilter: false,
    studentListMap: {}, // 学生 ID 到姓名的映射
  },

  onLoad() {
    this.initMaxDate();
    this.initDate();
    this.checkAdminAndLoad();
    // 加载学生列表
    this.loadStudents();
    // 加载云存储图标
    this.loadIcons();
  },

  // 加载云存储图标
  async loadIcons() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconPen,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconHeadphones: urlMap[CLOUD_IMAGES.iconHeadphones] || '',
        iconMic: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconPen: urlMap[CLOUD_IMAGES.iconPen] || '',
      });
    } catch (e) {
      console.error('加载图标失败', e);
    }
  },

  initMaxDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    this.setData({ maxDate: year + '-' + month + '-' + day });
  },

  initDate() {
    const now = new Date();
    const currentDate = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    this.setData({
      selectedDate: currentDate,
      selectedDay: now.getDate(),
    });
    this.updateDateRangeText();
    this.updateWeekDays();
    this.updateMonthDays();
  },

  checkAdminAndLoad() {
    const userInfo = app.globalData.userInfo;
    const isAdmin = userInfo && userInfo.isAdmin === true;
    this.setData({ isAdmin }, () => {
      if (isAdmin) {
        this.loadSchedules();
      } else {
        this.setData({ loading: false });
        wx.showModal({
          title: '无权访问',
          content: '您没有管理员权限',
          showCancel: false,
          success: () => wx.navigateBack()
        });
      }
    });
  },

  async loadSchedules() {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await cloudDB.collection('courses')
        .orderBy('date', 'asc')
        .orderBy('startTime', 'asc')
        .get();
      
      const scheduleList = (res.data || []).map(item => this.formatSchedule(item));
      this.setData({ scheduleList, loading: false }, () => {
        this.applyFilters();
      });
    } catch (e) {
      console.error('加载排课失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  // ======================================================
  // 视图切换和日期导航
  // ======================================================

  switchViewMode(e) {
    const mode = e.currentTarget.dataset.mode;
    const now = new Date();
    const currentDate = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    this.setData({
      viewMode: mode,
      selectedDate: currentDate,
      selectedDay: now.getDate(),
    });
    if (mode === 'week') {
      this.updateWeekDays();
    } else if (mode === 'month') {
      this.updateMonthDays();
    }
    this.updateDateRangeText();
    this.applyFilters();
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
    const newDate = current.getFullYear() + '-' +
      String(current.getMonth() + 1).padStart(2, '0') + '-' +
      String(current.getDate()).padStart(2, '0');
    this.setData({
      selectedDate: newDate,
      selectedDay: current.getDate(),
    });
    this.updateDateRangeText();
    if (this.data.viewMode === 'week') {
      this.updateWeekDays();
    } else if (this.data.viewMode === 'month') {
      this.updateMonthDays();
    }
    this.applyFilters();
  },

  selectDay(e) {
    const day = e.currentTarget.dataset.day;
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({
      selectedDay: day,
      selectedDate: date,
    });
    this.updateDateRangeText();
    this.applyFilters();
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

  updateWeekDays() {
    const selected = new Date(this.data.selectedDate);
    const weekStart = new Date(selected);
    weekStart.setDate(selected.getDate() - selected.getDay());
    const today = this.getTodayStr();
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const dateStr = this.formatDate(day);
      const courseCount = this.getSchedulesForDate(dateStr).length;
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
    const today = this.getTodayStr();
    const monthDays = [];
    for (let i = 0; i < startDay; i++) {
      monthDays.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = this.formatDate(new Date(year, month, i));
      const courseCount = this.getSchedulesForDate(dateStr).length;
      monthDays.push({
        day: i,
        date: dateStr,
        isToday: dateStr === today,
        courseCount,
      });
    }
    this.setData({ monthDays });
  },

  formatDate(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  },

  getTodayStr() {
    const now = new Date();
    return this.formatDate(now);
  },

  getSchedulesForDate(dateStr) {
    const { scheduleList, selectedStudentId } = this.data;
    let filtered = scheduleList.filter(c => c.date === dateStr);
    if (selectedStudentId) {
      filtered = filtered.filter(c => c.studentId === selectedStudentId);
    }
    return filtered;
  },

  // ======================================================
  // 学生筛选
  // ======================================================

  toggleStudentFilter() {
    this.setData({
      showStudentFilter: !this.data.showStudentFilter
    });
  },

  onFilterStudentTap(e) {
    const studentId = e.currentTarget.dataset.id || '';
    const studentName = e.currentTarget.dataset.name || '全部学生';
    this.setData({
      selectedStudentId: studentId,
      showStudentFilter: false,
    });
    this.applyFilters();
    wx.showToast({ title: '已筛选: ' + studentName, icon: 'none', duration: 1000 });
  },

  applyFilters() {
    const { scheduleList, selectedDate, selectedStudentId } = this.data;
    let filtered = [];
    
    if (this.data.viewMode === 'day') {
      // 日视图：显示选中日期的课程
      filtered = scheduleList.filter(c => c.date === selectedDate);
    } else if (this.data.viewMode === 'week') {
      // 周视图：显示本周所有课程
      const weekStart = new Date(selectedDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      filtered = scheduleList.filter(c => {
        const courseDate = new Date(c.date);
        return courseDate >= weekStart && courseDate <= weekEnd;
      });
    } else {
      // 月视图：显示本月所有课程
      const selected = new Date(selectedDate);
      const year = selected.getFullYear();
      const month = selected.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      filtered = scheduleList.filter(c => {
        const courseDate = new Date(c.date);
        return courseDate >= firstDay && courseDate <= lastDay;
      });
    }
    
    // 应用学生筛选
    if (selectedStudentId) {
      filtered = filtered.filter(c => c.studentId === selectedStudentId);
    }
    
    this.setData({ filteredScheduleList: filtered }, () => {
      this.updateWeekDays();
      this.updateMonthDays();
    });
  },

  formatSchedule(item) {
    const subjectColor = this.data.subjectColors[item.subject] || '#D4E8FF';
    // 根据科目获取对应图标
    let icon = this.data.iconBook; // 默认阅读图标
    switch (item.subject) {
      case '听力': icon = this.data.iconHeadphones; break;
      case '口语': icon = this.data.iconMic; break;
      case '阅读': icon = this.data.iconBook; break;
      case '写作': icon = this.data.iconPen; break;
    }
    return {
      ...item,
      id: item._id,
      subjectColor,
      subjectIcon: icon,
      isPast: this.isPastSchedule(item.date, item.endTime),
    };
  },

  isPastSchedule(date, endTime) {
    const now = new Date();
    const [year, month, day] = date.split('-');
    const [hour, minute] = (endTime || '23:59').split(':');
    const scheduleTime = new Date(year, month - 1, day, hour, minute);
    return scheduleTime < now;
  },

  showAddModal() {
    const today = new Date();
    const dateStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    
    this.setData({
      showAddModal: true,
      editingSchedule: null,
      scheduleMode: 'single',
      repeatConfig: {
        enabled: false,
        weekCount: 4,
        weekdays: [],
      },
      formData: {
        title: '',
        teacher: '',
        date: dateStr,
        startTime: '09:00',
        endTime: '10:00',
        subject: '听力',
        location: '',
        description: '',
        studentName: '',
        studentId: '',
      }
    });
  },

  hideModal() {
    this.setData({ showAddModal: false, editingSchedule: null });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['formData.' + field]: e.detail.value });
  },

  onSubjectChange(e) {
    const index = e.detail.value;
    const subject = this.data.subjects[index];
    this.setData({ ['formData.subject']: subject });
  },

  async saveSchedule() {
    const { formData, scheduleMode, repeatConfig } = this.data;
    
    // 验证表单
    if (!formData.title.trim()) {
      wx.showToast({ title: '请输入课程名称', icon: 'none' });
      return;
    }
    if (!formData.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    if (!formData.startTime || !formData.endTime) {
      wx.showToast({ title: '请选择时间', icon: 'none' });
      return;
    }
    
    // 如果是循环排课，验证配置
    if (scheduleMode === '循环' && repeatConfig.enabled) {
      if (repeatConfig.weekdays.length === 0) {
        wx.showToast({ title: '请选择重复的星期', icon: 'none' });
        return;
      }
      if (!repeatConfig.weekCount || repeatConfig.weekCount < 1) {
        wx.showToast({ title: '请设置重复周数', icon: 'none' });
        return;
      }
    }

    wx.showLoading({ title: '保存中...' });
    
    try {
      const db = wx.cloud.database();
      
      if (scheduleMode === '单节课' || !repeatConfig.enabled) {
        // 单节课模式
        const data = {
          ...formData,
          scheduleMode: 'single',
          createdAt: db.serverDate(),
          createdBy: app.globalData.userInfo._id || app.globalData.openid,
        };

        let res;
        if (this.data.editingSchedule) {
          res = await db.collection('courses').doc(this.data.editingSchedule.id).update({ data });
        } else {
          res = await db.collection('courses').add({ data });
        }

        if (res.errMsg && res.errMsg.indexOf('ok') !== -1) {
          wx.showToast({ title: '保存成功', icon: 'success' });
          this.hideModal();
          this.loadSchedules();
        } else {
          throw new Error('保存失败');
        }
      } else {
        // 循环排课模式
        const schedules = this.generateRecurringSchedules(formData, repeatConfig);
        
        // 批量添加
        const tasks = schedules.map(schedule => {
          return db.collection('courses').add({
            data: {
              ...schedule,
              scheduleMode: '循环',
              repeatGroupId: `repeat_${Date.now()}`, // 同一批循环课程使用相同的 groupId
              createdAt: db.serverDate(),
              createdBy: app.globalData.userInfo._id || app.globalData.openid,
            }
          });
        });
        
        await Promise.all(tasks);
        
        wx.showToast({ 
          title: `成功创建 ${schedules.length} 节课程`, 
          icon: 'success',
          duration: 2000
        });
        this.hideModal();
        this.loadSchedules();
      }
    } catch (e) {
      console.error('保存排课失败', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 生成循环排课的课程列表
   */
  generateRecurringSchedules(baseFormData, repeatConfig) {
    const schedules = [];
    const startDate = new Date(baseFormData.date);
    const { weekCount, weekdays } = repeatConfig;
    
    // 按星期几分组排序
    const sortedWeekdays = [...weekdays].sort((a, b) => a - b);
    
    for (let week = 0; week < weekCount; week++) {
      sortedWeekdays.forEach(weekday => {
        const scheduleDate = new Date(startDate);
        // 计算目标星期几
        const currentWeekday = startDate.getDay();
        // 将星期天(0)转换为7，方便计算
        const adjustedCurrentWeekday = currentWeekday === 0 ? 7 : currentWeekday;
        // 计算天数差异
        let dayDiff = weekday - adjustedCurrentWeekday;
        dayDiff += week * 7;
        
        scheduleDate.setDate(startDate.getDate() + dayDiff);
        
        // 格式化为 YYYY-MM-DD
        const dateStr = scheduleDate.getFullYear() + '-' +
          String(scheduleDate.getMonth() + 1).padStart(2, '0') + '-' +
          String(scheduleDate.getDate()).padStart(2, '0');
        
        schedules.push({
          ...baseFormData,
          date: dateStr,
          weekNumber: week + 1,
          weekday: weekday,
        });
      });
    }
    
    return schedules;
  },

  editSchedule(e) {
    const schedule = e.currentTarget.dataset.schedule;
    this.setData({
      showAddModal: true,
      editingSchedule: schedule,
      scheduleMode: 'single',
      repeatConfig: {
        enabled: false,
        weekCount: 4,
        weekdays: [],
      },
      formData: {
        title: schedule.title,
        teacher: schedule.teacher || '',
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        subject: schedule.subject,
        location: schedule.location || '',
        description: schedule.description || '',
        studentName: schedule.studentName || '',
        studentId: schedule.studentId || '',
      }
    });
  },

  async deleteSchedule(e) {
    const schedule = e.currentTarget.dataset.schedule;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这节课吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            const res = await wx.cloud.database()
              .collection('courses')
              .doc(schedule.id)
              .remove();
            
            if (res.errMsg && res.errMsg.includes('ok')) {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadSchedules();
            } else {
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          } catch (e) {
            console.error('删除失败', e);
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  // ======================================================
  // 排课模式切换
  // ======================================================
  
  /**
   * 切换排课模式
   */
  onScheduleModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      scheduleMode: mode,
      'repeatConfig.enabled': mode === '循环'
    });
  },

  // ======================================================
  // 循环排课配置
  // ======================================================
  
  /**
   * 切换星期选择
   */
  onWeekdayToggle(e) {
    const weekday = parseInt(e.currentTarget.dataset.weekday);
    const { weekdays } = this.data.repeatConfig;
    
    let newWeekdays;
    if (weekdays.indexOf(weekday) !== -1) {
      newWeekdays = weekdays.filter(d => d !== weekday);
    } else {
      newWeekdays = [...weekdays, weekday];
    }
    
    this.setData({
      'repeatConfig.weekdays': newWeekdays
    });
  },

  /**
   * 设置重复周数
   */
  onWeekCountChange(e) {
    const weekCount = parseInt(e.detail.value) || 1;
    this.setData({
      'repeatConfig.weekCount': weekCount
    });
  },

  // ======================================================
  // 学生选择相关
  // ======================================================
  
  /**
   * 加载学生列表
   */
  async loadStudents() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('users')
        .field({ nickName: true, _id: true })
        .get();
      
      const studentList = (res.data || []).map(user => ({
        id: user._id,
        name: user.nickName || '未命名用户'
      }));
      
      // 构建学生 ID 到姓名的映射
      const studentListMap = {};
      studentList.forEach(s => {
        studentListMap[s.id] = s.name;
      });
      
      this.setData({
        studentList,
        filteredStudents: studentList,
        studentListMap
      });
    } catch (e) {
      console.error('加载学生列表失败', e);
    }
  },

  /**
   * 点击学生输入框，显示学生选择弹窗
   */
  onStudentInputTap() {
    this.setData({
      showStudentPicker: true,
      studentSearchKeyword: '',
      filteredStudents: this.data.studentList
    });
  },

  /**
   * 关闭学生选择弹窗
   */
  onCloseStudentPicker() {
    this.setData({
      showStudentPicker: false
    });
  },

  /**
   * 搜索学生
   */
  onStudentSearch(e) {
    const keyword = e.detail.value;
    const { studentList } = this.data;
    
    if (!keyword.trim()) {
      this.setData({
        studentSearchKeyword: keyword,
        filteredStudents: studentList
      });
      return;
    }
    
    const filtered = studentList.filter(student => 
      student.name.toLowerCase().indexOf(keyword.toLowerCase()) !== -1
    );
    
    this.setData({
      studentSearchKeyword: keyword,
      filteredStudents: filtered
    });
  },

  /**
   * 选择学生
   */
  onSelectStudent(e) {
    const student = e.currentTarget.dataset.student;
    this.setData({
      'formData.studentName': student.name,
      'formData.studentId': student.id,
      showStudentPicker: false
    });
  },
});
