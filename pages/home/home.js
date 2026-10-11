// pages/home/home.js
const app = getApp();
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');
const { formatDate } = require('../../utils/dateUtil');
const { generatePoster, preload: preloadPoster } = require('../../utils/poster');

// 科目颜色映射（兼容历史英文 key 与中文/自定义标签）
const SUBJECT_COLOR = {
  listening: '#5AC8FA', 听力: '#5AC8FA',
  reading: '#34C759', 阅读: '#34C759',
  writing: '#AF52DE', 写作: '#AF52DE',
  speaking: '#FF9500', 口语: '#FF9500',
};
const getSubjectColor = (s) => SUBJECT_COLOR[s] || '#8E8E93';

// 打卡成功后的随机激励文案
const ENCOURAGE_MESSAGES = [
  '坚持就是胜利，你又往目标迈进了一步。',
  '今天的努力，是未来的底气。',
  '保持节奏，雅思高分可期。',
  '每一次打卡，都是给未来的自己写信。',
  '哪怕只前进一小步，也是了不起的胜利。',
  '相信积累的力量。',
];

const DAILY_QUOTES = [
  '今天也要保持专注。',
  '每天进步一点点，时间会给你答案。',
  '慢慢来，比较快。你已经做得很好了。',
  '今天的坚持，是明天的底气。',
  '学习这件事，贵在每天都来一下。',
  '把今天过好，未来自然会好。',
  '相信积累的力量，你一定可以。',
  '深呼吸，今天又是充满可能的一天。',
  '哪怕只前进一小步，也是了不起的胜利。',
  '保持节奏，稳步向前。',
];

