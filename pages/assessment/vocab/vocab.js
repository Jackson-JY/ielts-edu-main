// pages/assessment/vocab/vocab.js
// 词汇量 CAT 自适应测评（基于 IRT 3PL + EAP + 最大信息量选题）
// 算法与题库在云函数 vocabCatTest 中，前端只负责答题交互与结果展示
const TIME_LIMIT = 15; // 单题限时（秒），与云函数 CAT_CONFIG.TIME_LIMIT_MS 保持一致
const { VOCAB_CEFR_DESCS } = require('../../../utils/assessmentData');
const assessmentStore = require('../../../utils/assessmentStore');
const flow = require('../../../utils/assessmentFlow');

Page({
  data: {
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single',
    // 页面阶段：loading | test | result | error
    phase: 'loading',
    errorMsg: '',

    // 会话
    sessionId: '',
    resumed: false,

    // 答题状态
    question: null, // {qid, word, band, options: []}
    optionLetters: ['A', 'B', 'C', 'D'],
    answeredCount: 0,
    progressPercent: 0,
    selectedIdx: -1,
    showFeedback: false,
    feedbackCorrect: false,
    correctIdx: -1,
    submitting: false,
    timeLeft: TIME_LIMIT,

    // 结果
    result: null,
  },

  onLoad(options) {
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
    this.startTest();
  },

  onUnload() {
    this.clearTimer();
  },

  // ==================== 会话流程 ====================

  async startTest() {
    this.clearTimer();
    this.setData({ phase: 'loading', errorMsg: '' });

    try {
      const res = await this.callVocab({ action: 'start', mode: this.data.mode });
      if (!res.success) {
        this.setError(res.error || '无法开始测试');
        return;
      }

      this.setData({
        sessionId: res.sessionId,
        resumed: !!res.resumed,
        answeredCount: res.itemsAnswered || 0,
        progressPercent: this.calcProgress(res.itemsAnswered || 0),
      });

      if (res.nextQuestion) {
        this.setQuestion(res.nextQuestion);
      } else {
        // 恢复了一个已完成但未展示结果的会话，直接取结果
        await this.fetchResult();
      }
    } catch (e) {
      this.setError(this.describeCloudError(e));
    }
  },

  setQuestion(q) {
    this.setData({
      phase: 'test',
      question: q,
      selectedIdx: -1,
      showFeedback: false,
      feedbackCorrect: false,
      correctIdx: -1,
      submitting: false,
      timeLeft: TIME_LIMIT,
    });
    this.startTimer();
  },

  // ==================== 计时 ====================

  startTimer() {
    this.clearTimer();
    this._timer = setInterval(() => {
      const timeLeft = this.data.timeLeft - 1;
      if (timeLeft <= 0) {
        this.setData({ timeLeft: 0 });
        this.handleSubmit(-1); // 超时未答，服务端计为答错
        return;
      }
      this.setData({ timeLeft });
    }, 1000);
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  // ==================== 作答 ====================

  selectAnswer(e) {
    const idx = e.currentTarget.dataset.index;
    if (this.data.submitting || this.data.showFeedback) return;
    this.handleSubmit(idx);
  },

  async handleSubmit(selectedIdx) {
    if (this.data.submitting || this.data.showFeedback) return;
    this.clearTimer();

    const { sessionId, question } = this.data;
    if (!question) return;

    this.setData({ submitting: true, selectedIdx });

    let res;
    try {
      res = await this.callVocab({
        action: 'answer',
        sessionId,
        qid: question.qid,
        selectedOption: selectedIdx,
      });
    } catch (e) {
      // 网络失败允许重答当前题：恢复倒计时
      this.setData({ submitting: false, timeLeft: Math.max(this.data.timeLeft, 5) });
      this.startTimer();
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
      return;
    }

    if (!res.success) {
      this.setData({ submitting: false });
      if (res.error && res.error.indexOf('不同步') >= 0) {
        // 会话状态异常，重新开始
        wx.showToast({ title: '测试状态异常，已重新开始', icon: 'none' });
        this.startTest();
      } else {
        wx.showToast({ title: res.error || '提交失败', icon: 'none' });
        this.setData({ timeLeft: Math.max(this.data.timeLeft, 5) });
        this.startTimer();
      }
      return;
    }

    // 对错反馈高亮（作答后才下发正确选项）
    this.setData({
      submitting: false,
      showFeedback: true,
      feedbackCorrect: res.isCorrect,
      correctIdx: typeof res.correctIndex === 'number' ? res.correctIndex : -1,
      answeredCount: res.itemsAnswered,
      progressPercent: this.calcProgress(res.itemsAnswered),
    });

    setTimeout(() => {
      if (res.shouldContinue && res.nextQuestion) {
        this.setQuestion(res.nextQuestion);
      } else if (res.result) {
        this.showResult(res.result);
      } else {
        this.fetchResult();
      }
    }, 800);
  },

  // ==================== 结果 ====================

  async fetchResult() {
    try {
      const res = await this.callVocab({ action: 'result', sessionId: this.data.sessionId });
      if (res.success && res.result) {
        this.showResult(res.result);
      } else {
        this.setError(res.error || '无法获取测评结果');
      }
    } catch (e) {
      this.setError(this.describeCloudError(e));
    }
  },

  showResult(result) {
    this.clearTimer();
    this.setData({
      phase: 'result',
      result: {
        ...result,
        cefrDesc: VOCAB_CEFR_DESCS[result.cefrLevel] || '',
      },
    });
    // 词汇测试结果合并写入测评总记录（不阻塞界面）
    assessmentStore.saveSection({
      vocab: {
        estimate: result.vocabEstimate,
        cefrLevel: result.cefrLevel,
        lowConfidence: !!result.lowConfidence,
        itemsAnswered: result.itemsAnswered,
      },
    });
  },

  setError(msg) {
    this.clearTimer();
    this.setData({ phase: 'error', errorMsg: msg });
  },

  calcProgress(answered) {
    // 以 30 题为参考进度（大部分测试会在 20-35 题内收敛）
    return Math.min(Math.round((answered / 30) * 100), 100);
  },

  callVocab(data) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'vocabCatTest',
        data,
        success: (r) => resolve(r.result),
        fail: (err) => reject(err),
      });
    });
  },

  // 将云函数调用失败转为可读提示，区分「未部署」与一般网络异常
  describeCloudError(err) {
    const msg = (err && (err.errMsg || err.message)) || '';
    if (/not found|not exist|FunctionName|不存在|未部署|-501000/i.test(msg)) {
      return '词汇测评服务未部署：请在开发者工具中右键 cloudfunctions/vocabCatTest 上传并部署，并在数据库创建 vocab_test_sessions 集合';
    }
    return '网络异常，请稍后重试';
  },

  // ==================== 导航 ====================

  onFinish() {
    // 完整测评 → 下一模块（听力）；单项 → 回首页
    flow.finishModule('vocab', this.data.mode, '词汇量测评完成');
  },

  onRetry() {
    this.startTest();
  },
});
