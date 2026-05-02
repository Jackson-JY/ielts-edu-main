// pages/learning-report/learning-report.js
const cloudDB = require('../../utils/cloudDB');

Page({
  data: {
    currentDateRange: '',
    studyData: {
      totalHours: 0,
      avgDaily: 0,
      completedCourses: 0,
      vocabLearned: 0,
    },
    trendData: [],
    subjectAnalysis: [],
    suggestions: [],
  },

  onLoad() {
    this.loadLearningData();
  },

  onPullDownRefresh() {
    this.loadLearningData();
    wx.stopPullDownRefresh();
  },

  /**
   * 从云数据库加载学习报告数据
   */
  async loadLearningData() {
    try {
      const [userRes, checkinRes, courseRes] = await Promise.all([
        cloudDB.getMy('users'),
        cloudDB.getMy('checkins'),
        cloudDB.getMy('courses', (q) => q.where({ status: '已完成' })),
      ]);

      // 计算统计数据
      let studyData = {
        totalHours: 0,
        avgDaily: 0,
        completedCourses: 0,
        vocabLearned: 0,
      };

      if (userRes.success && userRes.data.length > 0) {
        const user = userRes.data[0];
        studyData.vocabLearned = user.vocabulary || 0;
        studyData.studyDays = user.studyDays || 0;
      }

      if (checkinRes.success) {
        studyData.totalDays = checkinRes.data.length;
        studyData.avgDaily = checkinRes.data.length > 0
          ? (checkinRes.data.length / 30).toFixed(1)
          : 0;
      }

      if (courseRes.success) {
        studyData.completedCourses = courseRes.data.length;
      }

      // 生成7天趋势数据
      const trendData = this.generateTrendData(checkinRes.data || []);

      // 科目分析（基于用户数据）
      const subjectAnalysis = this.generateSubjectAnalysis(userRes.data || []);

      // 生成建议
      const suggestions = this.generateSuggestions(studyData, subjectAnalysis);

      this.setData({
        studyData,
        trendData,
        subjectAnalysis,
        suggestions,
        currentDateRange: this.getCurrentRange(),
      });
    } catch (e) {
      console.error('加载学习报告数据失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  generateTrendData(checkins) {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const today = new Date();
    const trendData = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = this.formatDate(date);
      const dayCheckins = checkins.filter(c => c.date === dateStr);
      const hours = dayCheckins.length * 1.5; // 每次打卡约1.5小时
      trendData.push({
        day: dayNames[date.getDay()],
        hours: parseFloat(hours.toFixed(1)),
      });
    }

    return trendData;
  },

  generateSubjectAnalysis(users) {
    const user = users.length > 0 ? users[0] : {};
    return [
      { name: '听力', icon: '🎧', score: user.listeningScore || 0, progress: '待测评', color: 'listening' },
      { name: '阅读', icon: '📖', score: user.readingScore || 0, progress: '待测评', color: 'reading' },
      { name: '写作', icon: '✍️', score: user.writingScore || 0, progress: '待测评', color: 'writing' },
      { name: '口语', icon: '🗣️', score: user.speakingScore || 0, progress: '待测评', color: 'speaking' },
    ];
  },

  generateSuggestions(studyData, subjectAnalysis) {
    const suggestions = [];

    if (studyData.avgDaily < 0.5) {
      suggestions.push({ icon: '💡', text: '建议每天坚持打卡，保持学习节奏' });
    }
    if (studyData.completedCourses < 5) {
      suggestions.push({ icon: '📚', text: '课程完成率较低，建议增加每日学习时间' });
    }
    if (studyData.vocabLearned < 100) {
      suggestions.push({ icon: '📝', text: '词汇量积累较少，建议每天学习并复习新单词' });
    }

    // 基于科目分析
    const weakSubjects = subjectAnalysis.filter(s => s.score < 6);
    if (weakSubjects.length > 0) {
      suggestions.push({ icon: '🎯', text: `${weakSubjects.map(s => s.name).join('、')}需要加强，建议重点练习` });
    }

    if (suggestions.length === 0) {
      suggestions.push({ icon: '🌟', text: '学习状态良好，继续保持！' });
    }

    return suggestions;
  },

  formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  getCurrentRange() {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月`;
  },

  previousPeriod() {
    wx.showToast({ title: '已切换到上一月', icon: 'none' });
    this.loadLearningData();
  },

  nextPeriod() {
    wx.showToast({ title: '已切换到下一月', icon: 'none' });
    this.loadLearningData();
  },

  shareReport() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onShareAppMessage() {
    return { title: '我在雅思学习平台取得了进步！', path: '/pages/learning-report/learning-report' };
  },

  onShareTimeline() {
    return { title: '雅思学习报告 - 学习总结' };
  },
});
