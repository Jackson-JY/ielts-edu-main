// pages/assessment/result/result.js
// 测评结果页：词汇量估值（CAT）+ 四维能力等级（48 项能力模型自评，0-5）
const assessmentStore = require('../../../utils/assessmentStore');
const { CEFR_DESCS, SKILL_COMMENTS } = require('../../../utils/assessmentData');

Page({
  data: {
    isLoading: true,
    hasResult: false,

    // 词汇测试
    vocabEstimate: 0,
    vocabCefr: '',
    vocabConfidence: true,
    hasVocab: false,

    // 四维能力等级（0-5）
    levels: {
      listening: 0,
      reading: 0,
      writing: 0,
      speaking: 0,
    },

    // 综合 CEFR
    cefrLevel: '',
    cefrDesc: '',

    // 能力分析列表
    analysisItems: [],
    // 是否已完成任一项能力自评
    hasSelfAssess: false,
  },

  async onLoad() {
    this.loadResult();
  },

  onShow() {
    if (!this.data.isLoading) {
      this.loadResult();
    }
  },

  async loadResult() {
    this.setData({ isLoading: true });
    try {
      const record = await assessmentStore.getLatestResult();
      if (!record) {
        this.setData({ isLoading: false, hasResult: false });
        return;
      }

      // ---- 词汇测试结果：优先取测评总记录，兜底查 vocab_test_sessions ----
      let vocab = record.vocab;
      if (!vocab || typeof vocab.estimate !== 'number') {
        vocab = await assessmentStore.getLatestVocabResult();
      }

      // ---- 四维能力等级 ----
      const selfAssess = (record && record.selfAssess) || {};
      const levels = {
        listening: (selfAssess.listening && selfAssess.listening.level) || 0,
        reading: (selfAssess.reading && selfAssess.reading.level) || 0,
        writing: (selfAssess.writing && selfAssess.writing.level) || 0,
        speaking: (selfAssess.speaking && selfAssess.speaking.level) || 0,
      };
      const hasSelfAssess = Object.keys(selfAssess).length > 0;
      const analysisItems = [
        this.buildAnalysis('听力', 'listening', levels.listening),
        this.buildAnalysis('阅读', 'reading', levels.reading),
        this.buildAnalysis('写作', 'writing', levels.writing),
        this.buildAnalysis('口语', 'speaking', levels.speaking),
      ];

      // ---- 综合 CEFR：四维平均 ----
      const avg =
        (levels.listening + levels.reading + levels.writing + levels.speaking) / 4;
      const cefrLevel = this.levelToCefr(avg);

      this.setData({
        isLoading: false,
        hasResult: true,
        hasVocab: !!(vocab && typeof vocab.estimate === 'number'),
        vocabEstimate: (vocab && vocab.estimate) || 0,
        vocabCefr: (vocab && vocab.cefrLevel) || '',
        vocabConfidence: !(vocab && vocab.lowConfidence),
        levels,
        hasSelfAssess,
        cefrLevel: hasSelfAssess ? cefrLevel : '',
        cefrDesc: hasSelfAssess ? this.getCefrDesc(cefrLevel) : '',
        analysisItems,
      });
    } catch (e) {
      this.setData({ isLoading: false, hasResult: false });
    }
  },

  buildAnalysis(name, key, level) {
    return {
      skill: name,
      level,
      levelText: level.toFixed(1),
      percentage: Math.round((level / 5) * 100),
      comment: this.getSkillComment(key, level),
    };
  },

  // 平均等级（0-5）→ CEFR
  levelToCefr(level) {
    if (level >= 4.5) return 'C2';
    if (level >= 3.5) return 'C1';
    if (level >= 2.5) return 'B2';
    if (level >= 1.5) return 'B1';
    if (level >= 0.8) return 'A2';
    return 'A1';
  },

  getCefrDesc(level) {
    return CEFR_DESCS[level] || '';
  },

  getSkillComment(skill, level) {
    const skillComments = SKILL_COMMENTS[skill] || SKILL_COMMENTS.reading;
    if (level >= 4) return skillComments.high;
    if (level >= 2.5) return skillComments.mid;
    return skillComments.low;
  },

  goToHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onShareAppMessage() {
    return { title: '我的雅思测评结果', path: '/pages/assessment/intro/intro' };
  },
});
