// pages/profile/profile.js
const app = getApp();
const { formatDate } = require('../../utils/dateUtil');
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');
const { calculateStreak, calculateWeekCheckins, calculateMonthCheckins } = require('../../utils/checkinUtil');

Page({
  data: {
    userName: '雅思学习者',
    userId: '',
    studyDays: 0,
    vocabulary: 0,
    examScores: [],
    examScoresReverse: [],
    showAddScore: false,
    newScore: {
      date: '',
      listening: '',
      speaking: '',
      reading: '',
      writing: '',
      total: '',
    },
    isLoading: false,
    isLoggedIn: false,
    isGuest: false,
    isAdmin: false,
    avatarUrl: '',
    defaultAvatarUrl: '',
    iconUser: '',
    // 云存储图标（使用临时 URL）
    iconTarget: '',
    iconChart: '',
    iconRefresh: '',
    iconSettings: '',
    // 添加成绩弹窗图标
    iconCalendar: '',
    iconHeadphones: '',
    iconMic: '',
    iconBook: '',
    iconPen: '',
    // 日期选择限制
    maxDate: '',
    // 打卡统计
    streakDays: 0,
    weekCheckin: 0,
    monthCheckin: 0,
    // 日历热力图
    displayedYear: new Date().getFullYear(),
    displayedMonth: new Date().getMonth(),
    maxYear: new Date().getFullYear(),
    maxMonth: new Date().getMonth(),
    monthLabel: '',
    canGoNext: false,
    dayLabels: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    checkinTypes: [
      { id: 'listening', label: '听力', color: '#A7FBF5' },
      { id: 'speaking',  label: '口语', color: '#E8D4F8' },
      { id: 'reading',   label: '阅读', color: '#FFD4B8' },
      { id: 'writing',   label: '写作', color: '#FFE8F0' },
      { id: 'homework',  label: '作业', color: '#D4E8FF' },
    ],
    // 打卡明细弹窗
    showCheckinDetail: false,
    selectedDate: '',
    selectedDateCheckins: [],
    // 打卡表单弹窗
    showCheckinForm: false,
    checkinTypeList: [
      { id: 'listening', label: '听力', color: '#A7FBF5', selected: false },
      { id: 'speaking',  label: '口语', color: '#E8D4F8', selected: false },
      { id: 'reading',   label: '阅读', color: '#FFD4B8', selected: false },
      { id: 'writing',   label: '写作', color: '#FFE8F0', selected: false },
      { id: 'homework',  label: '作业', color: '#D4E8FF', selected: false },
    ],
    checkinContent: '',
    // 打卡时长（分钟）
    checkinDuration: '',
    canSubmitCheckin: false,
  },

  onLoad() {
    this.initMaxDate();
    this.loadImageUrls();
    this.checkLoginAndLoad();
    this.updateMonthLabel();
    this.initCalendar();
    this.loadCheckinStats();
  },

  onReady() {
    // 页面渲染完成后绘制成绩趋势图
    setTimeout(() => {
      this.drawScoreTrendChart();
    }, 300);
  },

  /**
   * 初始化最大日期为今天
   */
  initMaxDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    this.setData({ maxDate: `${year}-${month}-${day}` });
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.defaultAvatar,
        CLOUD_IMAGES.iconUser,
        CLOUD_IMAGES.iconTarget,
        CLOUD_IMAGES.iconChart,
        CLOUD_IMAGES.iconRefresh,
        CLOUD_IMAGES.iconCalendar,
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconPen,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        defaultAvatarUrl: urlMap[CLOUD_IMAGES.defaultAvatar] || '',
        iconUser: urlMap[CLOUD_IMAGES.iconUser] || '',
        iconTarget: urlMap[CLOUD_IMAGES.iconTarget] || '',
        iconChart: urlMap[CLOUD_IMAGES.iconChart] || '',
        iconRefresh: urlMap[CLOUD_IMAGES.iconRefresh] || '',
        iconCalendar: urlMap[CLOUD_IMAGES.iconCalendar] || '',
        iconHeadphones: urlMap[CLOUD_IMAGES.iconHeadphones] || '',
        iconMic: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconPen: urlMap[CLOUD_IMAGES.iconPen] || '',
      });
    } catch (e) {
      // 加载图片 URL 失败
    }
  },

  /**
   * 检查登录状态并加载数据
   */
  async checkLoginAndLoad() {
    const isLoggedIn = app.globalData.isLoggedIn;
    const userInfo = app.globalData.userInfo;

    // 未登录时跳转到登录页
    if (!isLoggedIn || !userInfo) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }

    this.loadUserData();
    this.loadExamScores();
  },

  onShow() {
    this.loadUserData();
  },

  /**
   * 加载用户数据
   */
  async loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      const isLoggedIn = app.globalData.isLoggedIn;
      const isGuest = userInfo && userInfo.isGuest;
      
      // 优先从数据库获取最新用户信息
      let isAdmin = userInfo && userInfo.isAdmin === true;
      
      if (isLoggedIn && userInfo && userInfo.userId) {
        try {
          const res = await cloudDB.getMy('users');
          if (res.success && res.data.length > 0) {
            const dbUser = res.data[0];
            isAdmin = dbUser.isAdmin === true;
            // 更新 globalData
            userInfo.isAdmin = isAdmin;
            app.globalData.userInfo = userInfo;
          }
        } catch (e) {
          console.error('获取用户信息失败', e);
        }
      }
      
      this.setData({
        isLoggedIn: isLoggedIn,
        isGuest: isGuest || false,
        isAdmin: isAdmin,
      });
      
      if (userInfo && userInfo.nickName) {
        this.setData({
          userName: userInfo.nickName,
          userId: userInfo.userId || userInfo._id || '',
          avatarUrl: userInfo.avatarUrl || '',
        });
      } else {
        // 未登录状态显示默认信息
        this.setData({
          userName: '未登录',
          userId: '',
          avatarUrl: '',
        });
      }
    } catch (e) {
      console.error('加载用户数据失败', e);
    }
  },

  /**
   * 退出登录
   */
  handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          app.logout();
          wx.showToast({ title: '已退出登录', icon: 'success' });
          setTimeout(() => {
            wx.redirectTo({ url: '/pages/login/login' });
          }, 1000);
        }
      }
    });
  },

  /**
   * 去登录
   */
  goToLogin() {
    wx.redirectTo({ url: '/pages/login/login' });
  },

  /**
   * 从云数据库加载考试成绩
   */
  async loadExamScores() {
    this.setData({ isLoading: true });
    try {
      const res = await cloudDB.getMy('exam_scores');
      if (res.success && res.data.length > 0) {
        const examScoresReverse = [...res.data].reverse();
        this.setData({
          examScores: res.data,
          examScoresReverse,
          isLoading: false
        }, () => {
          // 数据加载完成后绘制折线图
          this.drawScoreTrendChart();
        });
      } else {
        this.setData({ examScores: [], examScoresReverse: [], isLoading: false });
      }
    } catch (e) {
      console.error('加载考试成绩失败', e);
      this.setData({ examScores: [], examScoresReverse: [], isLoading: false });
      wx.showToast({ title: '加载考试成绩失败', icon: 'none' });
    }
  },

  /**
   * 绘制成绩趋势折线图
   */
  drawScoreTrendChart() {
    const examScores = this.data.examScoresReverse;
    if (!examScores || examScores.length === 0) return;

    const query = wx.createSelectorQuery();
    query.select('#scoreTrendCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const width = res[0].width;
        const height = res[0].height;
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // 图表边距
        const padding = { top: 30, right: 20, bottom: 30, left: 40 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // 成绩范围 0-9
        const maxScore = 9;
        const minScore = 0;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 绘制网格线
        ctx.strokeStyle = '#E8E8E8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        
        // 横向网格线（5条，对应分数 0, 2, 4, 6, 8）
        for (let i = 0; i <= 4; i++) {
          const y = padding.top + (chartHeight / 4) * i;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(width - padding.right, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // 绘制Y轴标签
        ctx.fillStyle = '#9A97AA';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        for (let i = 0; i <= 4; i++) {
          const value = 8 - i * 2;
          const y = padding.top + (chartHeight / 4) * i;
          ctx.fillText(value.toString(), padding.left - 8, y);
        }

        // 计算数据点坐标
        const points = examScores.map((item, index) => {
          const x = examScores.length === 1 
            ? padding.left + chartWidth / 2 
            : padding.left + (chartWidth / (examScores.length - 1)) * index;
          const y = padding.top + chartHeight - (item.total / maxScore) * chartHeight;
          return { x, y, ...item };
        });

        // 绘制折线（带渐变填充）
        if (points.length > 0) {
          // 创建渐变
          const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
          gradient.addColorStop(0, 'rgba(240, 216, 250, 0.4)');
          gradient.addColorStop(1, 'rgba(240, 216, 250, 0.05)');

          // 填充区域
          ctx.beginPath();
          ctx.moveTo(points[0].x, height - padding.bottom);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          // 绘制折线
          ctx.beginPath();
          ctx.strokeStyle = '#D4A5E8';
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          
          points.forEach((p, i) => {
            if (i === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.stroke();
        }

        // 绘制数据点
        points.forEach(p => {
          // 外圈
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = '#D4A5E8';
          ctx.lineWidth = 2;
          ctx.stroke();

          // 内圈
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#D4A5E8';
          ctx.fill();
        });
      });
  },

  showAddScoreModal() {
    const today = new Date();
    const date = formatDate(today);
    this.setData({
      showAddScore: true,
      newScore: {
        date,
        listening: '',
        speaking: '',
        reading: '',
        writing: '',
        total: '',
      },
    });
  },

  hideAddScoreModal() {
    this.setData({ showAddScore: false });
  },

  onDateChange(e) {
    this.setData({ 'newScore.date': e.detail.value });
  },

  /**
   * 分数输入验证
   */
  validateScore(value) {
    if (!value || value.trim() === '') return false;
    const scoreValue = parseFloat(value);
    if (isNaN(scoreValue)) return false;
    if (scoreValue < 0 || scoreValue > 9) return false;
    if (!/^\d+(\.\d+)?$/.test(value)) return false;
    return true;
  },

  onScoreInput(e) {
    const type = e.currentTarget.dataset.type;
    const value = e.detail.value;
    if (value && !this.validateScore(value)) {
      wx.showToast({ title: '分数必须在0-9之间', icon: 'none', duration: 1500 });
    }
    this.setData({ [`newScore.${type}`]: value });
  },



  /**
   * 保存成绩到云数据库
   */
  async saveScore() {
    const { newScore } = this.data;

    if (!newScore.date) {
      wx.showToast({ title: '请选择考试日期', icon: 'none' });
      return;
    }

    const scores = ['listening', 'speaking', 'reading', 'writing'];
    const subjectMap = { listening: '听力', speaking: '口语', reading: '阅读', writing: '写作' };
    for (const score of scores) {
      if (!this.validateScore(newScore[score])) {
        wx.showToast({ title: `请填写有效的${subjectMap[score]}分数（0-9）`, icon: 'none' });
        return;
      }
    }

    // 验证总分
    if (!this.validateScore(newScore.total)) {
      wx.showToast({ title: '请填写有效的总分（0-9）', icon: 'none' });
      return;
    }

    const total = parseFloat(newScore.total);

    const scoreRecord = {
      date: newScore.date,
      listening: parseFloat(newScore.listening),
      speaking: parseFloat(newScore.speaking),
      reading: parseFloat(newScore.reading),
      writing: parseFloat(newScore.writing),
      total: Math.round(total * 100) / 100,
    };

    try {
      const res = await cloudDB.addMy('exam_scores', scoreRecord);
      if (res.success) {
        const examScores = [scoreRecord, ...this.data.examScores];
        const examScoresReverse = [...examScores].reverse();
        this.setData({ examScores, examScoresReverse, showAddScore: false }, () => {
          // 保存成功后重新绘制折线图
          this.drawScoreTrendChart();
        });
        wx.showToast({ title: '成绩已保存', icon: 'success' });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } catch (e) {
      console.error('保存成绩失败', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  goToAssessmentResult() {
    wx.navigateTo({ url: '/pages/assessment/result/result' });
  },

  goToLearningReport() {
    wx.navigateTo({ url: '/pages/learning-report/learning-report' });
  },

  goToAssessment() {
    wx.navigateTo({ url: '/pages/assessment/intro/intro' });
  },

  contactService() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  onShareAppMessage() {
    return { title: '雅思学习 - 个人中心', path: '/pages/profile/profile' };
  },

  goToOrders() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  goToScheduleManage() {
    wx.navigateTo({ url: '/pages/schedule-manage/schedule-manage' });
  },

  // ========== 打卡统计和日历热力图方法 ==========
  
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
   * 加载打卡统计数据
   */
  async loadCheckinStats() {
    try {
      const today = formatDate(new Date());

      const myCheckins = await cloudDB.getMy('checkins');

      let streakDays = 0, weekCheckin = 0, monthCheckin = 0;
      
      if (myCheckins.success && myCheckins.data.length > 0) {
        const myDates = myCheckins.data.map(c => c.date);
        const uniqueDates = [...new Set(myDates)];
        
        // 使用工具类计算打卡统计
        streakDays = calculateStreak(uniqueDates);
        weekCheckin = calculateWeekCheckins(uniqueDates);
        monthCheckin = calculateMonthCheckins(uniqueDates);
      }

      this.setData({ streakDays, weekCheckin, monthCheckin });
    } catch (e) {
      console.error('加载打卡统计失败', e);
    }
  },

  /**
   * 初始化日历热力图
   */
  async initCalendar() {
    const now = new Date();
    const { displayedYear, displayedMonth, maxYear, maxMonth, checkinTypes } = this.data;
    const isCurrentMonth = displayedYear === maxYear && displayedMonth === maxMonth;
    const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
    const firstDay = new Date(displayedYear, displayedMonth, 1).getDay();

    const monthStart = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    let dateCountMap = {};
    let checkinRes = null;
    try {
      const db = wx.cloud.database();
      checkinRes = await cloudDB.getMy('checkins', (q) =>
        q.where({
          date: db.command.gte(monthStart).and(db.command.lte(monthEnd)),
        }).orderBy('date', 'asc')
      );
      if (checkinRes.success && checkinRes.data.length > 0) {
        checkinRes.data.forEach(c => {
          dateCountMap[c.date] = (dateCountMap[c.date] || 0) + 1;
        });
      }
    } catch (e) {
      console.error('加载日历数据失败', e);
    }

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: '', isEmpty: true, heatColor: 'transparent', hasCheckin: false, types: [], isToday: false });
    }

    const today = formatDate(now);
    const typeList = checkinTypes;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const date = new Date(displayedYear, displayedMonth, d);
      const isFuture = isCurrentMonth && date > now;
      const count = isFuture ? 0 : (dateCountMap[dateStr] || 0);
      const hasCheckin = count > 0;
      const isToday = dateStr === today;

      let types = [];
      if (hasCheckin && checkinRes && checkinRes.success) {
        const dayCheckins = checkinRes.data.filter(c => c.date === dateStr);
        const allTypes = dayCheckins.flatMap(c => c.types || []);
        const uniqueTypes = [...new Set(allTypes.filter(Boolean))];
        types = uniqueTypes.slice(0, 3).map(tid => typeList.find(t => t.id === tid) || typeList[0]);
      }

      days.push({
        day: d,
        isEmpty: false,
        date: dateStr,
        heatColor: this.getHeatColor(count),
        heatCount: count,
        hasCheckin,
        isToday,
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

  onTapCalendarCell(e) {
    const { date, count } = e.currentTarget.dataset;
    if (!date) return;
    
    // 加载该日期的打卡明细
    this.loadCheckinDetail(date);
  },

  // 加载指定日期的打卡明细
  async loadCheckinDetail(date) {
    try {
      const checkinRes = await cloudDB.getMy('checkins', (q) =>
        q.where({ date }).orderBy('createdAt', 'desc')
      );
      
      const checkins = checkinRes.success && checkinRes.data ? checkinRes.data : [];
      
      // 格式化打卡记录
      const formattedCheckins = checkins.map(item => {
        const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();
        const hours = String(createdAt.getHours()).padStart(2, '0');
        const minutes = String(createdAt.getMinutes()).padStart(2, '0');
        
        // 将类型ID转换为完整类型对象
        const types = (item.types || []).map(typeId => {
          return this.data.checkinTypes.find(t => t.id === typeId) || { id: typeId, label: typeId, color: '#A7FBF5' };
        });
        
        return {
          id: item._id || item.id,
          time: `${hours}:${minutes}`,
          types: types,
          content: item.content || '',
          duration: item.duration || 0
        };
      });
      
      this.setData({
        showCheckinDetail: true,
        selectedDate: date,
        selectedDateCheckins: formattedCheckins
      });
    } catch (e) {
      console.error('加载打卡明细失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 关闭打卡明细弹窗
  hideCheckinDetail() {
    this.setData({ showCheckinDetail: false });
  },

  // 显示打卡表单
  showCheckinForm() {
    this.setData({
      showCheckinForm: true,
      checkinTypeList: this.data.checkinTypeList.map(t => ({ ...t, selected: false })),
      checkinContent: '',
      checkinDuration: '',
      canSubmitCheckin: false
    });
  },

  // 关闭打卡表单
  hideCheckinForm() {
    this.setData({ showCheckinForm: false });
  },

  // 切换打卡类型选择
  toggleCheckinType(e) {
    const id = e.currentTarget.dataset.id;
    const checkinTypeList = this.data.checkinTypeList.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    );
    const canSubmitCheckin = checkinTypeList.some(t => t.selected);
    this.setData({ checkinTypeList, canSubmitCheckin });
  },

  // 输入备注内容
  onCheckinContentInput(e) {
    this.setData({ checkinContent: e.detail.value });
  },

  // 输入打卡时长（分钟）
  onCheckinDurationInput(e) {
    // 仅保留数字，避免脏数据
    const value = (e.detail.value || '').replace(/[^\d]/g, '');
    this.setData({ checkinDuration: value });
  },

  // 提交打卡
  async submitCheckin() {
    if (!this.data.canSubmitCheckin) {
      wx.showToast({ title: '请选择打卡类型', icon: 'none' });
      return;
    }

    const selectedTypes = this.data.checkinTypeList.filter(t => t.selected).map(t => t.id);
    const today = formatDate(new Date());
    const duration = parseInt(this.data.checkinDuration, 10);

    wx.showLoading({ title: '提交中...' });

    try {
      const checkinRecord = {
        date: today,
        types: selectedTypes,
        content: this.data.checkinContent,
        // 本次打卡时长（分钟），未填写则记为 0
        duration: Number.isNaN(duration) ? 0 : duration,
        createdAt: new Date()
      };

      const res = await cloudDB.addMy('checkins', checkinRecord);
      
      if (res.success) {
        wx.showToast({ title: '打卡成功！', icon: 'success' });
        this.hideCheckinForm();
        // 刷新数据
        this.loadCheckinStats();
        this.initCalendar();
      } else {
        wx.showToast({ title: '打卡失败', icon: 'none' });
      }
    } catch (e) {
      console.error('打卡失败', e);
      wx.showToast({ title: '打卡失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

});
