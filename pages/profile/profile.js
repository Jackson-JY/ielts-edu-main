// pages/profile/profile.js
const app = getApp();
const { formatDate } = require('../../utils/dateUtil');

Page({
  data: {
    userName: '雅思学习者',
    userId: '202604301234',
    studyDays: 15,
    vocabulary: 2913,
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
    isLoading: false
  },

  onLoad() {
    this.loadUserData();
    this.loadExamScores();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadUserData();
  },

  /**
   * 加载用户数据
   * @description 从全局数据和本地缓存加载用户信息
   */
  loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      if (userInfo && userInfo.nickName) {
        this.setData({
          userName: userInfo.nickName,
          userId: userInfo.id || '202604301234',
        });
      }
    } catch (e) {
      console.error('加载用户数据失败', e);
      wx.showToast({
        title: '加载用户数据失败',
        icon: 'none'
      });
    }
  },

  /**
   * 加载考试成绩
   * @description 从服务器或本地缓存加载考试成绩记录
   */
  loadExamScores() {
    this.setData({ isLoading: true });
    
    try {
      // TODO: 从云数据库加载实际数据
      // 这里使用模拟数据
      const mockExamScores = [
        {
          date: '2026-04-15',
          listening: 7.0,
          speaking: 6.5,
          reading: 7.5,
          writing: 6.0,
          total: 6.75,
        },
        {
          date: '2026-03-10',
          listening: 6.5,
          speaking: 6.0,
          reading: 7.0,
          writing: 5.5,
          total: 6.25,
        },
      ];

      // ✅ 修复：使用正确的展开运算符
      const examScoresReverse = [...mockExamScores].reverse();

      this.setData({
        examScores: mockExamScores,
        examScoresReverse,
        isLoading: false
      });
    } catch (e) {
      console.error('加载考试成绩失败', e);
      this.setData({ isLoading: false });
      wx.showToast({
        title: '加载考试成绩失败',
        icon: 'none'
      });
    }
  },

  // 显示添加成绩弹窗
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

  // 隐藏添加成绩弹窗
  hideAddScoreModal() {
    this.setData({
      showAddScore: false,
    });
  },

  // 日期选择变化
  onDateChange(e) {
    this.setData({
      'newScore.date': e.detail.value,
    });
  },

  /**
   * 分数输入验证
   * @description 验证分数是否为0-9之间的有效数字
   * @param {string} value - 输入的分数
   * @returns {boolean} 是否为有效分数
   */
  validateScore(value) {
    if (!value || value.trim() === '') return false;
    
    const scoreValue = parseFloat(value);
    
    // ✅ 修复：更严谨的验证
    if (isNaN(scoreValue)) return false;
    if (scoreValue < 0 || scoreValue > 9) return false;
    if (!/^\d+(\.\d+)?$/.test(value)) return false; // 防止 "123abc" 这样的输入
    
    return true;
  },

  // 分数输入
  onScoreInput(e) {
    const type = e.currentTarget.dataset.type;
    const value = e.detail.value;

    // 实时验证
    if (value && !this.validateScore(value)) {
      wx.showToast({
        title: '分数必须在0-9之间',
        icon: 'none',
        duration: 1500
      });
    }

    this.setData({
      [`newScore.${type}`]: value,
    });
  },

  /**
   * 保存成绩
   * @description 验证并保存考试成绩到服务器
   */
  saveScore() {
    const { newScore } = this.data;

    // ✅ 增强：完善的输入验证
    if (!newScore.date) {
      wx.showToast({
        title: '请选择考试日期',
        icon: 'none',
      });
      return;
    }

    const scores = ['listening', 'speaking', 'reading', 'writing'];
    for (const score of scores) {
      if (!this.validateScore(newScore[score])) {
        const subjectMap = {
          listening: '听力',
          speaking: '口语',
          reading: '阅读',
          writing: '写作'
        };
        wx.showToast({
          title: `请填写有效的${subjectMap[score]}分数（0-9）`,
          icon: 'none',
        });
        return;
      }
    }

    // 计算总分
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

    // TODO: 保存到云数据库
    console.log('保存成绩:', scoreRecord);

    // ✅ 修复：使用正确的展开运算符
    const examScores = [scoreRecord, ...this.data.examScores];
    const examScoresReverse = [...examScores].reverse();

    this.setData({
      examScores,
      examScoresReverse,
      showAddScore: false,
    });

    wx.showToast({
      title: '成绩已保存',
      icon: 'success',
    });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 阻止事件冒泡
  },

  // 跳转到测评结果页
  goToAssessmentResult() {
    wx.navigateTo({
      url: '/pages/assessment/result/result',
    });
  },

  // 跳转到学习报告页
  goToLearningReport() {
    wx.navigateTo({
      url: '/pages/learning-report/learning-report',
    });
  },

  // 跳转到测评页
  goToAssessment() {
    wx.navigateTo({
      url: '/pages/assessment/intro/intro',
    });
  },

  // 联系客服
  contactService() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none',
    });
  },

  onShareAppMessage() {
    return {
      title: '雅思学习 - 个人中心',
      path: '/pages/profile/profile',
    };
  },
});
