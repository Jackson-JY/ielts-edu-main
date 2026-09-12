// pages/login/login.js
const { CLOUD_IMAGES } = require('../../config/images');
const cloudStorage = require('../../utils/cloudStorage');
const app = getApp();

Page({
  data: {
    isLoading: false,
    // 当前正在执行的登录方式：'' 空闲 | 'phone' 手机号一键登录 | 'wechat' 微信登录
    // 用于让只有被点击的按钮进入 loading，避免两个按钮同时显示"登录中"
    loginMethod: '',
    // 是否已勾选同意协议（默认 false，必须用户主动勾选）
    agreed: false,
    // Logo 云存储临时链接
    logoUrl: '',
  },

  async onLoad() {
    // 已登录则直接跳过
    if (app.globalData.isLoggedIn && app.globalData.userInfo) {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    // Logo 存于云存储，解析为 HTTPS 临时链接（cloudStorage 内置 50 分钟缓存）
    cloudStorage.getTempUrl(CLOUD_IMAGES.logo).then((url) => {
      if (url && url.indexOf('http') === 0) {
        this.setData({ logoUrl: url });
      }
    });
  },

  // ======================================================
  // 协议勾选
  // ======================================================
  /** 勾选 / 取消勾选 协议同意 */
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  /** 校验是否已同意协议，未同意则提示 */
  _ensureAgreed() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并勾选同意协议', icon: 'none' });
      return false;
    }
    return true;
  },

  /** 未勾选协议时点击按钮区域（遮罩拦截），提示先勾选协议 */
  onMaskTap() {
    this._ensureAgreed();
  },

  showAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=user' });
  },

  showPrivacy() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' });
  },

  // ======================================================
  // 路径一：手机号一键登录（主推，一次点击完成）
  // ======================================================
  /**
   * getPhoneNumber 授权回调
   * 用户点击"手机号一键登录"按钮后，微信弹出原生授权弹窗：
   *   - 同意 → e.detail.code（动态令牌）→ 云函数换手机号并完成登录
   *   - 拒绝 / 组件不可用 → 询问是否降级为微信静默登录
   */
  async onGetPhoneNumber(e) {
    // 未勾选协议：不处理授权结果（按钮上方有遮罩拦截点击，此处兜底）
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并勾选同意协议', icon: 'none' });
      return;
    }
    if (this.data.isLoading) return;

    const detail = e.detail || {};
    const phoneCode = detail.code;

    if (phoneCode) {
      await this._loginByPhoneCode(phoneCode);
      return;
    }

    // 用户拒绝授权手机号，或小程序未开通手机号验证组件
    const denied = detail.errMsg && detail.errMsg.indexOf('deny') > -1;
    if (denied) {
      // 用户主动拒绝 → 询问是否改用微信登录
      wx.showModal({
        title: '提示',
        content: '未授权手机号，是否使用微信身份直接登录？',
        confirmText: '微信登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.handleWechatLogin();
          }
        },
      });
    } else {
      // 组件不可用（如个人主体未开通）→ 直接走微信静默登录
      this.handleWechatLogin();
    }
  },

  /**
   * 用手机号动态令牌完成一键登录
   * @param {string} phoneCode - getPhoneNumber 回调中的 code
   */
  async _loginByPhoneCode(phoneCode) {
    this.setData({ isLoading: true, loginMethod: 'phone' });

    try {
      const cloudRes = await wx.cloud.callFunction({
        name: 'loginByPhone',
        data: { phoneCode },
      });
      const result = cloudRes.result || {};

      // 黑名单
      if (result.error === 'BLOCKED') {
        this.setData({ isLoading: false, loginMethod: '' });
        wx.showModal({
          title: '无法登录',
          content: '该账号已被禁用，如有疑问请联系客服。',
          showCancel: false,
          confirmText: '知道了',
        });
        return;
      }

      if (!result.success || !result.user) {
        // 手机号组件不可用 → 降级为微信静默登录
        console.warn('[登录] loginByPhone 返回失败，降级为微信登录', result);
        this.setData({ isLoading: false, loginMethod: '' });
        this.handleWechatLogin();
        return;
      }

      // 一键登录成功
      this._completeLogin(result.user, result.isNewUser);
    } catch (e) {
      console.error('[登录] loginByPhone 调用失败，降级为微信登录', e);
      this.setData({ isLoading: false, loginMethod: '' });
      this.handleWechatLogin();
    }
  },

  // ======================================================
  // 路径二：微信静默登录（兜底 / 次按钮）
  // ======================================================
  async handleWechatLogin() {
    if (this.data.isLoading) return;
    if (!this._ensureAgreed()) return;
    this.setData({ isLoading: true, loginMethod: 'wechat' });

    try {
      // 1. 调用云函数获取 openid（并服务端判定黑名单 + 记录本次登录尝试）
      const cloudRes = await wx.cloud.callFunction({ name: 'getOpenId', data: { countAttempt: true } });
      const openId = cloudRes.result && cloudRes.result.openid;

      if (!openId) throw new Error('未获取到 openid');

      // 黑名单用户拒绝登录
      if (cloudRes.result && cloudRes.result.blocked) {
        this.setData({ isLoading: false, loginMethod: '' });
        wx.showModal({
          title: '无法登录',
          content: '该账号已被禁用，如有疑问请联系客服。',
          showCancel: false,
          confirmText: '知道了',
        });
        return;
      }

      // 2. 查询 users 集合（云开发权限自动按 _openid 过滤）
      const db = wx.cloud.database();
      const userRes = await db.collection('users').get();

      if (userRes.data && userRes.data.length > 0) {
        // 老用户 → 记录登录次数后完成登录
        const user = userRes.data[0];
        this._recordLogin(db, user._id);
        this._completeLogin(
          {
            nickName: user.nickName || '微信用户',
            avatarUrl: user.avatarUrl || '',
            openId,
            userId: user._id,
            phone: user.phone || '',
            isAdmin: user.isAdmin === true,
            profileIncomplete: !user.avatarUrl || !user.nickName || user.nickName === '微信用户',
          },
          false,
        );
      } else {
        // 新用户 → 静默创建账号（默认昵称，之后在"我的"页完善资料）
        const now = new Date();
        const addRes = await db.collection('users').add({
          data: {
            nickName: '微信用户',
            avatarUrl: '',
            studyDays: 0,
            vocabulary: 0,
            listeningScore: 0,
            speakingScore: 0,
            readingScore: 0,
            writingScore: 0,
            loginCount: 1,
            loginAttempts: 1,
            lastLoginAt: now,
            lastAttemptAt: now,
            _createTime: now,
          },
        });

        this._completeLogin(
          {
            nickName: '微信用户',
            avatarUrl: '',
            openId,
            userId: addRes._id,
            phone: '',
            isAdmin: false,
            profileIncomplete: true,
          },
          true,
        );
      }
    } catch (e) {
      console.error('[登录] 获取 openid 或查询用户失败', e);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      this.setData({ isLoading: false, loginMethod: '' });
    }
  },

  // ======================================================
  // 内部方法
  // ======================================================

  /**
   * 记录一次登录：loginCount 原子自增，更新 lastLoginAt
   * 失败不影响登录主流程，仅记录日志
   */
  _recordLogin(db, userId) {
    if (!userId) return;
    db.collection('users').doc(userId).update({
      data: {
        loginCount: db.command.inc(1),
        lastLoginAt: new Date(),
      },
    }).catch((e) => {
      console.error('[登录统计] 记录登录次数失败', e);
    });
  },

  /**
   * 完成登录流程
   * @param {Object} userInfo - 用户信息
   * @param {boolean} isNewUser - 是否新用户（新用户跳测评，老用户跳首页）
   */
  _completeLogin(userInfo, isNewUser) {
    app.setLoginStatus(userInfo);

    // 资料未完善 → 提示可稍后在"我的"页设置头像昵称
    if (userInfo.profileIncomplete) {
      wx.showToast({ title: '登录成功，可在"我的"页完善资料', icon: 'none', duration: 1500 });
    } else {
      wx.showToast({ title: '登录成功', icon: 'success', duration: 1200 });
    }

    setTimeout(() => {
      if (isNewUser) {
        wx.redirectTo({ url: '/pages/assessment/intro/intro' });
      } else {
        wx.switchTab({ url: '/pages/home/home' });
      }
    }, 1500);
  },
});
