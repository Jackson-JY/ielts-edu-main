// app.js
App({
  onLaunch() {
    // 检查登录状态
    this.checkLoginStatus();
    
    // 设置全局错误处理
    this.setupErrorHandler();
  },

  globalData: {
    isLoggedIn: false,
    userInfo: null,
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
      }
    } catch (e) {
      console.error('检查登录状态失败', e);
    }
  },

  /**
   * 设置登录状态
   * @param {Object} userInfo - 用户信息
   * @description 保存登录状态到全局和本地缓存
   */
  setLoginStatus(userInfo) {
    this.globalData.isLoggedIn = true;
    this.globalData.userInfo = userInfo;
    
    try {
      wx.setStorageSync('loginInfo', {
        isLoggedIn: true,
        userInfo: userInfo,
      });
    } catch (e) {
      console.error('保存登录状态失败', e);
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
