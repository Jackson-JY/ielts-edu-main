// pages/assessment/result/result.js

Page({
  data: {
    totalScore: 6.5,
    listeningScore: 7.0,
    speakingScore: 6.0,
    readingScore: 7.0,
    writingScore: 6.0,
    cefrLevel: 'B2',
    cefrDesc: '中高级英语水平，能够进行复杂的学术交流',
    analysisItems: [
      {
        skill: '听力',
        score: '7.0',
        percentage: 78,
        comment: '听力理解能力较强，能够理解复杂对话和讲座内容',
      },
      {
        skill: '口语',
        score: '6.0',
        percentage: 65,
        comment: '口语表达基本流利，但语法和词汇使用需要进一步改进',
      },
      {
        skill: '阅读',
        score: '7.0',
        percentage: 78,
        comment: '阅读理解能力强，能够快速抓取文章主旨和细节',
      },
      {
        skill: '写作',
        score: '6.0',
        percentage: 65,
        comment: '写作结构清晰，但词汇多样性和语法准确性需要提升',
      },
    ],
    recommendedCourses: [
      {
        id: 1,
        icon: '🎧',
        name: '口语强化训练',
        desc: '提升口语流利度和准确性',
      },
      {
        id: 2,
        icon: '✍️',
        name: '写作技巧提升',
        desc: '掌握高分写作策略和技巧',
      },
      {
        id: 3,
        icon: '📖',
        name: '词汇拓展课程',
        desc: '扩大词汇量，提升表达多样性',
      },
    ],
  },

  onLoad() {
    // TODO: 从上一页获取测评结果数据
    // const eventChannel = this.getOpenerEventChannel();
    // eventChannel.on('assessmentResult', (data) => {
    //   this.setData(data);
    // });
  },

  onShow() {},

  // 跳转到课程页
  goToCourses() {
    wx.switchTab({
      url: '/pages/courses/courses',
    });
  },

  // 返回首页
  goToHome() {
    wx.switchTab({
      url: '/pages/home/home',
    });
  },

  onShareAppMessage() {
    return {
      title: '我的雅思测评结果',
      path: '/pages/assessment/result/result',
    };
  },
});
