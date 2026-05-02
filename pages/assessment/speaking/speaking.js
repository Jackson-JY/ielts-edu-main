// pages/assessment/speaking/speaking.js
const cloudStorage = require('../../../utils/cloudStorage');
const cloudDB = require('../../../utils/cloudDB');
const { CLOUD_IMAGES } = require('../../../config/images');

Page({
  data: {
    currentPart: 'part1',
    currentQuestion: 0,
    isRecording: false,
    isProcessing: false,
    recordingTime: 0,
    recordingTimeText: '0:00',
    iconMic: '',
    iconCheck: '',
    part1Questions: [
      "Do you like reading?",
      "What kind of books do you enjoy?",
      "Do you prefer reading books or watching movies?",
      "How often do you read?",
      "What was the last book you read?",
    ],
    part2Topic: {
      title: "Describe a place you like to visit",
      points: [
        "Where it is",
        "How often you go there",
        "What you do there",
        "And explain why you like this place",
      ],
    },
    part3Questions: [
      "What are the benefits of traveling?",
      "How has tourism changed in your country?",
    ],
    questions: [],
    totalQuestions: 0,
    recordTimer: null,
    // 录音相关
    recorderManager: null,
    tempAudioFile: '',
    // 答题记录
    answers: [],
    currentAnswer: null,
    // ASR 结果
    transcribedText: '',
    // 准备时间（Part 2 专用）
    isPreparing: false,
    prepareTime: 0,
    prepareTimeText: '1:00',
    prepareTimer: null,
    // 各 Part 答题数量统计
    part1Count: 0,
    part2Count: 0,
    part3Count: 0,
    // 测评模式：'full' 完整测评，'single' 单项测评
    mode: 'single'
  },

  async onLoad(options) {
    await this.loadImageUrls();
    // 设置测评模式
    if (options.mode === 'full') {
      this.setData({ mode: 'full' });
    }
    this.initRecorder();
    this.updateQuestions();
    this.loadUserAnswers();
  },

  onUnload() {
    this.stopRecording();
    this.stopPrepareTimer();
  },

  // 初始化录音管理器
  initRecorder() {
    const recorderManager = wx.getRecorderManager();
    
    recorderManager.onStart(() => {
      console.log('[录音] 开始录音');
      this.setData({ isRecording: true });
      this.startRecordTimer();
    });

    recorderManager.onStop((res) => {
      console.log('[录音] 停止录音', res);
      this.setData({ isRecording: false });
      this.stopRecordTimer();
      
      const { tempFilePath, duration, fileSize } = res;
      this.setData({ tempAudioFile: tempFilePath });
      
      // 保存当前录音
      this.saveRecording(tempFilePath, duration);
    });

    recorderManager.onError((err) => {
      console.error('[录音] 录音错误:', err);
      wx.showToast({
        title: '录音失败: ' + err.message,
        icon: 'none'
      });
      this.setData({ isRecording: false });
      this.stopRecordTimer();
    });

    this.setData({ recorderManager });
  },

  // 更新当前题目列表
  updateQuestions() {
    const { currentPart, part1Questions, part3Questions } = this.data;
    let questions = [];
    
    if (currentPart === 'part1') {
      questions = part1Questions;
    } else if (currentPart === 'part3') {
      questions = part3Questions;
    } else {
      questions = [this.data.part2Topic.title];
    }

    this.setData({
      questions,
      totalQuestions: questions.length
    });
  },

  // 加载用户之前的答题记录
  async loadUserAnswers() {
    const app = getApp();
    const openId = app.globalData.openId;
    
    if (!openId) return;

    const result = await cloudDB.get('speaking_answers', {
      _openid: openId,
      assessmentId: this.getAssessmentId()
    });

    if (result.success && result.data.length > 0) {
      const answers = result.data[0].answers || [];
      this.setData({
        answers: answers
      });
      // 更新各 Part 计数
      this.updatePartCounts(answers);
    }
  },

  // 获取当前测评ID
  getAssessmentId() {
    // 从页面参数或全局数据获取
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    return currentPage.options.assessmentId || 'default_assessment';
  },

  // 切换Part
  switchPart(e) {
    const part = e.currentTarget.dataset.part;
    
    // 如果正在录音，先停止
    if (this.data.isRecording) {
      this.stopRecording();
    }

    this.setData({
      currentPart: part,
      currentQuestion: 0,
      isRecording: false,
      isProcessing: false,
      recordingTime: 0,
      recordingTimeText: '0:00',
      transcribedText: '',
      currentAnswer: null,
      tempAudioFile: ''
    });
    
    this.stopRecordTimer();
    this.updateQuestions();
    this.loadUserAnswers();

    // Part 2 开始准备时间
    if (part === 'part2') {
      this.startPrepareTimer();
    }
  },

  // 开始准备时间（Part 2）
  startPrepareTimer() {
    this.setData({
      isPreparing: true,
      prepareTime: 60,
      prepareTimeText: '1:00'
    });

    const timer = setInterval(() => {
      const newTime = this.data.prepareTime - 1;
      
      if (newTime <= 0) {
        this.stopPrepareTimer();
        this.setData({
          prepareTime: 0,
          prepareTimeText: '0:00'
        });
        // 只有当前仍在 Part 2 时才显示提示
        if (this.data.currentPart === 'part2') {
          wx.showToast({
            title: '准备时间结束，请开始答题',
            icon: 'none'
          });
        }
        return;
      }

      const mins = Math.floor(newTime / 60);
      const secs = newTime % 60;
      const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;

      this.setData({
        prepareTime: newTime,
        prepareTimeText: timeText
      });
    }, 1000);

    this.setData({ prepareTimer: timer });
  },

  // 停止准备计时器
  stopPrepareTimer() {
    if (this.data.prepareTimer) {
      clearInterval(this.data.prepareTimer);
      this.setData({
        prepareTimer: null,
        isPreparing: false
      });
    }
  },

  // 开始/停止录音
  toggleRecording() {
    if (this.data.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  // 开始录音
  startRecording() {
    // Part 2 准备时间未结束不能开始
    if (this.data.currentPart === 'part2' && this.data.isPreparing) {
      wx.showToast({
        title: '请等待准备时间结束',
        icon: 'none'
      });
      return;
    }

    const recorderManager = this.data.recorderManager;
    if (!recorderManager) {
      wx.showToast({
        title: '录音功能初始化失败',
        icon: 'none'
      });
      return;
    }

    // 配置录音参数
    const options = {
      duration: this.getMaxRecordTime() * 1000, // 最大录音时长
      sampleRate: 16000, // 16kHz，适合语音识别
      numberOfChannels: 1, // 单声道
      encodeBitRate: 48000, // 编码码率
      format: 'mp3', // 音频格式
      frameSize: 50, // 指定帧大小
    };

    recorderManager.start(options);
  },

  // 停止录音
  stopRecording() {
    const { recordingTime } = this.data;
    
    // 最小录音时长 1 秒
    if (recordingTime < 1) {
      wx.showToast({
        title: '录音时间太短，请至少录制1秒',
        icon: 'none'
      });
      return;
    }
    
    const recorderManager = this.data.recorderManager;
    if (recorderManager && this.data.isRecording) {
      recorderManager.stop();
    }
    this.stopRecordTimer();
  },

  // 获取最大录音时长
  getMaxRecordTime() {
    const { currentPart } = this.data;
    // Part 1: 20秒, Part 2: 120秒, Part 3: 45秒
    if (currentPart === 'part1') return 20;
    if (currentPart === 'part2') return 120;
    return 45;
  },

  // 开始录音计时器
  startRecordTimer() {
    let seconds = 0;
    const maxTime = this.getMaxRecordTime();
    
    const timer = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;
      
      this.setData({
        recordingTime: seconds,
        recordingTimeText: timeText
      });

      // 自动停止
      if (seconds >= maxTime) {
        this.stopRecording();
      }
    }, 1000);

    this.setData({ recordTimer: timer });
  },

  // 停止录音计时器
  stopRecordTimer() {
    if (this.data.recordTimer) {
      clearInterval(this.data.recordTimer);
      this.setData({ recordTimer: null });
    }
  },

  // 保存录音并上传
  async saveRecording(tempFilePath, duration) {
    this.setData({ isProcessing: true });
    
    wx.showLoading({ title: '保存录音中...' });

    try {
      // 1. 上传音频到云存储
      const app = getApp();
      const openId = app.globalData.openId || 'unknown';
      const timestamp = Date.now();
      const cloudPath = `speaking_recordings/${openId}/${this.data.currentPart}_${this.data.currentQuestion}_${timestamp}.mp3`;
      
      const fileID = await cloudStorage.uploadFile(tempFilePath, cloudPath);
      console.log('[录音] 上传成功:', fileID);

      // 2. 生成 answerId 用于标识本次答题
      const answerId = `${this.data.currentPart}_${this.data.currentQuestion}_${timestamp}`;
      
      // 3. 构建答题记录
      const currentAnswer = {
        id: answerId, // 用于 ASR 识别后更新
        part: this.data.currentPart,
        questionIndex: this.data.currentQuestion,
        question: this.getCurrentQuestion(),
        audioFileID: fileID,
        duration: Math.round(duration / 1000), // 秒
        transcribedText: '',
        asrStatus: 'processing', // ASR 处理状态
        score: null,
        feedback: null,
        createdAt: new Date()
      };

      this.setData({ currentAnswer });

      // 4. 保存到数据库
      const recordId = await this.saveAnswerToDatabase(currentAnswer);

      wx.hideLoading();
      
      // 显示提示：后台识别中
      wx.showToast({
        title: '录音已保存，后台识别中',
        icon: 'none',
        duration: 2000
      });

      // 5. 启动后台 ASR 识别（不等待结果）
      
      if (recordId) {
        wx.cloud.callFunction({
          name: 'asrSpeechToText',
          data: {
            fileID: fileID,
            duration: Math.round(duration / 1000),
            recordId: recordId,
            answerId: answerId
          }
        }).then(res => {
          console.log('[ASR] 识别任务已启动:', res.result);
        }).catch(err => {
          console.error('[ASR] 启动识别任务失败:', err);
        });
      } else {
        console.warn('[ASR] 未保存到数据库，跳过语音识别');
      }

    } catch (error) {
      console.error('[录音] 保存失败:', error);
      wx.showToast({
        title: '保存录音失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isProcessing: false });
    }
  },

  // 获取当前问题
  getCurrentQuestion() {
    const { currentPart, currentQuestion, questions, part2Topic } = this.data;
    
    if (currentPart === 'part2') {
      return {
        title: part2Topic.title,
        points: part2Topic.points
      };
    }
    return questions[currentQuestion];
  },

  // 保存答案到数据库，返回 recordId
  async saveAnswerToDatabase(answer) {
    try {
      const app = getApp();
      const openId = app.globalData.openId;
      
      if (!openId) {
        console.warn('[保存答案] 用户未登录，无法保存');
        return null;
      }

      const assessmentId = this.getAssessmentId();
      
      // 查找是否已有记录
      const existing = await cloudDB.get('speaking_answers', {
        _openid: openId,
        assessmentId: assessmentId
      });

      let recordId;

      if (existing.success && existing.data.length > 0) {
        // 更新现有记录
        recordId = existing.data[0]._id;
        const answers = existing.data[0].answers || [];
        
        // 查找是否已有相同 part 和 question 的答案
        const existingIndex = answers.findIndex(
          a => a.part === answer.part && a.questionIndex === answer.questionIndex
        );
        
        if (existingIndex >= 0) {
          answers[existingIndex] = answer;
        } else {
          answers.push(answer);
        }

        await cloudDB.update('speaking_answers', recordId, {
          answers: answers,
          lastUpdateTime: new Date()
        });
      } else {
        // 创建新记录
        const result = await cloudDB.add('speaking_answers', {
          assessmentId: assessmentId,
          answers: [answer],
          status: 'in_progress',
          startTime: new Date()
        });
        recordId = result.success ? result.id : null;
      }

      // 更新本地数据
      const newAnswers = [...this.data.answers];
      const existingIndex = newAnswers.findIndex(
        a => a.part === answer.part && a.questionIndex === answer.questionIndex
      );
      
      if (existingIndex >= 0) {
        newAnswers[existingIndex] = answer;
      } else {
        newAnswers.push(answer);
      }
      
      this.setData({ answers: newAnswers });
      
      // 更新各 Part 计数
      this.updatePartCounts(newAnswers);
      
      console.log('[保存答案] 成功, recordId:', recordId);
      return recordId;

    } catch (error) {
      console.error('[保存答案] 失败:', error);
      return null;
    }
  },

  // 更新各 Part 答题数量统计
  updatePartCounts(answers) {
    const part1Count = answers.filter(a => a.part === 'part1').length;
    const part2Count = answers.filter(a => a.part === 'part2').length;
    const part3Count = answers.filter(a => a.part === 'part3').length;
    
    this.setData({
      part1Count,
      part2Count,
      part3Count
    });
  },

  // 播放录音
  playRecording() {
    const { currentAnswer } = this.data;
    if (!currentAnswer || !currentAnswer.audioFileID) {
      wx.showToast({
        title: '暂无录音',
        icon: 'none'
      });
      return;
    }

    // 获取临时 URL 并播放
    cloudStorage.getTempUrl(currentAnswer.audioFileID).then(url => {
      const innerAudioContext = wx.createInnerAudioContext();
      innerAudioContext.src = url;
      innerAudioContext.play();
      
      innerAudioContext.onError((err) => {
        console.error('[播放] 错误:', err);
        wx.showToast({
          title: '播放失败',
          icon: 'none'
        });
      });
    });
  },

  // 下一题/下一部分
  handleNext() {
    const { currentQuestion, totalQuestions, currentPart } = this.data;

    // 如果正在录音，先停止
    if (this.data.isRecording) {
      this.stopRecording();
      wx.showToast({
        title: '请先完成当前录音',
        icon: 'none'
      });
      return;
    }

    if (currentQuestion < totalQuestions - 1) {
      // 下一题
      this.setData({
        currentQuestion: currentQuestion + 1,
        isRecording: false,
        recordingTime: 0,
        recordingTimeText: '0:00',
        transcribedText: '',
        currentAnswer: null,
        tempAudioFile: ''
      });
    } else {
      // 下一部分或完成
      if (currentPart === 'part1') {
        this.setData({
          currentPart: 'part2',
          currentQuestion: 0,
          isRecording: false,
          recordingTime: 0,
          recordingTimeText: '0:00',
          transcribedText: '',
          currentAnswer: null,
          tempAudioFile: ''
        });
        this.updateQuestions();
        this.startPrepareTimer();
      } else if (currentPart === 'part2') {
        this.setData({
          currentPart: 'part3',
          currentQuestion: 0,
          isRecording: false,
          recordingTime: 0,
          recordingTimeText: '0:00',
          transcribedText: '',
          currentAnswer: null,
          tempAudioFile: ''
        });
        this.updateQuestions();
      } else {
        // 完成口语测评，保存最终状态
        this.completeSpeakingAssessment();
      }
    }
  },

  // 完成口语测评
  async completeSpeakingAssessment() {
    wx.showLoading({ title: '提交中...' });

    try {
      const app = getApp();
      const openId = app.globalData.openId;
      
      if (openId) {
        const assessmentId = this.getAssessmentId();
        const existing = await cloudDB.get('speaking_answers', {
          _openid: openId,
          assessmentId: assessmentId
        });

        if (existing.success && existing.data.length > 0) {
          await cloudDB.update('speaking_answers', existing.data[0]._id, {
            status: 'completed',
            completeTime: new Date()
          });
        }
      }

      wx.hideLoading();
      
      // 根据模式决定跳转
      if (this.data.mode === 'full') {
        // 完整测评模式：跳转到阅读测评
        wx.navigateTo({
          url: '/pages/assessment/reading/reading?mode=full'
        });
      } else {
        // 单项测评模式：返回首页
        wx.showToast({
          title: '口语测评完成',
          icon: 'success',
          duration: 1500
        });
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/home/home'
          });
        }, 1500);
      }
    } catch (error) {
      console.error('[完成测评] 失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      });
    }
  },

  // 返回首页
  goToHome() {
    wx.switchTab({
      url: '/pages/home/home'
    });
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [CLOUD_IMAGES.iconMic, CLOUD_IMAGES.iconCheck];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconMic: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconCheck: urlMap[CLOUD_IMAGES.iconCheck] || '',
      });
    } catch (e) {
      console.error('[口语测评] 加载图片 URL 失败', e);
    }
  },
});
