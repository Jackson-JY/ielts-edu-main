// pages/assessment/listening/listening.js
const cloudStorage = require('../../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../../config/images');

Page({
  data: {
    isPlaying: false,
    hasPlayed: false,
    progressPercent: 0,
    questions: [
      "The customer's name is ________.",
      "The booking reference number is ________.",
      "The flight departs at ________.",
      "The seat number is ________.",
      "The baggage allowance is ________ kg.",
      "The meal preference is ________.",
      "The contact number is ________.",
      "The email address is ________.",
      "The special request is ________.",
      "The payment method is ________.",
    ],
    answers: ['', '', '', '', '', '', '', '', '', ''],
    answeredCount: 0,
    playTimer: null,
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single',
    // 云存储图标临时 URL
    iconPlay: '',
    iconPause: '',
    iconCheck: '',
  },

  async onLoad(options) {
    await this.loadImageUrls();
    this.initAnswers();
    // 设置测评模式
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [CLOUD_IMAGES.iconPlay, CLOUD_IMAGES.iconPause, CLOUD_IMAGES.iconCheck];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconPlay: urlMap[CLOUD_IMAGES.iconPlay] || '',
        iconPause: urlMap[CLOUD_IMAGES.iconPause] || '',
        iconCheck: urlMap[CLOUD_IMAGES.iconCheck] || '',
      });
    } catch (e) {
      console.error('[听力测评] 加载图片 URL 失败', e);
    }
  },

  onUnload() {
    this.clearPlayTimer();
  },

  initAnswers() {
    const answers = Array(10).fill('');
    this.setData({ answers });
  },

  // 播放/暂停音频
  togglePlay() {
    if (this.data.hasPlayed) {
      wx.showToast({
        title: '音频已播放完毕',
        icon: 'none'
      });
      return;
    }

    if (this.data.isPlaying) {
      this.pauseAudio();
    } else {
      this.playAudio();
    }
  },

  // 播放音频
  playAudio() {
    this.setData({ isPlaying: true });
    
    // 模拟音频播放进度
    let progress = 0;
    const timer = setInterval(() => {
      progress += 2;
      this.setData({ progressPercent: progress });
      
      if (progress >= 100) {
        this.clearPlayTimer();
        this.setData({
          isPlaying: false,
          hasPlayed: true,
          progressPercent: 100
        });
      }
    }, 100);

    this.setData({ playTimer: timer });
  },

  // 暂停音频
  pauseAudio() {
    this.clearPlayTimer();
    this.setData({ isPlaying: false });
  },

  // 清除定时器
  clearPlayTimer() {
    if (this.data.playTimer) {
      clearInterval(this.data.playTimer);
      this.setData({ playTimer: null });
    }
  },

  // 输入答案
  onAnswerInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    
    const answers = [...this.data.answers];
    answers[index] = value;
    
    const answeredCount = answers.filter(a => a.trim()).length;
    
    this.setData({
      answers,
      answeredCount
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 提交答案
  submitAnswers() {
    if (this.data.answeredCount < 10) {
      wx.showToast({
        title: `还有 ${10 - this.data.answeredCount} 题未答`,
        icon: 'none'
      });
      return;
    }

    // 保存答案到全局或本地存储
    wx.setStorageSync('listeningAnswers', this.data.answers);

    // 根据模式决定跳转
    if (this.data.mode === 'full') {
      // 完整测评模式：跳转到口语测评
      wx.navigateTo({
        url: '/pages/assessment/speaking/speaking?mode=full'
      });
    } else {
      // 单项测评模式：返回首页
      wx.showToast({
        title: '听力测评完成',
        icon: 'success',
        duration: 1500
      });
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/home/home'
        });
      }, 1500);
    }
  },

  // 返回首页
  goToHome() {
    wx.switchTab({
      url: '/pages/home/home'
    });
  }
});