Page({
  data: {
    userName: '学习者',
    currentDate: '',
    dailyQuote: '',
    todayCourses: 0,
    submittedHomework: 0,
    totalHomework: 0,
    studyDays: 0,
    streakDays: 0,
    defaultAvatarUrl: '',
    // 打卡分享卡片缩略图临时链接
    shareImageUrl: '',
    userAvatar: '',

    // ===== 今日打卡任务 =====
    dailyTask: null,           // { _id, date, items:[{id,subject,content,suggestMinutes}], totalMinutes }
    dailyTaskLoading: false,
    taskItems: [],             // 合并完成态后的任务项 [{id,subject,content,suggestMinutes,done,actualMinutes}]
    completedCount: 0,
    totalItems: 0,
    allDone: false,

    // ===== 弹窗 =====
    showCelebration: false,
    celebrationMessage: '',

    // 实际用时输入弹窗
    showMinutesInput: false,
    minutesInputItemId: '',
    minutesInputContent: '',
    minutesInputValue: '',
    minutesSubmitting: false,

    // ===== 海报生成 =====
    posterGenerating: false,
    posterCanvasId: 'posterCanvas',

    // 生成结果页内预览
    showPosterPreview: false,
    posterTempPath: '',
    posterSaving: false,
  },

  async onLoad(options) {
    this.initDate();
    await this.loadAvatarUrl();
    this.loadShareImageUrl();

    // 扫码落地：from=poster 时弹轻提示
    if (options && options.scene) {
      try {
        const scene = decodeURIComponent(options.scene);
        if (scene.indexOf('from=poster') > -1) {
          wx.showToast({ title: '欢迎一起打卡', icon: 'none' });
        }
      } catch (e) { /* ignore */ }
    }

    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });

    this.loadUserData();
    this.loadDailyTask();
  },

  async loadAvatarUrl() {
    try {
      const urlMap = await cloudStorage.getTempUrls([CLOUD_IMAGES.defaultAvatar]);
      this.setData({
        defaultAvatarUrl: urlMap[CLOUD_IMAGES.defaultAvatar] || '',
      });
    } catch (e) {
      console.error('[首页] 加载默认头像 URL 失败', e);
    }
  },

  // 预取分享卡片缩略图（临时链接，带本地缓存；失败时分享兜底直接用 fileID）
  async loadShareImageUrl() {
    try {
      const url = await cloudStorage.getTempUrl(CLOUD_IMAGES.checkinShare);
      if (url) this.setData({ shareImageUrl: url });
    } catch (e) { /* 分享时用 fileID 兜底 */ }
  },

  onShow() {
    this.pickDailyQuote();
    this.loadUserData();
    this.loadDailyTask();
  },

  // 首屏渲染完成后静默预热海报资源（随机背景 + 小程序码），点击生成时秒出图
  onReady() {
    preloadPoster({ canvasId: 'posterCanvas', componentContext: null });
  },

  ensureLogin() {
    if (app.globalData.isLoggedIn && app.globalData.userInfo) return true;
    wx.showModal({
      title: '登录提示',
      content: '登录后才能使用该功能，是否前往登录？',
      confirmText: '去登录',
      cancelText: '再看看',
      success: (r) => {
        if (r.confirm) wx.navigateTo({ url: '/pages/login/login' });
      },
    });
    return false;
  },

  pickDailyQuote() {
    const dailyQuote = DAILY_QUOTES[Math.floor(Math.random() * DAILY_QUOTES.length)];
    this.setData({ dailyQuote });
  },

  initDate() {
    const now = new Date();
    const currentDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    this.setData({ currentDate });
  },

  async loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      if (userInfo) {
        if (userInfo.nickName) this.setData({ userName: userInfo.nickName });
        if (userInfo.avatarUrl) {
          const userAvatar = await cloudStorage.getTempUrl(userInfo.avatarUrl);
          this.setData({ userAvatar });
        }
      }

      const today = formatDate(new Date());
      const userId = userInfo && userInfo.userId;

      const [coursesRes, homeworkRes, userRes] = await Promise.all([
        userId
          ? cloudDB.get('courses', (q) => q.where({ studentId: userId, date: today }))
          : Promise.resolve({ success: true, data: [] }),
        cloudDB.getMy('homework'),
        cloudDB.getMy('users'),
      ]);

      const todayCourses = coursesRes.success ? coursesRes.data.length : 0;
      const totalHomework = homeworkRes.success ? homeworkRes.data.length : 0;
      const submittedHomework = homeworkRes.success
        ? homeworkRes.data.filter(h => h.status === 'completed' || h.status === 'submitted' || h.submitted === true).length
        : 0;

      let studyDays = 0;
      if (userRes.success && userRes.data.length > 0) {
        studyDays = userRes.data[0].studyDays || 0;
      }

      this.setData({ todayCourses, submittedHomework, totalHomework, studyDays });
    } catch (e) {
      console.error('加载用户数据失败', e);
    }
  },

  /**
   * 加载今日任务 + 当日打卡完成态
   */
  async loadDailyTask() {
    this.setData({ dailyTaskLoading: true });
    try {
      const today = formatDate(new Date());

      // 1. 取今日任务
      const taskRes = await wx.cloud.callFunction({
        name: 'getDailyTasks',
        data: { action: 'getByDate', date: today },
      });
      const task = taskRes.result && taskRes.result.task;
      if (!task) {
        this.setData({
          dailyTask: null,
          taskItems: [],
          completedCount: 0,
          totalItems: 0,
          allDone: false,
          dailyTaskLoading: false,
        });
        return;
      }

      // 2. 取当日打卡记录（合并完成态）
      let doneMap = {};
      try {
        const recRes = await cloudDB.getMy('checkin_records', (q) => q.where({ date: today }));
        if (recRes.success && recRes.data.length > 0) {
          (recRes.data[0].items || []).forEach((it) => {
            doneMap[it.id] = { done: !!it.done, actualMinutes: it.actualMinutes || 0 };
          });
        }
      } catch (e) { /* 忽略 */ }

      const taskItems = (task.items || []).map((it) => ({
        id: it.id,
        taskId: it.taskId || task._id, // 班级合并任务时每项来源任务不同
        subject: it.subject,
        subjectColor: getSubjectColor(it.subject),
        content: it.content,
        suggestMinutes: it.suggestMinutes,
        done: doneMap[it.id] ? doneMap[it.id].done : false,
        actualMinutes: doneMap[it.id] ? doneMap[it.id].actualMinutes : 0,
      }));

      const completedCount = taskItems.filter((it) => it.done).length;

      this.setData({
        dailyTask: task,
        taskItems,
        completedCount,
        totalItems: taskItems.length,
        allDone: completedCount === taskItems.length && taskItems.length > 0,
        dailyTaskLoading: false,
      });
    } catch (e) {
      console.error('[loadDailyTask] 失败', e);
      this.setData({ dailyTaskLoading: false });
    }
  },

  // 跳转到课程页
  goToCourses() {
    wx.switchTab({ url: '/pages/courses/courses' });
  },

  goToAssessment() {
    wx.navigateTo({ url: '/pages/assessment/intro/intro' });
  },

  /**
   * 点击任务行：切换完成态
   * - 未完成 → 弹实际用时输入（可选）
   * - 已完成 → 直接取消
   */
  onTapTaskItem(e) {
    if (!this.ensureLogin()) return;
    const { id } = e.currentTarget.dataset;
    const item = this.data.taskItems.find((it) => it.id === id);
    if (!item) return;

    if (item.done) {
      // 已完成 → 取消完成
      this.submitToggle(id, false, 0);
    } else {
      // 未完成 → 弹用时输入
      this.setData({
        showMinutesInput: true,
        minutesInputItemId: id,
        minutesInputContent: item.content,
        minutesInputValue: '',
      });
    }
  },

  onMinutesInput(e) {
    this.setData({ minutesInputValue: e.detail.value });
  },

  closeMinutesInput() {
    if (this.data.minutesSubmitting) return;
    this.setData({ showMinutesInput: false });
  },

  // 确认打卡（可填实际用时，留空则 0）
  async onConfirmMinutes() {
    if (this.data.minutesSubmitting) return;
    const id = this.data.minutesInputItemId;
    const minutes = parseInt(this.data.minutesInputValue, 10) || 0;
    this.setData({ minutesSubmitting: true });
    await this.submitToggle(id, true, minutes);
    this.setData({ minutesSubmitting: false, showMinutesInput: false });
  },

  /**
   * 调用 submitCheckin 切换任务完成态
   */
  async submitToggle(itemId, done, actualMinutes) {
    const task = this.data.dailyTask;
    if (!task) return;
    const item = (this.data.taskItems || []).find((it) => it.id === itemId);
    const today = formatDate(new Date());

    try {
      const res = await wx.cloud.callFunction({
        name: 'submitCheckin',
        data: {
          action: 'toggle',
          date: today,
          taskId: (item && item.taskId) || task._id,
          itemId,
          done,
          actualMinutes,
          totalItems: this.data.totalItems || undefined, // 班级合并任务的总项数
        },
      });
      const result = res.result;
      if (!result || !result.success) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        return;
      }

      // 乐观更新本地
      const taskItems = this.data.taskItems.map((it) =>
        it.id === itemId ? { ...it, done, actualMinutes: done ? actualMinutes : 0 } : it
      );
      const completedCount = taskItems.filter((it) => it.done).length;
      const allDone = completedCount === this.data.totalItems && this.data.totalItems > 0;

      this.setData({ taskItems, completedCount, allDone, streakDays: result.streakDays || this.data.streakDays });

      // 全部完成 → 庆祝弹窗
      if (allDone) {
        this.showCelebrationAllDone();
      } else if (done) {
        // 单项完成轻提示
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
      }
    } catch (e) {
      console.error('[submitToggle] 失败', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  /**
   * 全部完成庆祝弹窗（底部两个出口：转发 + 生成海报）
   */
  showCelebrationAllDone() {
    const message = ENCOURAGE_MESSAGES[Math.floor(Math.random() * ENCOURAGE_MESSAGES.length)];
    this.setData({
      showCelebration: true,
      celebrationMessage: message,
    });
    wx.vibrateShort && wx.vibrateShort({ type: 'medium' });
  },

  hideCelebration() {
    this.setData({ showCelebration: false });
  },

  // ===== 分享 =====
  onShareAppMessage() {
    const { totalItems, allDone, shareImageUrl } = this.data;
    const title = allDone && totalItems > 0
      ? `我完成了今天全部 ${totalItems} 项学习任务，一起来 Deer Edu 打卡`
      : '听说读写每日打卡，一起来 Deer Edu 坚持学习';
    return {
      title,
      path: '/pages/home/home',
      imageUrl: shareImageUrl || CLOUD_IMAGES.checkinShare,
    };
  },

  onShareTimeline() {
    const { totalItems, allDone, shareImageUrl } = this.data;
    const title = allDone && totalItems > 0
      ? `我完成了今天全部 ${totalItems} 项学习任务，一起来 Deer Edu 打卡`
      : '听说读写每日打卡，一起来 Deer Edu 坚持学习';
    return {
      title,
      query: '',
      imageUrl: shareImageUrl || CLOUD_IMAGES.checkinShare,
    };
  },

  // ===== 海报生成 =====
  // 生成海报（随机云端背景 + 随机励志语，无需选择科目）
  async generatePoster() {
    if (this.data.posterGenerating) return;
    this.setData({ posterGenerating: true });
    wx.showLoading({ title: '生成中…' });

    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const res = await generatePoster({
        streakDays: this.data.streakDays,
        date: formatDate(now),
        time,
        canvasId: this.data.posterCanvasId,
        componentContext: null,
      });

      wx.hideLoading();
      this.setData({
        posterGenerating: false,
        posterTempPath: res.tempFilePath,
        showPosterPreview: true,
      });
    } catch (e) {
      console.error('[generatePoster] 失败', e);
      wx.hideLoading();
      this.setData({ posterGenerating: false });
      const msg = (e && (e.errMsg || e.message)) || '生成失败，请重试';
      wx.showToast({ title: String(msg).slice(0, 20), icon: 'none', duration: 3000 });
    }
  },

  closePosterPreview() {
    this.setData({ showPosterPreview: false });
  },

  // 保存海报到相册（页内预览弹层中触发，不跳系统图片查看器）
  savePosterToAlbum() {
    const filePath = this.data.posterTempPath;
    if (!filePath || this.data.posterSaving) return;
    this.setData({ posterSaving: true });

    wx.saveImageToPhotosAlbum({
      filePath,
      success: async () => {
        this.setData({ posterSaving: false });
        wx.showToast({ title: '已保存到相册', icon: 'success' });
        // 回写 posterSavedAt
        try {
          await wx.cloud.callFunction({
            name: 'submitCheckin',
            data: { action: 'updatePosterSaved', date: formatDate(new Date()) },
          });
        } catch (e) { /* ignore */ }
      },
      fail: (err) => {
        this.setData({ posterSaving: false });
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('auth deny') > -1 || msg.indexOf('authorize') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启相册权限后重试',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) wx.openSetting();
            },
          });
        } else if (msg.indexOf('cancel') === -1) {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      },
    });
  },
});
