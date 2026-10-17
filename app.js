// app.js
const pomodoroManager = require('./utils/pomodoroManager');

App({
  onLaunch() {
    // 番茄钟：装配全局状态机（方法挂 app 实例，状态挂 globalData.pomodoro）
    // 页面/组件仍通过 getApp().pomodoroXxx() 与 getApp().globalData.pomodoro 访问
    Object.assign(this, pomodoroManager.methods);
    this._pomodoroTimer = null;
    this._pomodoroListeners = [];
    this.globalData.pomodoro = pomodoroManager.createInitialState();

    // 初始化云开发环境
    this.initCloud();

    // 检查登录状态
    this.checkLoginStatus();

    // 设置全局错误处理
    this.setupErrorHandler();
  },

  /**
   * 小程序每次回到前台都校验黑名单：
   * 已登录用户被拉黑后，无需冷启动即可在下次回到前台时被主动踢出登录。
   * （冷启动时 onLaunch → onShow 也会触发一次，覆盖启动场景）
   */
  onShow() {
    this.verifyNotBlocked();
  },

  /**
   * 登录守卫：未登录则跳转登录页并返回 false
   * 各 tab 页 onShow 调用：if (!getApp().requireLogin()) return;
   */
  requireLogin() {
    if (this.globalData.isLoggedIn && this.globalData.userInfo) return true;
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  },

  /**
   * 校验当前登录用户是否已被拉黑；若是则主动登出并回登录页
   * 标志位防止弹窗/跳转重复触发
   */
  async verifyNotBlocked() {
    if (!this.globalData.isLoggedIn) return;
    if (this._blockHandling) return;
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      if (res && res.result && res.result.blocked) {
        this._blockHandling = true;
        this.logout();
        wx.reLaunch({ url: '/pages/login/login' });
        wx.showModal({
          title: '账号已被禁用',
          content: '该账号已被禁用，如有疑问请联系客服。',
          showCancel: false,
          confirmText: '知道了',
          complete: () => { this._blockHandling = false; },
        });
      }
    } catch (e) {
      // 校验失败不阻断使用（网络异常等）
      console.error('[黑名单校验] 失败', e);
    }
  },

  /**
   * 初始化云开发
   * @description 调用 wx.cloud.init()，需在微信开发者工具中开通云开发
   * 将 env 替换为你的云开发环境 ID
   */
  initCloud() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上版本的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: 'cloud1-d7g66xvli7bb6bcc6',
      traceUser: true,
    });
  },

  globalData: {
    isLoggedIn: false,
    userInfo: null,
    openId: null,     // 微信用户唯一标识，登录后填充
    // 云数据库引用（懒加载）
    _db: null,
    get db() {
      if (!this._db) {
        this._db = wx.cloud.database();
      }
      return this._db;
    },

    /**
     * 番茄时钟全局状态：onLaunch 时由 utils/pomodoroManager.createInitialState() 填充
     * 放在 globalData 而非 page 层，保证跨页切换时计时不中断。
     */
    pomodoro: null,
  },

  // ─────────────────────────────────────────────────────────────
  //  系统事件
  // ─────────────────────────────────────────────────────────────

  /**
   * 设置全局错误处理
   * @description 捕获并处理未处理的错误
   */
  setupErrorHandler() {
    wx.onError((error) => {
      console.error('全局错误:', error);
      this.reportError(error);
    });

    // 切到后台：番茄钟停 interval 节电（计时不中断，startAt 保持）
    wx.onAppHide(() => {
      this.pomodoroHandleHide();
    });

    // 切回前台：番茄钟重启 interval 并校正剩余时间
    wx.onAppShow(() => {
      this.pomodoroHandleShow();
    });
  },

  /**
   * 上报错误到监控系统
   */
  reportError(error) {
    console.error('错误上报:', error);
  },

  /**
   * 检查登录状态
   * @description 从本地缓存恢复登录状态
   */
  checkLoginStatus() {
    try {
      const loginInfo = wx.getStorageSync('loginInfo');
      if (loginInfo && loginInfo.isLoggedIn) {
        this.globalData.isLoggedIn = true;
        this.globalData.userInfo = loginInfo.userInfo;
        if (loginInfo.userInfo && loginInfo.userInfo.openId) {
          this.globalData.openId = loginInfo.userInfo.openId;
        }
      }
    } catch (e) {
      console.error('检查登录状态失败', e);
    }
  },

  /**
   * 设置登录状态
   */
  setLoginStatus(userInfo) {
    this.globalData.isLoggedIn = true;
    this.globalData.userInfo = userInfo;
    if (userInfo && userInfo.openId) {
      this.globalData.openId = userInfo.openId;
    }
    try {
      wx.setStorageSync('loginInfo', {
        isLoggedIn: true,
        userInfo: userInfo,
      });
    } catch (e) {
      // 保存登录状态失败
    }
  },

  /**
   * 退出登录
   */
  logout() {
    this.globalData.isLoggedIn = false;
    this.globalData.userInfo = null;
    this.globalData.openId = null;
    try {
      wx.removeStorageSync('loginInfo');
    } catch (e) {
      console.error('清除登录状态失败', e);
    }
  },
});
