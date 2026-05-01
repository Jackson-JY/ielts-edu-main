// pages/assessment/listening/listening.js
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
    playTimer: null
  },

  onLoad() {
    this.initAnswers();
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

    // 跳转到口语测评
    wx.navigateTo({
      url: '/pages/assessment/speaking/speaking'
    });
  }
});
