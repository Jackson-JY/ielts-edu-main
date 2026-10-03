// pages/assessment/speaking/speaking.js
// 口语模块：12 条口语自评（能力模型）+ 跟读评测（SOE 发音评分）+ 2 道产出题（图片描述 / 30 秒观点表达）
// 录音复用原链路：上传云存储 → speaking_answers → ASR 转写
const { SPEAKING_ITEMS, SPEAKING_PRODUCTION, SPEAKING_SHADOWING } = require('../../../utils/assessmentData');
const assessmentStore = require('../../../utils/assessmentStore');
const cloudStorage = require('../../../utils/cloudStorage');
const cloudDB = require('../../../utils/cloudDB');
const flow = require('../../../utils/assessmentFlow');

Page({
  data: {
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single',
    // 页面阶段：selfcheck | shadowing | production
    phase: 'selfcheck',
    // 自评
    selfCheckItems: SPEAKING_ITEMS,

    // 跟读评测
    shadowing: SPEAKING_SHADOWING,
    shadowingSentence: '',
    shadowingAnswer: null, // {question, audioFileID, duration, soeResult}
    soeLoading: false,

    // 产出题
    task1: SPEAKING_PRODUCTION.task1,
    task2: SPEAKING_PRODUCTION.task2,
    currentTaskIndex: 0,
    opinionPrompt: '',

    // 录音状态
    isRecording: false,
    isProcessing: false,
    recordingTime: 0,
    recordingTimeText: '0:00',
    recorderManager: null,
    recordTimer: null,

    // 准备时间（图片描述题）
    isPreparing: false,
    prepareTime: 0,
    prepareTimeText: '1:00',
    prepareTimer: null,

    // 两道产出题作答记录 [{question, audioFileID, duration}]
    productionAnswers: [null, null],
  },

  onLoad(options) {
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
    // 场景图存于云存储：先清空避免 cloud:// 直接进入 image 组件，解析为 HTTPS 临时链接后再渲染
    const pictureFileID = this.data.task1.image;
    this.setData({ 'task1.image': '' });
    cloudStorage.getTempUrl(pictureFileID).then((url) => {
      // 仅在拿到 https 临时链接时渲染，失败保持空态避免 cloud:// 裂图
      if (url && url.indexOf('http') === 0) {
        this.setData({ 'task1.image': url });
      }
    });
    // 随机抽取一道观点题
    const prompts = SPEAKING_PRODUCTION.task2.prompts;
    this.setData({
      opinionPrompt: prompts[Math.floor(Math.random() * prompts.length)],
      // 随机抽取一句跟读句子
      shadowingSentence: SPEAKING_SHADOWING.sentences[Math.floor(Math.random() * SPEAKING_SHADOWING.sentences.length)],
    });
    this.initRecorder();
  },

  onUnload() {
    this.stopRecording(true);
    this.stopPrepareTimer();
    this.stopRecordTimer();
  },

  // ==================== 自评 ====================

  async onSelfCheckFinish(e) {
    const res = await flow.submitWithGuard('保存中...', () =>
      assessmentStore.saveSelfAssess('speaking', e.detail.ratings)
    );
    if (res === flow.SKIPPED) return;
    // 进入跟读评测阶段
    this.setData({ phase: 'shadowing' });
  },

  // ==================== 录音 ====================

  initRecorder() {
    const recorderManager = wx.getRecorderManager();

    recorderManager.onStart(() => {
      this.setData({ isRecording: true });
      this.startRecordTimer();
    });

    recorderManager.onStop((res) => {
      this.setData({ isRecording: false });
      this.stopRecordTimer();
      this.saveRecording(res.tempFilePath, res.duration);
    });

    recorderManager.onError((err) => {
      wx.showToast({ title: '录音失败，请重试', icon: 'none' });
      this.setData({ isRecording: false });
      this.stopRecordTimer();
    });

    this.setData({ recorderManager });
  },

  // 图片描述题：准备倒计时
  startPrepareTimer() {
    this.stopPrepareTimer();
    this.setData({
      isPreparing: true,
      prepareTime: this.data.task1.prepareSeconds,
      prepareTimeText: this.formatTime(this.data.task1.prepareSeconds),
    });

    const timer = setInterval(() => {
      const next = this.data.prepareTime - 1;
      if (next <= 0) {
        this.stopPrepareTimer();
        this.setData({ prepareTime: 0, prepareTimeText: '0:00' });
        wx.showToast({ title: '准备时间结束，请开始作答', icon: 'none' });
        return;
      }
      this.setData({
        prepareTime: next,
        prepareTimeText: this.formatTime(next),
      });
    }, 1000);
    this.setData({ prepareTimer: timer });
  },

  stopPrepareTimer() {
    if (this.data.prepareTimer) {
      clearInterval(this.data.prepareTimer);
      this.setData({ prepareTimer: null, isPreparing: false });
    }
  },

  skipPrepare() {
    this.stopPrepareTimer();
    wx.showToast({ title: '可直接开始作答', icon: 'none' });
  },

  toggleRecording() {
    if (this.data.isProcessing || this.data.soeLoading) return;
    if (this.data.isRecording) {
      this.stopRecording();
      return;
    }

    // 跟读阶段
    if (this.data.phase === 'shadowing') {
      if (this.data.shadowingAnswer) {
        wx.showModal({
          title: '重新录音',
          content: '跟读录音已完成，重新录制将覆盖原结果',
          success: (res) => {
            if (res.confirm) this.startRecording();
          },
        });
        return;
      }
      this.startRecording();
      return;
    }

    // 产出题阶段
    // 准备时间未结束不能开始（图片描述题）
    if (this.data.currentTaskIndex === 0 && this.data.isPreparing) {
      wx.showToast({ title: '请等待准备时间结束', icon: 'none' });
      return;
    }

    // 已有录音，确认重录
    if (this.data.productionAnswers[this.data.currentTaskIndex]) {
      wx.showModal({
        title: '重新录音',
        content: '当前题目已有录音，重新录制将覆盖原录音',
        success: (res) => {
          if (res.confirm) this.startRecording();
        },
      });
      return;
    }
    this.startRecording();
  },

  startRecording() {
    const recorderManager = this.data.recorderManager;
    if (!recorderManager) {
      wx.showToast({ title: '录音功能初始化失败', icon: 'none' });
      return;
    }
    recorderManager.start({
      duration: this.getMaxRecordTime() * 1000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000, // 小程序允许范围 24000-96000
      format: 'wav', // SOE 要求 16kHz，wav 支持 16kHz（mp3 仅支持 44.1kHz）
      frameSize: 50,
    });
  },

  stopRecording(silent) {
    const { recordingTime } = this.data;
    if (!silent && recordingTime < 1) {
      wx.showToast({ title: '录音时间太短，请至少录制 1 秒', icon: 'none' });
      return;
    }
    const recorderManager = this.data.recorderManager;
    if (recorderManager && this.data.isRecording) {
      recorderManager.stop();
    }
    this.stopRecordTimer();
  },

  getMaxRecordTime() {
    // 跟读：30 秒；图片描述：120 秒；观点表达：30 秒
    if (this.data.phase === 'shadowing') {
      return this.data.shadowing.answerSeconds;
    }
    return this.data.currentTaskIndex === 0
      ? this.data.task1.answerSeconds
      : this.data.task2.answerSeconds;
  },

  startRecordTimer() {
    let seconds = 0;
    const maxTime = this.getMaxRecordTime();
    const timer = setInterval(() => {
      seconds++;
      this.setData({
        recordingTime: seconds,
        recordingTimeText: this.formatTime(seconds),
      });
      if (seconds >= maxTime) {
        this.stopRecording(true);
      }
    }, 1000);
    this.setData({ recordTimer: timer });
  },

  stopRecordTimer() {
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
      this.setData({ recordTimer: null });
    }
  },

  formatTime(total) {
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  // 保存录音：上传云存储 → 跟读题调 SOE 评测 / 产出题写 speaking_answers + ASR
  async saveRecording(tempFilePath, duration) {
    this.setData({ isProcessing: true });
    wx.showLoading({ title: '保存录音中...' });

    const isShadowing = this.data.phase === 'shadowing';

    try {
      const app = getApp();
      const openId = app.globalData.openId || 'unknown';
      const timestamp = Date.now();
      const cloudPath = isShadowing
        ? `speaking_recordings/${openId}/shadowing_${timestamp}.wav`
        : `speaking_recordings/${openId}/production_${this.data.currentTaskIndex}_${timestamp}.wav`;
      const fileID = await cloudStorage.uploadFile(tempFilePath, cloudPath);

      if (isShadowing) {
        // 跟读题：调用 SOE 发音评测
        await this.evaluateShadowing(fileID, duration);
      } else {
        // 产出题：写库 + 触发 ASR
        const taskIndex = this.data.currentTaskIndex;
        const question =
          taskIndex === 0 ? this.data.task1.prompt : this.data.opinionPrompt;

        const answer = {
          id: `production_${taskIndex}`,
          part: 'production',
          questionIndex: taskIndex,
          question,
          audioFileID: fileID,
          duration: Math.round(duration / 1000),
          asrStatus: 'processing',
          transcribedText: '',
          createdAt: new Date(),
        };

        const answers = [...this.data.productionAnswers];
        answers[taskIndex] = answer;
        this.setData({ productionAnswers: answers });

        const recordId = await this.saveToSpeakingAnswers(answer);
        // 同步等待 ASR 结果并回填到页面（录音已先存云存储，转写失败不阻塞答题流程）
        if (recordId) {
          await this.runASR(answer, recordId);
        } else {
          // 写库失败时 ASR 无法回写，关闭 loading 并给出提示（录音本身已在云存储）
          wx.hideLoading();
          wx.showToast({ title: '录音已保存，转写未启动', icon: 'none', duration: 2500 });
        }
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '保存录音失败', icon: 'none' });
    } finally {
      this.setData({ isProcessing: false });
    }
  },

  // 产出题：同步调用 ASR 云函数，把转写文字回填到当前答案
  async runASR(answer, recordId) {
    wx.showLoading({ title: '语音转文字中...' });
    const taskIndex = answer.questionIndex;
    try {
      const res = await wx.cloud.callFunction({
        name: 'asrSpeechToText',
        data: {
          fileID: answer.audioFileID,
          duration: answer.duration,
          recordId,
          answerId: answer.id,
          part: answer.part,
          questionIndex: answer.questionIndex,
        },
        config: { timeout: 60000 },
      });

      const result = res.result || {};
      const answers = [...this.data.productionAnswers];
      if (result.success) {
        answers[taskIndex] = {
          ...answers[taskIndex],
          transcribedText: result.text || '',
          asrStatus: 'completed',
        };
        this.setData({ productionAnswers: answers });
        wx.showToast({ title: '转写完成', icon: 'success' });
      } else {
        answers[taskIndex] = {
          ...answers[taskIndex],
          asrStatus: 'failed',
          asrError: result.error || '识别失败',
        };
        this.setData({ productionAnswers: answers });
        wx.showToast({ title: '转文字失败，录音已保存', icon: 'none', duration: 2500 });
      }
    } catch (e) {
      const answers = [...this.data.productionAnswers];
      answers[taskIndex] = {
        ...answers[taskIndex],
        asrStatus: 'failed',
        asrError: (e && e.errMsg) || '云函数调用失败',
      };
      this.setData({ productionAnswers: answers });
      wx.showToast({ title: '转文字失败，录音已保存', icon: 'none', duration: 2500 });
    } finally {
      wx.hideLoading();
    }
  },

  // 跟读评测：调用 soeEvaluate 云函数获取发音评分
  async evaluateShadowing(fileID, duration) {
    this.setData({ soeLoading: true });
    wx.showLoading({ title: '评测发音中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'soeEvaluate',
        data: {
          fileID,
          refText: this.data.shadowingSentence,
        },
      });

      const result = res.result || {};
      let soeResult = null;

      if (result.success && result.result) {
        soeResult = result.result;
        wx.showToast({
          title: `准确度 ${Math.round(soeResult.pronAccuracy)} 分`,
          icon: 'none',
        });
      } else {
        // SOE 不可用时不阻塞流程，给出提示
        wx.showToast({
          title: result.error || '发音评测未完成',
          icon: 'none',
          duration: 2000,
        });
      }

      const answer = {
        id: 'shadowing_0',
        part: 'shadowing',
        questionIndex: 0,
        question: this.data.shadowingSentence,
        audioFileID: fileID,
        duration: Math.round(duration / 1000),
        soeResult,
        createdAt: new Date(),
      };

      this.setData({ shadowingAnswer: answer });
      // 跟读结果也写入 speaking_answers
      this.saveToSpeakingAnswers(answer);
    } catch (e) {
      wx.showToast({ title: '发音评测失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ soeLoading: false });
    }
  },

  // 保存到 speaking_answers 集合（沿用 assessmentId 机制），返回记录 id 供 ASR 回写
  async saveToSpeakingAnswers(answer) {
    try {
      const app = getApp();
      const openId = app.globalData.openId;
      if (!openId) return null;

      const assessmentId = 'default_assessment';
      const existing = await cloudDBQuery(assessmentId, openId);

      let recordId = null;
      if (existing) {
        recordId = existing._id;
        const answers = existing.answers || [];
        const idx = answers.findIndex(
          (a) => a.part === answer.part && a.questionIndex === answer.questionIndex
        );
        if (idx >= 0) {
          answers[idx] = answer;
        } else {
          answers.push(answer);
        }
        await cloudDB.update('speaking_answers', recordId, {
          answers,
          lastUpdateTime: new Date(),
        });
      } else {
        const res = await cloudDB.add('speaking_answers', {
          assessmentId,
          answers: [answer],
          status: 'in_progress',
          startTime: new Date(),
        });
        recordId = res.success ? res.id : null;
      }

      return recordId;
    } catch (e) {
      console.error('保存 speaking_answers 失败', e);
      return null;
    }
  },

  // ==================== 产出题导航 ====================

  // 跟读阶段：进入下一阶段（产出题）
  finishShadowing() {
    if (this.data.isRecording || this.data.soeLoading) {
      wx.showToast({ title: '请先完成录音', icon: 'none' });
      return;
    }
    if (!this.data.shadowingAnswer) {
      wx.showToast({ title: '请先完成跟读录音', icon: 'none' });
      return;
    }
    // 进入产出题，图片描述题开始准备倒计时
    this.setData({
      phase: 'production',
      currentTaskIndex: 0,
      isRecording: false,
      recordingTime: 0,
      recordingTimeText: '0:00',
    });
    this.startPrepareTimer();
  },

  handleNext() {
    const { currentTaskIndex, productionAnswers } = this.data;

    if (this.data.isRecording) {
      wx.showToast({ title: '请先完成当前录音', icon: 'none' });
      return;
    }
    if (!productionAnswers[currentTaskIndex]) {
      wx.showToast({ title: '请先完成本题录音', icon: 'none' });
      return;
    }

    if (currentTaskIndex === 0) {
      // 进入观点表达题
      this.setData({
        currentTaskIndex: 1,
        isRecording: false,
        recordingTime: 0,
        recordingTimeText: '0:00',
      });
    } else {
      this.completeSpeaking();
    }
  },

  async completeSpeaking() {
    const res = await flow.submitWithGuard('提交中...', () =>
      assessmentStore.saveSection({
        production: {
          speaking: {
            shadowing: this.data.shadowingAnswer,
            answers: this.data.productionAnswers,
            completedAt: new Date(),
          },
        },
      })
    );
    if (res === flow.SKIPPED) return;
    // 完整测评 → 写作模块；单项 → 回首页
    flow.finishModule('speaking', this.data.mode, '口语测评完成');
  },
});

// 查询当前测评的 speaking_answers 记录
async function cloudDBQuery(assessmentId, openId) {
  const res = await cloudDB.get('speaking_answers', (q) =>
    q
      .where({ _openid: openId, assessmentId })
      .orderBy('_createTime', 'desc')
      .limit(1)
  );
  return res.success && res.data.length ? res.data[0] : null;
}
