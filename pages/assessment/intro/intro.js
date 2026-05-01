// pages/assessment/intro/intro.js
Page({
  data: {},

  onLoad() {},

  // 开始测评
  startAssessment() {
    // 跳转到听力测评页面
    wx.navigateTo({
      url: '/pages/assessment/listening/listening',
    });
  },

  // 跳过测评
  skipAssessment() {
    wx.switchTab({
      url: '/pages/home/home',
    });
  },

  onShareAppMessage() {
    return {
      title: '雅思水平测评',
      path: '/pages/assessment/intro/intro',
    };
  },
});
