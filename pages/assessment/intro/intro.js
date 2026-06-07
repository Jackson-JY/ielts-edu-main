// pages/assessment/intro/intro.js
const cloudStorage = require('../../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../../config/images');

Page({
  data: {
    // 测评模块配置
    modules: [
      {
        id: 'listening',
        title: '听力',
        desc: '雅思 Part 1 题型，10 道填空题',
        duration: '约 5 分钟',
        icon: '',
        // 主色 #12B7A8 的浅色变体，与全局配色保持同一家族
        bgColor: 'rgba(18, 183, 168, 0.12)',
        path: '/pages/assessment/listening/listening'
      },
      {
        id: 'speaking',
        title: '口语',
        desc: 'Part 1 问答 × 5 + Part 2 话题卡 × 1 + Part 3 问答 × 2',
        duration: '约 8 分钟',
        icon: '',
        // 主色加深的同色系变体（略偏蓝灰，呼应文字主色 #17212B）
        bgColor: 'rgba(23, 33, 43, 0.08)',
        path: '/pages/assessment/speaking/speaking'
      },
      {
        id: 'reading',
        title: '阅读',
        desc: '词汇量精准测试',
        duration: '约 5 分钟',
        icon: '',
        // 主色 + 浅灰过渡，比听力模块略深一档，制造同色系层次
        bgColor: 'rgba(18, 183, 168, 0.20)',
        path: '/pages/assessment/reading/reading'
      },
      {
        id: 'writing',
        title: '写作',
        desc: '两道题目，均需先写思路再写一段主体段',
        duration: '约 10 分钟',
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
      const fileIDs = [
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconPen,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      const modules = this.data.modules.map(m => {
        let icon = '';
        switch (m.id) {
          case 'listening': icon = urlMap[CLOUD_IMAGES.iconHeadphones] || ''; break;
          case 'speaking': icon = urlMap[CLOUD_IMAGES.iconMic] || ''; break;
          case 'reading': icon = urlMap[CLOUD_IMAGES.iconBook] || ''; break;
          case 'writing': icon = urlMap[CLOUD_IMAGES.iconPen] || ''; break;
        }
        return { ...m, icon };
      });
      
      this.setData({ modules });
    } catch (e) {
      console.error('[测评介绍页] 加载图片 URL 失败', e);
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

  // 开始完整测评（按顺序进行所有测评）
  startFullAssessment() {
    // 跳转到听力测评页面
    wx.navigateTo({
      url: '/pages/assessment/listening/listening?mode=full',
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
