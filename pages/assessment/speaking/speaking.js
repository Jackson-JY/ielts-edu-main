// pages/assessment/speaking/speaking.js
Page({
  data: {
    currentPart: 'part1',
    currentQuestion: 0,
    isRecording: false,
    recordingTime: 0,
    recordingTimeText: '0:00',
    part1Questions: [
      "Do you like reading?",
      "What kind of books do you enjoy?",
      "Do you prefer reading books or watching movies?",
      "How often do you read?",
      "What was the last book you read?",
    ],
    part2Topic: {
      title: "Describe a place you like to visit",
      points: [
        "Where it is",
        "How often you go there",
        "What you do there",
        "And explain why you like this place",
      ],
    },
    part3Questions: [
      "What are the benefits of traveling?",
      "How has tourism changed in your country?",
    ],
    questions: [],
    totalQuestions: 0,
    recordTimer: null
  },

  onLoad() {
    this.updateQuestions();
  },

  onUnload() {
    this.stopRecording();
  },

  // 更新当前题目列表
  updateQuestions() {
    const { currentPart, part1Questions, part3Questions } = this.data;
    let questions = [];
    
    if (currentPart === 'part1') {
      questions = part1Questions;
    } else if (currentPart === 'part3') {
      questions = part3Questions;
    } else {
      questions = [this.data.part2Topic.title];
    }

    this.setData({
      questions,
      totalQuestions: questions.length
    });
  },

  // 切换Part
  switchPart(e) {
    const part = e.currentTarget.dataset.part;
    this.setData({
      currentPart: part,
      currentQuestion: 0,
      isRecording: false,
      recordingTime: 0,
      recordingTimeText: '0:00'
    });
    this.stopRecording();
    this.updateQuestions();
  },

  // 开始/停止录音
  toggleRecording() {
    if (this.data.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  // 开始录音
  startRecording() {
    this.setData({ isRecording: true });
    
    let seconds = 0;
    const timer = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;
      
      this.setData({
        recordingTime: seconds,
        recordingTimeText: timeText
      });

      // 自动停止（Part 1: 20秒, Part 2: 120秒, Part 3: 45秒）
      const maxTime = this.data.currentPart === 'part1' ? 20 : 
                      this.data.currentPart === 'part2' ? 120 : 45;
      
      if (seconds >= maxTime) {
        this.stopRecording();
      }
    }, 1000);

    this.setData({ recordTimer: timer });
  },

  // 停止录音
  stopRecording() {
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
      this.setData({ 
        recordTimer: null,
        isRecording: false 
      });
    }
  },

  // 下一题/下一部分
  handleNext() {
    const { currentQuestion, totalQuestions, currentPart } = this.data;

    if (currentQuestion < totalQuestions - 1) {
      // 下一题
      this.setData({
        currentQuestion: currentQuestion + 1,
        isRecording: false,
        recordingTime: 0,
        recordingTimeText: '0:00'
      });
      this.stopRecording();
    } else {
      // 下一部分或完成
      if (currentPart === 'part1') {
        this.setData({
          currentPart: 'part2',
          currentQuestion: 0,
          isRecording: false,
          recordingTime: 0,
          recordingTimeText: '0:00'
        });
        this.updateQuestions();
      } else if (currentPart === 'part2') {
        this.setData({
          currentPart: 'part3',
          currentQuestion: 0,
          isRecording: false,
          recordingTime: 0,
          recordingTimeText: '0:00'
        });
        this.updateQuestions();
      } else {
        // 完成口语测评，跳转到阅读测评
        wx.navigateTo({
          url: '/pages/assessment/reading/reading'
        });
      }
    }
  }
});
