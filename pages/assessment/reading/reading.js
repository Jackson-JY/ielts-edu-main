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
    currentQuestionData: {}
  },

  onLoad() {
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
        // 完成阅读测评，跳转到写作测评
        wx.navigateTo({
          url: '/pages/assessment/writing/writing'
        });
      }
    }, 300);
  }
});
