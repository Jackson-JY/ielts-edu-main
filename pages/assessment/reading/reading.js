// pages/assessment/reading/reading.js
// 阅读模块：48 项能力模型 · 12 条阅读自评（0-5 分）
const { READING_ITEMS } = require('../../../utils/assessmentData');
const flow = require('../../../utils/assessmentFlow');

Page({
  data: {
    items: READING_ITEMS,
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single',
  },

  onLoad(options) {
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
  },

  // 自评完成：保存后按模式导航（完整测评 → 写作模块）
  async onSelfAssessFinish(e) {
    await flow.saveSelfAssessAndFinish(
      'reading',
      e.detail.ratings,
      this.data.mode,
      '阅读自评完成'
    );
  },
});
