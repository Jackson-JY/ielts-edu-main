// pages/assessment/intro/intro.js

Page({
  data: {},

  onLoad() {},

  // 开始测评
  startAssessment() {
    // TODO: 跳转到实际测评页面
    wx.showToast({
      title: '测评功能开发中',
      icon: 'none',
    });

    // 模拟测评完成，跳转到结果页
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/assessment/result/result',
      });
    }, 1500);
  },

  onShareAppMessage() {
    return {
      title: '雅思水平测评',
      path: '/pages/assessment/intro/intro',
    };
  },
});
