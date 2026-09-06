// pages/assessment/listening/listening.js
// 听力模块：48 项能力模型 · 12 条听力自评（0-5 分）
const { LISTENING_ITEMS } = require('../../../utils/assessmentData');
const flow = require('../../../utils/assessmentFlow');

Page({
  data: {
    items: LISTENING_ITEMS,
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single',
  },

  onLoad(options) {
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
  },

  // 自评完成：保存后按模式导航（完整测评 → 口语模块）
  async onSelfAssessFinish(e) {
    await flow.saveSelfAssessAndFinish(
      'listening',
      e.detail.ratings,
      this.data.mode,
      '听力自评完成'
    );
  },
});
