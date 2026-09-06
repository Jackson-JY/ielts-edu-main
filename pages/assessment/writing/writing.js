// pages/assessment/writing/writing.js
// 写作模块：12 条写作自评（能力模型）+ 2 道产出题（句式改写 / CER 观点论证）
const { WRITING_ITEMS, WRITING_PRODUCTION } = require('../../../utils/assessmentData');
const assessmentStore = require('../../../utils/assessmentStore');
const flow = require('../../../utils/assessmentFlow');

Page({
  data: {
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single',
    // 页面阶段：selfcheck | production
    phase: 'selfcheck',
    // 自评
    selfCheckItems: WRITING_ITEMS,

    // 产出题
    tasks: [WRITING_PRODUCTION.task1, WRITING_PRODUCTION.task2],
    currentTaskIndex: 0,
    currentTask: WRITING_PRODUCTION.task1,
    // 每题各 slot 的输入内容 { sentence1: '', ... }
    taskInputs: [{}, {}],
    submitting: false,
  },

  onLoad(options) {
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
  },

  // ==================== 自评 ====================

  async onSelfCheckFinish(e) {
    const res = await flow.submitWithGuard('保存中...', () =>
      assessmentStore.saveSelfAssess('writing', e.detail.ratings)
    );
    if (res === flow.SKIPPED) return;
    this.setData({ phase: 'production' });
  },

  // ==================== 产出题 ====================

  onSlotInput(e) {
    const { slot } = e.currentTarget.dataset;
    const { currentTaskIndex, taskInputs } = this.data;
    const next = [...taskInputs];
    next[currentTaskIndex] = { ...next[currentTaskIndex], [slot]: e.detail.value };
    this.setData({ taskInputs: next });
  },

  handleSubmit() {
    const { currentTaskIndex, taskInputs, tasks } = this.data;
    const task = tasks[currentTaskIndex];
    const inputs = taskInputs[currentTaskIndex] || {};

    // 校验所有 slot 都已填写
    const empty = task.slots.find((s) => !(inputs[s.key] || '').trim());
    if (empty) {
      wx.showToast({ title: `请填写「${empty.label}」`, icon: 'none' });
      return;
    }

    if (currentTaskIndex === 0) {
      // 进入第二题
      this.setData({
        currentTaskIndex: 1,
        currentTask: tasks[1],
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } else {
      this.completeWriting();
    }
  },

  async completeWriting() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const res = await flow.submitWithGuard('提交中...', async () => {
      // 写作产出数据
      await assessmentStore.saveSection({
        production: {
          writing: {
            task1: this.data.taskInputs[0],
            task2: this.data.taskInputs[1],
            completedAt: new Date(),
          },
        },
      });
      // 完整测评：写作是最后一个模块，标记整份测评完成
      if (this.data.mode === 'full') {
        await assessmentStore.finalize();
      }
    });

    this.setData({ submitting: false });
    if (res === flow.SKIPPED) return;

    // 完整测评 → 结果页；单项 → 回首页
    flow.finishModule('writing', this.data.mode, '写作测评完成');
  },
});
