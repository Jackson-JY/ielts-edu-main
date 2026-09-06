/**
 * 测评模块通用流程（听/说/读/写四个模块页共用）
 * - submitWithGuard: 防重复提交 + loading 包裹的保存操作
 * - finishModule: 模块完成后的导航（完整测评跳下一模块，单项测评回首页）
 */
const assessmentStore = require('./assessmentStore');

let submitting = false;

// submitWithGuard 在拦截到重复提交时返回的哨兵值
const SKIPPED = Symbol('skipped');

// 完整测评模块顺序：词汇量 → 听力 → 口语 → 阅读 → 写作 → 结果
const FULL_FLOW = {
  vocab: '/pages/assessment/listening/listening?mode=full',
  listening: '/pages/assessment/speaking/speaking?mode=full',
  speaking: '/pages/assessment/reading/reading?mode=full',
  reading: '/pages/assessment/writing/writing?mode=full',
  writing: '/pages/assessment/result/result',
};

/**
 * 带防重复提交守卫的保存操作：showLoading → saveFn() → hideLoading（失败也会解锁）。
 * @param {string} loadingTitle loading 提示文案
 * @param {Function} saveFn 返回 Promise 的保存函数
 * @returns {Promise<*>} saveFn 的返回值；重复提交时返回 SKIPPED
 */
async function submitWithGuard(loadingTitle, saveFn) {
  if (submitting) return SKIPPED;
  submitting = true;
  wx.showLoading({ title: loadingTitle });
  try {
    return await saveFn();
  } finally {
    wx.hideLoading();
    submitting = false;
  }
}

/**
 * 模块完成后的导航：完整测评 redirectTo 下一模块，单项模式 toast 后回首页。
 * @param {string} skill 模块 id（reading/listening/speaking/writing）
 * @param {string} mode 'full' | 'single'
 * @param {string} toastTitle 单项模式的完成提示文案
 */
function finishModule(skill, mode, toastTitle) {
  if (mode === 'full' && FULL_FLOW[skill]) {
    wx.redirectTo({ url: FULL_FLOW[skill] });
    return;
  }
  wx.showToast({ title: toastTitle, icon: 'success', duration: 1500 });
  setTimeout(() => {
    wx.switchTab({ url: '/pages/home/home' });
  }, 1500);
}

/**
 * 保存某项自评并完成模块导航（自评后没有产出题的模块用：listening / reading）。
 */
async function saveSelfAssessAndFinish(skill, ratings, mode, toastTitle) {
  const res = await submitWithGuard('保存中...', () =>
    assessmentStore.saveSelfAssess(skill, ratings)
  );
  if (res === SKIPPED) return;
  finishModule(skill, mode, toastTitle);
}

module.exports = {
  SKIPPED,
  FULL_FLOW,
  submitWithGuard,
  finishModule,
  saveSelfAssessAndFinish,
};
