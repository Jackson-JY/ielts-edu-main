// pages/assessment/result/result.js
const cloudDB = require('../../../utils/cloudDB');
const cloudStorage = require('../../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../../config/images');

Page({
  data: {
    totalScore: 0,
    listeningScore: 0,
    speakingScore: 0,
    readingScore: 0,
    writingScore: 0,
    cefrLevel: '',
    cefrDesc: '',
    analysisItems: [],
    isLoading: true,
    // 技能图标
    iconHeadphones: '',
    iconMic: '',
    iconBook: '',
    iconPen: '',
  },

  async onLoad() {
    await this.loadImageUrls();
    this.loadLatestResult();
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconPen,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconHeadphones: urlMap[CLOUD_IMAGES.iconHeadphones] || '',
        iconMic: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconPen: urlMap[CLOUD_IMAGES.iconPen] || '',
      });
    } catch (e) {
      console.error('[测评结果页] 加载图片 URL 失败', e);
    }
  },

  onShow() {
    this.loadExamResult();
  },

  /**
   * 从云数据库加载最新测评结果
   */
  async loadLatestResult() {
    this.setData({ isLoading: true });
    try {
      const res = await cloudDB.getMy('assessment_results', (q) =>
        q.orderBy('_createTime', 'desc').limit(1)
      );

      if (res.success && res.data.length > 0) {
        const result = res.data[0];
        const { totalScore, listeningScore, speakingScore, readingScore, writingScore } = result;
        const cefrLevel = this.getCefrLevel(totalScore);
        const cefrDesc = this.getCefrDesc(cefrLevel);

        const analysisItems = [
          {
            skill: '听力',
            score: listeningScore || 0,
            percentage: Math.round((listeningScore || 0) / 9 * 100),
            comment: this.getSkillComment('listening', listeningScore || 0),
            icon: this.data.iconHeadphones,
          },
          {
            skill: '口语',
            score: speakingScore || 0,
            percentage: Math.round((speakingScore || 0) / 9 * 100),
            comment: this.getSkillComment('speaking', speakingScore || 0),
            icon: this.data.iconMic,
          },
          {
            skill: '阅读',
            score: readingScore || 0,
            percentage: Math.round((readingScore || 0) / 9 * 100),
            comment: this.getSkillComment('reading', readingScore || 0),
            icon: this.data.iconBook,
          },
          {
            skill: '写作',
            score: writingScore || 0,
            percentage: Math.round((writingScore || 0) / 9 * 100),
            comment: this.getSkillComment('writing', writingScore || 0),
            icon: this.data.iconPen,
          },
        ];

        this.setData({
          totalScore: totalScore || 0,
          listeningScore: listeningScore || 0,
          speakingScore: speakingScore || 0,
          readingScore: readingScore || 0,
          writingScore: writingScore || 0,
          cefrLevel,
          cefrDesc,
          analysisItems,
          isLoading: false,
        });
      } else {
        this.setData({ isLoading: false });
        wx.showToast({ title: '暂无测评结果', icon: 'none' });
      }
    } catch (e) {
      console.error('加载测评结果失败', e);
      this.setData({ isLoading: false });
    }
  },

  getCefrLevel(score) {
    if (score >= 8) return 'C2';
    if (score >= 7) return 'C1';
    if (score >= 6) return 'B2';
    if (score >= 5) return 'B1';
    if (score >= 4) return 'A2';
    return 'A1';
  },

  getCefrDesc(level) {
    const descs = {
      'A1': '入门级英语水平，能够理解和使用简单的日常用语',
      'A2': '基础级英语水平，能够进行简单的日常交流',
      'B1': '中级英语水平，能够应对日常生活和工作场景',
      'B2': '中高级英语水平，能够进行复杂的学术交流',
      'C1': '高级英语水平，语言运用流畅且准确',
      'C2': '精通级英语水平，语言能力接近母语水平',
    };
    return descs[level] || '';
  },

  getSkillComment(skill, score) {
    const comments = {
      listening: {
        high: '听力理解能力强，能够理解复杂对话和讲座内容',
        mid: '听力基本理解能力良好，需加强细节捕捉',
        low: '听力理解需要加强，建议多听不同口音的素材',
      },
      speaking: {
        high: '口语表达流利，词汇和语法使用准确',
        mid: '口语表达基本流利，需提升词汇多样性和语法准确性',
        low: '口语表达需要大量练习，建议跟读和模仿',
      },
      reading: {
        high: '阅读理解能力强，能够快速抓取文章主旨和细节',
        mid: '阅读理解能力良好，需提升长难句分析能力',
        low: '阅读理解需要加强，建议扩大词汇量和阅读量',
      },
      writing: {
        high: '写作结构清晰，词汇多样性和语法准确性优秀',
        mid: '写作基本结构清晰，需提升词汇多样性和论证深度',
        low: '写作需要系统学习，建议加强模板和词汇积累',
      },
    };
    const skillComments = comments[skill] || comments.reading;
    if (score >= 7) return skillComments.high;
    if (score >= 5) return skillComments.mid;
    return skillComments.low;
  },

  goToHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onShareAppMessage() {
    return { title: '我的雅思测评结果', path: '/pages/assessment/result/result' };
  },
});
