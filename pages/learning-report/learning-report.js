// pages/learning-report/learning-report.js
Page({
  data: {
    currentDateRange: '2026年4月',
    studyData: {
      totalHours: 48,
      avgDaily: 1.6,
      completedCourses: 12,
      vocabLearned: 320
    },
    trendData: [
      { day: '周一', hours: 1.5 },
      { day: '周二', hours: 2.0 },
      { day: '周三', hours: 1.0 },
      { day: '周四', hours: 2.5 },
      { day: '周五', hours: 1.8 },
      { day: '周六', hours: 3.0 },
      { day: '周日', hours: 2.2 }
    ],
    subjectAnalysis: [
      { name: '听力', icon: '🎧', score: 6.5, progress: '进步中', color: 'listening' },
      { name: '阅读', icon: '📖', score: 7.0, progress: '稳定', color: 'reading' },
      { name: '写作', icon: '✍️', score: 6.0, progress: '需加强', color: 'writing' },
      { name: '口语', icon: '🗣️', score: 5.5, progress: '需加强', color: 'speaking' }
    ],
    suggestions: [
      { icon: '💡', text: '建议每天至少练习30分钟口语，重点关注流利度和发音' },
      { icon: '📝', text: '写作任务2需要加强论证逻辑，建议多练习议论文结构' },
      { icon: '📚', text: '继续坚持每日词汇学习，已掌握320个单词' }
    ]
  },

  onLoad() {
    this.loadLearningData();
  },

  onPullDownRefresh() {
    this.loadLearningData();
    wx.stopPullDownRefresh();
  },

  loadLearningData() {
    // 模拟加载学习数据
    // 实际项目中应该从服务器获取
    console.log('加载学习报告数据');
  },

  previousPeriod() {
    // 切换到上一个周期
    wx.showToast({
      title: '已切换到上一月',
      icon: 'none'
    });
  },

  nextPeriod() {
    // 切换到下一个周期
    wx.showToast({
      title: '已切换到下一月',
      icon: 'none'
    });
  },

  shareReport() {
    // 分享学习报告
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  onShareAppMessage() {
    return {
      title: '我在雅思学习平台取得了进步！',
      path: '/pages/learning-report/learning-report'
    };
  },

  onShareTimeline() {
    return {
      title: '雅思学习报告 - 4月学习总结'
    };
  }
});
