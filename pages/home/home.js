// pages/home/home.js
const app = getApp();
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');
const { formatDate } = require('../../utils/dateUtil');
const { calculateStreak } = require('../../utils/checkinUtil');

// 打卡成功后的随机激励文案，给足情绪价值
const ENCOURAGE_MESSAGES = [
  '坚持就是胜利，你又往目标迈进了一步！',
  '今天的努力，都是未来的底气～',
  '太棒了！你比昨天更进步了一点点！',
  '保持这个节奏，雅思高分指日可待！',
  '自律的人最美，继续加油！',
  '每一次打卡，都是给未来的自己写信。',
];

// 首页问候语下方的随机鼓励文案，每次进入页面随机展示，给足情绪价值
const DAILY_QUOTES = [
  '今天也要元气满满地学习呀 ✨',
  '你正在变成更好的自己，别停下～',
  '每天进步一点点，时间会给你答案。',
  '慢慢来，比较快。你已经做得很好了 🌱',
  '今天的坚持，是明天的底气。',
  '别急，高分正在路上向你招手 👋',
  '学习这件事，贵在每天都来一下。',
  '你比想象中更优秀，继续闪闪发光 ⭐',
  '把今天过好，未来自然会好。',
  '相信积累的力量，你一定可以的！',
  '深呼吸，今天又是充满可能的一天 🌤️',
  '哪怕只前进一小步，也是了不起的胜利。',
];

