// pages/home/home.js
const app = getApp();

Page({
  data: {
    userName: "学习者",
    currentDate: "",
    todayCourses: 2,
    submittedHomework: 1,
    totalHomework: 2,
    vocabulary: 2913,
    cefrLevel: "B1",
    studyDays: 15,
    streakDays: 7,
  },

  onLoad() {
    this.initDate();
    this.loadUserData();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadUserData();
  },

  // 初始化日期显示
  initDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const currentDate = `${year}年${month}月${day}日`;
    this.setData({ currentDate });
  },

  // 加载用户数据
  loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      if (userInfo && userInfo.nickName) {
        this.setData({
          userName: userInfo.nickName,
        });
      }
      
      // TODO: 从云数据库加载实际数据
      // 这里使用模拟数据，实际应该调用云函数或数据库
      
    } catch (e) {
      console.error("加载用户数据失败", e);
    }
  },

  // 跳转到课程页
  goToCourses() {
    wx.switchTab({
      url: "/pages/courses/courses",
    });
  },

  // 跳转到试听预约页
  goToTrialBooking() {
    wx.navigateTo({
      url: "/pages/trial-booking/trial-booking",
    });
  },

  // 跳转到打卡记录页
  goToCheckin() {
    wx.navigateTo({
      url: "/pages/checkin/checkin",
    });
  },

  // 跳转到学习报告页
  goToLearningReport() {
    wx.navigateTo({
      url: "/pages/learning-report/learning-report",
    });
  },

  onShareAppMessage() {
    return {
      title: "雅思学习 - 一起来学习吧",
      path: "/pages/home/home",
    };
  },
});
