// pages/assessment/reading/reading.js
Page({
  data: {
    currentQuestion: 0,
    totalQuestions: 50,
    progressPercent: 2,
    optionLetters: ['A', 'B', 'C', 'D'],
    questions: [
      { word: "abundant", options: ["丰富的", "稀少的", "困难的", "简单的"] },
      { word: "collaborate", options: ["竞争", "合作", "分离", "忽视"] },
      { word: "controversial", options: ["有争议的", "受欢迎的", "无聊的", "简单的"] },
      { word: "demonstrate", options: ["隐藏", "证明", "猜测", "忘记"] },
      { word: "efficient", options: ["高效的", "浪费的", "缓慢的", "昂贵的"] },
      { word: "flexible", options: ["灵活的", "僵硬的", "脆弱的", "沉重的"] },
      { word: "generate", options: ["产生", "消灭", "收集", "购买"] },
      { word: "hypothesis", options: ["假设", "结论", "事实", "证据"] },
      { word: "implement", options: ["实施", "取消", "计划", "讨论"] },
      { word: "justify", options: ["证明正当", "批评", "忽视", "拒绝"] },
    ],
    currentQuestionData: {},
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single'
  },

  onLoad(options) {
    // 设置测评模式
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
    this.loadQuestion();
  },

  // 加载当前题目
  loadQuestion() {
    const { currentQuestion, questions } = this.data;
    // 循环使用题目数据
    const questionIndex = currentQuestion % questions.length;
    const currentQuestionData = questions[questionIndex];
    const progressPercent = ((currentQuestion + 1) / this.data.totalQuestions) * 100;

    this.setData({
      currentQuestionData,
      progressPercent
    });
  },

  // 选择答案
  selectAnswer(e) {
    const selectedIndex = e.currentTarget.dataset.index;
    
    // 保存答案（可以存储到本地或全局）
    const answers = wx.getStorageSync('readingAnswers') || [];
    answers[this.data.currentQuestion] = selectedIndex;
    wx.setStorageSync('readingAnswers', answers);

    // 延迟后进入下一题
    setTimeout(() => {
      if (this.data.currentQuestion < this.data.totalQuestions - 1) {
        this.setData({
          currentQuestion: this.data.currentQuestion + 1
        });
        this.loadQuestion();
      } else {
        // 完成阅读测评
        this.completeReading();
      }
    }, 300);
  },

  // 完成阅读测评
  completeReading() {
    // 根据模式决定跳转
    if (this.data.mode === 'full') {
      // 完整测评模式：跳转到写作测评
      wx.navigateTo({
        url: '/pages/assessment/writing/writing?mode=full'
      });
    } else {
      // 单项测评模式：返回首页
      wx.showToast({
        title: '阅读测评完成',
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
