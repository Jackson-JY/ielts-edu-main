// pages/home/home.js
const app = getApp();
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

Page({
  data: {
    userName: "学习者",
    currentDate: "",
    todayCourses: 0,
    submittedHomework: 0,
    totalHomework: 0,
    vocabulary: 0,
    cefrLevel: "A1",
    studyDays: 0,
    streakDays: 0,
    // 云存储图标（使用临时 URL）
    iconBook: '',
    iconTarget: '',
    iconChart: '',
    iconCalendar: '',
    iconFire: '',
  },

  async onLoad() {
    this.initDate();
    await this.loadImageUrls();
    this.loadUserData();
    this.initDatabase();
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconTarget,
        CLOUD_IMAGES.iconChart,
        CLOUD_IMAGES.iconCalendar,
        CLOUD_IMAGES.iconFire,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconTarget: urlMap[CLOUD_IMAGES.iconTarget] || '',
        iconChart: urlMap[CLOUD_IMAGES.iconChart] || '',
        iconCalendar: urlMap[CLOUD_IMAGES.iconCalendar] || '',
        iconFire: urlMap[CLOUD_IMAGES.iconFire] || '',
      });
    } catch (e) {
      console.error('[首页] 加载图片 URL 失败', e);
    }
  },

  /**
   * 初始化数据库集合
   */
  async initDatabase() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'initDatabase' });

      if (result.success) {
        const created = result.summary?.created || 0;
        if (created > 0) {
          wx.showToast({
            title: `创建 ${created} 个集合`,
            icon: 'success'
          });
        }
      }
    } catch (error) {
      // 数据库初始化失败
    }
  },



  onShow() {
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

  /**
   * 加载用户数据（从云数据库）
   * @description 从云数据库加载今日课程、作业、用户统计数据
   */
  async loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      if (userInfo) {
        if (userInfo.nickName) {
          this.setData({ userName: userInfo.nickName });
        }
        if (userInfo.avatarUrl) {
          this.setData({ userAvatar: userInfo.avatarUrl });
        }
      }

      const today = this.formatDate(new Date());

      // 并行加载多个数据源
      const [coursesRes, homeworkRes, userRes, checkinRes] = await Promise.all([
        // 1. 今日课程数
        cloudDB.get('courses', (q) => q.where({ date: today })),
        // 2. 今日作业
        cloudDB.get('homework', (q) => q.where({ date: today })),
        // 3. 用户学习数据
        cloudDB.getMy('users'),
        // 4. 打卡记录（用于计算连续打卡）
        cloudDB.getMy('checkins'),
      ]);

      // 更新课程数据
      const todayCourses = coursesRes.success ? coursesRes.data.length : 0;

      // 更新作业数据
      const totalHomework = homeworkRes.success ? homeworkRes.data.length : 0;
      const submittedHomework = homeworkRes.success
        ? homeworkRes.data.filter(h => h.status === 'completed' || h.status === 'submitted').length
        : 0;

      // 更新用户数据（使用默认值或从数据库获取）
      let vocabulary = 2450, cefrLevel = "B1", studyDays = 28, streakDays = 7;
      if (userRes.success && userRes.data.length > 0) {
        const user = userRes.data[0];
        vocabulary = user.vocabulary || 2450;
        cefrLevel = user.cefrLevel || "B1";
        studyDays = user.studyDays || 28;
      }

      // 计算连续打卡天数
      if (checkinRes.success && checkinRes.data.length > 0) {
        const dates = checkinRes.data
          .map(c => c.date)
          .sort()
          .reverse();
        const todayStr = today;
        let checkDate = new Date(todayStr);
        streakDays = 0;
        // 从今天往前推算连续打卡
        for (let i = 0; i < dates.length; i++) {
          const expected = this.formatDate(checkDate);
          if (dates[i] === expected) {
            streakDays++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      this.setData({
        todayCourses,
        submittedHomework,
        totalHomework,
        vocabulary,
        cefrLevel,
        studyDays,
        streakDays,
      });
    } catch (e) {
      console.error("加载用户数据失败", e);
    }
  },

  // 格式化日期为 YYYY-MM-DD
  formatDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 跳转到课程页
  goToCourses() {
    wx.switchTab({ url: "/pages/courses/courses" });
  },

  // 跳转到试听预约页
  goToTrialBooking() {
    wx.navigateTo({ url: "/pages/trial-booking/trial-booking" });
  },

  // 跳转到打卡记录页
  goToCheckin() {
    wx.navigateTo({ url: "/pages/checkin/checkin" });
  },

  // 跳转到学习报告页
  goToLearningReport() {
    wx.navigateTo({ url: "/pages/learning-report/learning-report" });
  },

  onShareAppMessage() {
    return {
      title: "雅思学习 - 一起来学习吧",
      path: "/pages/home/home",
    };
  },
});
