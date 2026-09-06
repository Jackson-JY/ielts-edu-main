// pages/assessment/intro/intro.js
const cloudStorage = require('../../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../../config/images');

// 模块 id → 图标 fileID 映射
const ICON_BY_MODULE = {
  vocab: CLOUD_IMAGES.iconBook,
  listening: CLOUD_IMAGES.iconHeadphones,
  speaking: CLOUD_IMAGES.iconMic,
  reading: CLOUD_IMAGES.iconDocument,
  writing: CLOUD_IMAGES.iconPen,
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
        icon: '',
        bgColor: 'rgba(18, 183, 168, 0.24)',
        path: '/pages/assessment/vocab/vocab'
      },
      {
        id: 'listening',
        title: '听力',
        desc: '48 项能力模型 · 12 条听力自评',
        duration: '约 3 分钟',
        icon: '',
        // 主色 #12B7A8 的浅色变体，与全局配色保持同一家族
        bgColor: 'rgba(18, 183, 168, 0.12)',
        path: '/pages/assessment/listening/listening'
      },
      {
        id: 'speaking',
        title: '口语',
        desc: '12 条自评 + 图片描述、观点表达 2 道产出题',
        duration: '约 8 分钟',
        icon: '',
        // 主色加深的同色系变体（略偏蓝灰，呼应文字主色 #17212B）
        bgColor: 'rgba(23, 33, 43, 0.08)',
        path: '/pages/assessment/speaking/speaking'
      },
      {
        id: 'reading',
        title: '阅读',
        desc: '48 项能力模型 · 12 条阅读自评',
        duration: '约 3 分钟',
        icon: '',
        // 主色 + 浅灰过渡，比听力模块略深一档，制造同色系层次
        bgColor: 'rgba(18, 183, 168, 0.20)',
        path: '/pages/assessment/reading/reading'
      },
      {
        id: 'writing',
        title: '写作',
        desc: '12 条自评 + 句式改写、CER 论证 2 道产出题',
        duration: '约 8 分钟',
        icon: '',
        // 中性浅灰蓝，与页面背景 #F6F8FB 同色系but更深一档，作为第四档层次
        bgColor: 'rgba(122, 135, 148, 0.14)',
        path: '/pages/assessment/writing/writing'
      }
    ]
  },

  async onLoad() {
    await this.loadImageUrls();
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = Object.values(ICON_BY_MODULE);
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      const modules = this.data.modules.map((m) => ({
        ...m,
        icon: urlMap[ICON_BY_MODULE[m.id]] || '',
      }));
      this.setData({ modules });
    } catch (e) {
      // 图标加载失败时降级为空图标，不影响页面使用
    }
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
