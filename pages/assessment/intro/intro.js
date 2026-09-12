// pages/assessment/intro/intro.js

// 模块 id → 图标名映射（使用全局 icon 组件，无需云存储图片）
const ICON_BY_MODULE = {
  vocab: 'book',
  listening: 'headphones',
  speaking: 'mic',
  reading: 'book',
  writing: 'pen',
};

Page({
  data: {
    // 测评模块配置
    modules: [
      {
        id: 'vocab',
        title: '词汇量',
        desc: 'CAT 自适应词汇测试 · 约 20-40 题',
        duration: '约 3-5 分钟',
        iconName: 'book',
        path: '/pages/assessment/vocab/vocab'
      },
      {
        id: 'listening',
        title: '听力',
        desc: '48 项能力模型 · 12 条听力自评',
        duration: '约 3 分钟',
        iconName: 'headphones',
        path: '/pages/assessment/listening/listening'
      },
      {
        id: 'speaking',
        title: '口语',
        desc: '12 条自评 + 图片描述、观点表达 2 道产出题',
        duration: '约 8 分钟',
        iconName: 'mic',
        path: '/pages/assessment/speaking/speaking'
      },
      {
        id: 'reading',
        title: '阅读',
        desc: '48 项能力模型 · 12 条阅读自评',
        duration: '约 3 分钟',
        iconName: 'book',
        path: '/pages/assessment/reading/reading'
      },
      {
        id: 'writing',
        title: '写作',
        desc: '12 条自评 + 句式改写、CER 论证 2 道产出题',
        duration: '约 8 分钟',
        iconName: 'pen',
        path: '/pages/assessment/writing/writing'
      }
    ]
  },

  // 选择单项测评
  selectModule(e) {
    const { index } = e.currentTarget.dataset;
    const module = this.data.modules[index];

    wx.navigateTo({
      url: module.path,
    });
  },

  // 开始完整测评（按文档顺序：词汇测试 → 听说读写自评 → 产出题）
  startFullAssessment() {
    // 从词汇量测试开始，后续依次：听力 → 口语 → 阅读 → 写作
    wx.navigateTo({
      url: '/pages/assessment/vocab/vocab?mode=full',
    });
  },

  // 跳过测评
  skipAssessment() {
    wx.switchTab({
      url: '/pages/home/home',
    });
  },

  // 查看测评结果
  viewResult() {
    wx.navigateTo({
      url: '/pages/assessment/result/result',
    });
  },

  onShareAppMessage() {
    return {
      title: '雅思水平测评',
      path: '/pages/assessment/intro/intro',
    };
  },
});