Page({
  data: {
    userName: "学习者",
    currentDate: "",
    dailyQuote: "",
    todayCourses: 0,
    submittedHomework: 0,
    totalHomework: 0,
    studyDays: 0,
    streakDays: 0,
    // 云存储图标（使用临时 URL）
    defaultAvatarUrl: '',
    userAvatar: '',
    iconUser: '',
    iconBook: '',
    iconTarget: '',
    iconChart: '',
    iconCalendar: '',
    iconFire: '',
    iconHeadphones: '',
    iconMic: '',
    iconPen: '',

    // 听说读写打卡模块
    checkinModules: [
      { id: 'listening', label: '听力', icon: '', bgColor: 'rgba(18, 183, 168, 0.12)', checkedToday: false },
      { id: 'speaking', label: '口语', icon: '', bgColor: 'rgba(23, 33, 43, 0.08)', checkedToday: false },
      { id: 'reading', label: '阅读', icon: '', bgColor: 'rgba(18, 183, 168, 0.20)', checkedToday: false },
      { id: 'writing', label: '写作', icon: '', bgColor: 'rgba(122, 135, 148, 0.14)', checkedToday: false },
    ],

    // 打卡激励动效弹窗
    showCelebration: false,
    celebrationIcon: '',
    celebrationLabel: '',
    celebrationMessage: '',
    // 当前打卡科目标签，用于分享文案
    _shareSubjectLabel: '',

    // 打卡内容输入弹窗
    showCheckinInput: false,
    checkinInputId: '',        // 当前待打卡的模块 id
    checkinInputLabel: '',     // 模块名（听/说/读/写）
    checkinInputIcon: '',      // 模块图标
    checkinInputContent: '',   // 用户输入的打卡内容
    checkinSubmitting: false,  // 提交中（防重复点击）
  },

  async onLoad() {
    this.initDate();
    await this.loadImageUrls();
    this.loadUserData();

    // 开启分享面板中的"转发好友"和"分享到朋友圈"入口
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.defaultAvatar,
        CLOUD_IMAGES.iconUser,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconTarget,
        CLOUD_IMAGES.iconChart,
        CLOUD_IMAGES.iconCalendar,
        CLOUD_IMAGES.iconFire,
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconPen,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);

      const iconHeadphones = urlMap[CLOUD_IMAGES.iconHeadphones] || '';
      const iconMic = urlMap[CLOUD_IMAGES.iconMic] || '';
      const iconBook = urlMap[CLOUD_IMAGES.iconBook] || '';
      const iconPen = urlMap[CLOUD_IMAGES.iconPen] || '';

      // 听说读写四个模块各自对应的图标
      const moduleIconMap = {
        listening: iconHeadphones,
        speaking: iconMic,
        reading: iconBook,
        writing: iconPen,
      };
      const checkinModules = this.data.checkinModules.map(item => ({
        ...item,
        icon: moduleIconMap[item.id] || '',
      }));

      this.setData({
        defaultAvatarUrl: urlMap[CLOUD_IMAGES.defaultAvatar] || '',
        iconUser: urlMap[CLOUD_IMAGES.iconUser] || '',
        iconBook,
        iconTarget: urlMap[CLOUD_IMAGES.iconTarget] || '',
        iconChart: urlMap[CLOUD_IMAGES.iconChart] || '',
        iconCalendar: urlMap[CLOUD_IMAGES.iconCalendar] || '',
        iconFire: urlMap[CLOUD_IMAGES.iconFire] || '',
        iconHeadphones,
        iconMic,
        iconPen,
        checkinModules,
      });
    } catch (e) {
      console.error('[首页] 加载图片 URL 失败', e);
    }
  },

  onShow() {
    if (!app.requireLogin()) return;
    this.pickDailyQuote();
    this.loadUserData();
  },

  // 随机挑选一条鼓励语展示在问候语下方
  pickDailyQuote() {
    const dailyQuote = DAILY_QUOTES[Math.floor(Math.random() * DAILY_QUOTES.length)];
    this.setData({ dailyQuote });
  },

  // 初始化日期显示
  initDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const currentDate = `${year}年${month}月${day}日`;
    this.setData({ currentDate });
  },

  /**
   * 加载用户数据（从云数据库）
   * @description 从云数据库加载今日课程、作业、用户统计数据
   */
  async loadUserData() {
    try {
      const userInfo = app.globalData.userInfo;
      if (userInfo) {
        if (userInfo.nickName) {
          this.setData({ userName: userInfo.nickName });
        }
        if (userInfo.avatarUrl) {
          const userAvatar = await cloudStorage.getTempUrl(userInfo.avatarUrl);
          this.setData({ userAvatar });
        }
      }

      const today = formatDate(new Date());
      const userId = userInfo && userInfo.userId;

      // 并行加载多个数据源
      const [coursesRes, homeworkRes, userRes, checkinRes] = await Promise.all([
        // 1. 今日课程：按当前学员 studentId + 今天日期查询（与课程页一致的关联方式）
        userId
          ? cloudDB.get('courses', (q) => q.where({ studentId: userId, date: today }))
          : Promise.resolve({ success: true, data: [] }),
        // 2. 作业进度：当前用户全部作业（getMy 按 _openid 私有隔离），用 status 计算完成度
        cloudDB.getMy('homework'),
        // 3. 用户学习数据
        cloudDB.getMy('users'),
        // 4. 打卡记录（用于计算连续打卡）
        cloudDB.getMy('checkins'),
      ]);

      // 今日课程数
      const todayCourses = coursesRes.success ? coursesRes.data.length : 0;

      // 作业进度：总数 vs 已完成/已提交
      const totalHomework = homeworkRes.success ? homeworkRes.data.length : 0;
      const submittedHomework = homeworkRes.success
        ? homeworkRes.data.filter(h => h.status === 'completed' || h.status === 'submitted' || h.submitted === true).length
        : 0;

      // 用户学习数据（学习天数）
      let studyDays = 0, streakDays = 0;
      if (userRes.success && userRes.data.length > 0) {
        const user = userRes.data[0];
        studyDays = user.studyDays || 0;
      }

      // 计算连续打卡天数 + 今日各模块打卡状态
      let todayCheckedTypes = [];
      if (checkinRes.success && checkinRes.data.length > 0) {
        const dates = checkinRes.data.map(c => c.date);
        streakDays = calculateStreak(dates);

        todayCheckedTypes = checkinRes.data
          .filter(c => c.date === today)
          .flatMap(c => c.types || []);
      }

      const checkinModules = this.data.checkinModules.map(item => ({
        ...item,
        checkedToday: todayCheckedTypes.includes(item.id),
      }));

      this.setData({
        todayCourses,
        submittedHomework,
        totalHomework,
        studyDays,
        streakDays,
        checkinModules,
      });
    } catch (e) {
      console.error("加载用户数据失败", e);
    }
  },

  // 跳转到课程页
  goToCourses() {
    wx.switchTab({ url: "/pages/courses/courses" });
  },

  // 跳转到打卡记录页
  goToCheckin() {
    wx.navigateTo({ url: "/pages/checkin/checkin" });
  },

  // 跳转到学习报告页
  goToLearningReport() {
    wx.navigateTo({ url: "/pages/learning-report/learning-report" });
  },

  /**
   * 点击"听/说/读/写"任一模块完成今日打卡
   * @description 写入 checkins 集合，并展示激励动效弹窗，给足情绪价值
   */
  onTapCheckinModule(e) {
    const { id, label } = e.currentTarget.dataset;
    const module = this.data.checkinModules.find(m => m.id === id);

    if (!module) return;

    if (module.checkedToday) {
      wx.showToast({ title: `今天已经完成${label}打卡啦～`, icon: 'none' });
      return;
    }

    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录后再打卡', icon: 'none' });
      return;
    }

    // 打开自定义打卡内容输入弹窗（风格与庆祝弹窗统一）
    this.setData({
      showCheckinInput: true,
      checkinInputId: id,
      checkinInputLabel: label,
      checkinInputIcon: module.icon,
      checkinInputContent: '',
    });
  },

  // 打卡内容输入
  onCheckinInputContent(e) {
    this.setData({ checkinInputContent: e.detail.value });
  },

  // 关闭打卡输入弹窗（点遮罩或取消）
  closeCheckinInput() {
    if (this.data.checkinSubmitting) return; // 提交中不允许关闭
    this.setData({ showCheckinInput: false, checkinInputContent: '' });
  },

  /**
   * 确认打卡（内容可留空）
   * @description 写入 checkins 集合，成功后关闭输入弹窗并展示激励动效
   */
  async onConfirmCheckin() {
    if (this.data.checkinSubmitting) return;

    const id = this.data.checkinInputId;
    const module = this.data.checkinModules.find(m => m.id === id);
    if (!module) {
      this.setData({ showCheckinInput: false });
      return;
    }

    const content = (this.data.checkinInputContent || '').trim();
    this.setData({ checkinSubmitting: true });

    try {
      const today = formatDate(new Date());
      const res = await cloudDB.addMy('checkins', {
        date: today,
        types: [id],
        content,
        createdAt: new Date(),
      });

      if (res.success) {
        // 更新本地模块状态（今日已打卡）
        const checkinModules = this.data.checkinModules.map(item =>
          item.id === id ? { ...item, checkedToday: true } : item
        );
        this.setData({
          checkinModules,
          showCheckinInput: false,
          checkinInputContent: '',
          checkinSubmitting: false,
        });

        // 展示激励动效，给足情绪价值
        this.showCelebration(module);

        // 刷新连续打卡天数等统计
        this.loadUserData();
      } else {
        this.setData({ checkinSubmitting: false });
        wx.showToast({ title: '打卡失败，请重试', icon: 'none' });
      }
    } catch (err) {
      this.setData({ checkinSubmitting: false });
      console.error('[首页打卡] 失败', err);
      wx.showToast({ title: '打卡失败，请重试', icon: 'none' });
    }
  },

  /**
   * 显示打卡成功的激励动效弹窗
   * @param {Object} module - 当前打卡的模块 { id, label, icon }
   */
  showCelebration(module) {
    const message = ENCOURAGE_MESSAGES[Math.floor(Math.random() * ENCOURAGE_MESSAGES.length)];

    this.setData({
      showCelebration: true,
      celebrationIcon: module.icon,
      celebrationLabel: module.label,
      celebrationMessage: message,
      // 用于分享文案动态拼接
      _shareSubjectLabel: module.label,
    });

    // 轻震动反馈，增强"完成感"
    wx.vibrateShort && wx.vibrateShort({ type: 'medium' });
  },

  // 关闭激励动效弹窗
  hideCelebration() {
    this.setData({ showCelebration: false });
  },

  /**
   * 一键转发给好友
   * @description 由弹窗内 <button open-type="share"> 触发，实际回调为 onShareAppMessage
   */
  onTapShareToFriend() {
    // 交由 button[open-type="share"] 触发系统转发面板，这里仅做埋点占位
  },

  /**
   * 分享到朋友圈引导
   * @description 小程序无法直接拉起“分享到朋友圈”，需引导用户点击右上角“...”菜单选择
   */
  onTapShareToTimeline() {
    wx.showModal({
      title: '分享到朋友圈',
      content: '点击右上角 「···」按钮，选择「分享到朋友圈」即可让好友看到你的学习打卡～',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  /**
   * 转发给好友的分享内容
   */
  onShareAppMessage() {
    const subject = this.data._shareSubjectLabel;
    if (subject) {
      return {
        title: `我刚完成了${subject}打卡，一起来雅思学习吧！`,
        path: '/pages/home/home',
        imageUrl: this.data.defaultAvatarUrl || '',
      };
    }
    return {
      title: "雅思学习 - 一起来学习吧",
      path: "/pages/home/home",
    };
  },

  /**
   * 转发到朋友圈的分享内容
   */
  onShareTimeline() {
    const subject = this.data._shareSubjectLabel;
    return {
      title: subject ? `我已完成${subject}打卡，雅思学习每天进步一点点！` : '雅思学习 - 每天进步一点点',
      query: '',
      imageUrl: this.data.defaultAvatarUrl || '',
    };
  },
});
