// components/self-assess/index.js
// 能力自评组件：单条描述逐题展示，0-5 分打分，全部打完后触发 finish 事件
const { SCORE_LABELS } = require('../../utils/assessmentData');

Component({
  properties: {
    // 自评描述列表（字符串数组）
    items: { type: Array, value: [] },
    // 顶部标题
    title: { type: String, value: '能力自评' },
    // 副标题
    subtitle: { type: String, value: '根据实际情况打分，0 = 完全不符合，5 = 完全符合' },
  },

  data: {
    current: 0,
    ratings: [],
    total: 0,
    scoreLabels: SCORE_LABELS,
    scores: [0, 1, 2, 3, 4, 5],
  },

  observers: {
    items(list) {
      if (list && list.length && this.data.ratings.length !== list.length) {
        this.setData({
          ratings: list.map(() => null),
          total: list.length,
          current: 0,
        });
      }
    },
  },

  methods: {
    selectScore(e) {
      const score = Number(e.currentTarget.dataset.score);
      const { current, ratings, total } = this.data;
      if (current >= total) return;

      const next = [...ratings];
      next[current] = score;
      this.setData({ ratings: next });

      // 打分后自动进入下一条，最后一条停留供确认提交
      if (current < total - 1) {
        setTimeout(() => {
          this.setData({ current: this.data.current + 1 });
        }, 250);
      }
    },

    goPrev() {
      if (this.data.current > 0) {
        this.setData({ current: this.data.current - 1 });
      }
    },

    goNext() {
      const { current, ratings, total } = this.data;
      if (ratings[current] === null) {
        wx.showToast({ title: '请先为本条打分', icon: 'none' });
        return;
      }
      if (current < total - 1) {
        this.setData({ current: current + 1 });
      }
    },

    // 全部打完才允许提交
    allRated() {
      return this.data.ratings.every((r) => r !== null);
    },

    onFinish() {
      if (!this.allRated()) {
        wx.showToast({ title: '还有描述未打分', icon: 'none' });
        return;
      }
      this.triggerEvent('finish', { ratings: this.data.ratings });
    },
  },
});
