// pages/profile/profile.js
const app = getApp();
const { formatDate } = require('../../utils/dateUtil');
const cloudDB = require('../../utils/cloudDB');
const { getTempUrl, getTempUrls } = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

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
    },
    isLoading: false,
    isLoggedIn: false,
    isGuest: false,
    avatarUrl: '',
    defaultAvatarUrl: '',
    // 云存储图片临时 URL
    imageUrls: {},
  },

  onLoad() {
    this.checkLoginAndLoad();
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

    // 加载默认头像和图标
    const [defaultAvatarUrl, imageUrls] = await Promise.all([
      getTempUrl(CLOUD_IMAGES.defaultAvatar),
      this.loadMenuIcons(),
    ]);
    this.setData({ defaultAvatarUrl, imageUrls });

    this.loadUserData();
    this.loadExamScores();
  },

  /**
   * 加载菜单图标临时 URL
   */
  async loadMenuIcons() {
    try {
      const urls = await getTempUrls([
        CLOUD_IMAGES.iconTarget,
        CLOUD_IMAGES.iconChart,
        CLOUD_IMAGES.iconDocument,
        CLOUD_IMAGES.iconSettings,
        CLOUD_IMAGES.iconRefresh,
        CLOUD_IMAGES.iconSupport,
      ]);
      return {
        iconTarget: urls[CLOUD_IMAGES.iconTarget],
        iconChart: urls[CLOUD_IMAGES.iconChart],
        iconDocument: urls[CLOUD_IMAGES.iconDocument],
        iconSettings: urls[CLOUD_IMAGES.iconSettings],
        iconRefresh: urls[CLOUD_IMAGES.iconRefresh],
        iconSupport: urls[CLOUD_IMAGES.iconSupport],
      };
    } catch (e) {
      console.error('[profile] 加载菜单图标失败', e);
      return {};
    }
  },

  onShow() {
    this.loadUserData();
  },

  /**
   * 加载用户数据
   */
  loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      const isLoggedIn = app.globalData.isLoggedIn;
      const isGuest = userInfo && userInfo.isGuest;
      
      this.setData({
        isLoggedIn: isLoggedIn,
        isGuest: isGuest || false,
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

    const total = (
      parseFloat(newScore.listening) +
      parseFloat(newScore.speaking) +
      parseFloat(newScore.reading) +
      parseFloat(newScore.writing)
    ) / 4;

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
        this.setData({ examScores, examScoresReverse, showAddScore: false });
        wx.showToast({ title: '成绩已保存', icon: 'success' });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } catch (e) {
      console.error('保存成绩失败', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  stopPropagation() {},

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
});
