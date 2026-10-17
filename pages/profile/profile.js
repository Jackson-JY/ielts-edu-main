// pages/profile/profile.js
const app = getApp();
const { formatDate } = require('../../utils/dateUtil');
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');
const { calculateStreak, calculateWeekCheckins, calculateMonthCheckins } = require('../../utils/checkinUtil');
const { drawScoreTrendChart } = require('../../utils/scoreChart');

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
    isAdmin: false,
    avatarUrl: '',
    defaultAvatarUrl: '',
    // 编辑个人资料弹窗（延迟完善：一键登录后在这里设置头像昵称）
    showEditProfile: false,
    editNickName: '',
    editAvatarUrl: '',      // 本地临时文件路径；为空表示不更换头像
    savingProfile: false,
    // 日期选择限制
    maxDate: '',
    // 打卡统计（streak/周/月；日历热力图与打卡表单在 checkin-calendar 组件内）
    streakDays: 0,
    weekCheckin: 0,
    monthCheckin: 0,

    // ─── 番茄时钟 ──────────────────────────────────────────────
    showPomodoro: false,
    todayPomodoros: 0,
    todayFocusMinutes: 0,
    // 传给组件的作业选项（从未完成作业列表拉取）
    pomodoroHomeworkOptions: [],
    // 传给组件的任务选项
    pomodoroTaskOptions: [],
  },

  onLoad() {
    this.initMaxDate();
    this.loadDefaultAvatar();
    this.checkLoginAndLoad();
    this.loadCheckinStats();
    this.loadPomodoroStats();
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
   * 加载默认头像的云存储临时 URL（图标已迁移至全局 icon 组件，无需再加载）
   */
  async loadDefaultAvatar() {
    try {
      const urlMap = await cloudStorage.getTempUrls([CLOUD_IMAGES.defaultAvatar]);
      this.setData({
        defaultAvatarUrl: urlMap[CLOUD_IMAGES.defaultAvatar] || '',
      });
    } catch (e) {
      // 加载默认头像 URL 失败
    }
  },

  /**
   * 检查登录状态并加载数据
   */
  async checkLoginAndLoad() {
    // 未登录时通过统一守卫跳转登录页（reLaunch 清栈）
    if (!app.requireLogin()) return;

    this.loadUserData();
    this.loadExamScores();
  },

  onShow() {
    if (!app.requireLogin()) return;
    this.loadUserData();
  },

  /**
   * 加载用户数据
   */
  async loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      const isLoggedIn = app.globalData.isLoggedIn;

      // 优先从数据库获取最新用户信息
      let isAdmin = userInfo && userInfo.isAdmin === true;
      
      if (isLoggedIn && userInfo && userInfo.userId) {
        try {
          const res = await cloudDB.getMy('users');
          if (res.success && res.data.length > 0) {
            const dbUser = res.data[0];
            isAdmin = dbUser.isAdmin === true;
            // 同步最新资料（昵称 / 头像可能在"编辑资料"中更新过）
            if (dbUser.nickName) userInfo.nickName = dbUser.nickName;
            if (dbUser.avatarUrl !== undefined) userInfo.avatarUrl = dbUser.avatarUrl;
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
            wx.reLaunch({ url: '/pages/login/login' });
          }, 800);
        }
      }
    });
  },

  // ======================================================
  // 编辑个人资料（头像 / 昵称）
  // ======================================================

  /** 点击头像或昵称，打开编辑资料弹窗 */
  onTapEditProfile() {
    if (!this.data.isLoggedIn) return;
    this.setData({
      showEditProfile: true,
      editNickName: this.data.userName === '未登录' ? '' : this.data.userName,
      editAvatarUrl: '', // 空 = 保留现有头像
    });
  },

  /** 编辑弹窗：选择头像回调（open-type="chooseAvatar"） */
  onEditChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (avatarUrl) {
      this.setData({ editAvatarUrl: avatarUrl });
    }
  },

  /** 编辑弹窗：昵称输入（type="nickname"） */
  onEditNickNameInput(e) {
    this.setData({ editNickName: e.detail.value });
  },

  /** 关闭编辑弹窗 */
  hideEditProfile() {
    this.setData({ showEditProfile: false });
  },

  /** 保存个人资料：上传头像（如有更换）→ 更新 users 集合 → 同步全局状态 */
  async saveProfile() {
    if (this.data.savingProfile) return;

    const nickName = (this.data.editNickName || '').trim();
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ savingProfile: true });

    try {
      const userId = this.data.userId || (app.globalData.userInfo && app.globalData.userInfo.userId);
      if (!userId) throw new Error('缺少用户 ID');

      // 1. 上传新头像到云存储（仅当用户本次选择了新头像）
      let finalAvatarUrl = this.data.avatarUrl;
      const tempAvatar = this.data.editAvatarUrl;
      if (tempAvatar && tempAvatar.startsWith('wxfile://')) {
        try {
          const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempAvatar,
          });
          finalAvatarUrl = uploadRes.fileID;
        } catch (e) {
          console.error('[编辑资料] 上传头像失败', e);
          // 头像上传失败不阻塞昵称保存
        }
      }

      // 2. 更新云数据库
      const updateData = { nickName, avatarUrl: finalAvatarUrl };
      const res = await cloudDB.update('users', userId, updateData);
      if (!res.success) throw new Error(res.error || '更新失败');

      // 3. 同步全局登录状态与本地缓存
      const userInfo = Object.assign({}, app.globalData.userInfo, updateData);
      app.setLoginStatus(userInfo);

      // 4. 刷新页面展示
      this.setData({
        userName: nickName,
        avatarUrl: finalAvatarUrl,
        showEditProfile: false,
        savingProfile: false,
      });

      wx.showToast({ title: '资料已更新', icon: 'success' });
    } catch (e) {
      console.error('[编辑资料] 保存失败', e);
      this.setData({ savingProfile: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
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
   * 绘制成绩趋势折线图（实现见 utils/scoreChart.js）
   */
  drawScoreTrendChart() {
    drawScoreTrendChart(this.data.examScoresReverse);
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

  // ========== 打卡统计 ==========
  // 日历热力图/明细/表单在 checkin-calendar 组件内，打卡成功后经事件触发本页统计刷新

  /**
   * 打卡组件回调：打卡成功后刷新 streak/周/月统计
   */
  onCheckinSuccess() {
    this.loadCheckinStats();
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

  // ─── 番茄时钟 ────────────────────────────────────────────────

  /**
   * 打开番茄时钟弹窗（我的页面入口：自由学习，不预置关联作业）
   * 同时拉取用户未完成作业列表，供组件内选择关联
   */
  async onTapOpenPomodoro() {
    // 拉取未完成的作业 + 任务，分别供番茄组件内选择关联
    try {
      const allRes = await cloudDB.getMy('homework', (q) =>
        q.orderBy('_createTime', 'desc').limit(200)
      );
      const pending = (allRes.success ? allRes.data : [])
        .filter(hw => hw.status !== 'completed' && hw.submitted !== true);

      const pomodoroHomeworkOptions = pending
        .filter(hw => hw.recordType !== 'task')
        .slice(0, 20)
        .map(hw => ({
          id: hw._id,
          content: hw.description || hw.content || hw.title || '未命名作业',
          subject: hw.subject || '',
        }));

      const pomodoroTaskOptions = pending
        .filter(hw => hw.recordType === 'task')
        .slice(0, 20)
        .map(t => ({
          id: t._id,
          content: t.description || t.content || '未命名任务',
        }));

      this.setData({ pomodoroHomeworkOptions, pomodoroTaskOptions });
    } catch (e) {
      // 拉取失败不影响打开弹窗
    }

    this.setData({ showPomodoro: true });
  },

  /** 关闭番茄弹窗 */
  onPomodoroClose() {
    this.setData({ showPomodoro: false });
  },

  /** 番茄完成写库后刷新统计 */
  onPomodoroSessionSaved() {
    this.loadPomodoroStats();
  },

  /** 番茄组件内新建任务后（我的页无任务列表，留空实现以避免事件告警） */
  onPomodoroTaskCreated() {},

  /**
   * 加载今日番茄统计（入口卡片展示）
   */
  async loadPomodoroStats() {
    try {
      const today = formatDate(new Date());
      // 改用云函数：服务端按当前用户 OPENID 过滤 + 聚合，避免越权与客户端 20 条上限
      const res = await wx.cloud.callFunction({
        name: 'getPomodoroStats',
        data: { date: today },
      });
      const r = (res && res.result) || {};
      if (r.success) {
        this.setData({
          todayPomodoros: r.todayPomodoros || 0,
          todayFocusMinutes: r.todayFocusMinutes || 0,
        });
      }
    } catch (e) {
      console.error('[我的页] 加载番茄统计失败', e);
    }
  },

});
