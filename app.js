// app.js
App({
  onLaunch() {
    // 初始化云开发环境
    this.initCloud();

    // 检查登录状态
    this.checkLoginStatus();

    // 设置全局错误处理
    this.setupErrorHandler();
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
    console.log('[云开发] 初始化完成');
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
  },

  /**
   * 设置全局错误处理
   * @description 捕获并处理未处理的错误
   */
  setupErrorHandler() {
    // 捕获未处理的 Promise 错误
    wx.onError((error) => {
      console.error('全局错误:', error);
      // 这里可以上报到监控系统
      this.reportError(error);
    });

    // 捕获小程序要被关闭的事件
    wx.onAppHide(() => {
      console.log('小程序进入后台');
    });

    // 捕获小程序启动事件
    wx.onAppShow(() => {
      console.log('小程序进入前台');
    });
  },

  /**
   * 上报错误到监控系统
   * @param {string} error - 错误信息
   * @description 可以集成第三方监控服务
   */
  reportError(error) {
    // TODO: 集成错误监控服务
    // 例如：腾讯云监控、Sentry 等
    console.log('错误上报:', error);
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
   * @param {Object} userInfo - 用户信息（nickName / avatarUrl / openId / userId / isGuest）
   * @description 保存登录状态到全局 globalData 和本地缓存
   */
  setLoginStatus(userInfo) {
    this.globalData.isLoggedIn = true;
    this.globalData.userInfo = userInfo;
    // 方便各页面快速读取 openId
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
   * @description 清除登录状态和本地缓存
   */
  logout() {
    this.globalData.isLoggedIn = false;
    this.globalData.userInfo = null;
    
    try {
      wx.removeStorageSync('loginInfo');
    } catch (e) {
      console.error('清除登录状态失败', e);
    }
  },
});
