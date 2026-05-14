// pages/login/login.js
const app = getApp();
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

Page({
  data: {
    isLoading: false,
    openId: '',
    isOldUser: false,
    tempAvatarUrl: '',
    tempNickName: '',
    // 云存储图标临时 URL
    logoUrl: '',
    iconUser: '',
  },

  async onLoad() {
    // 已登录则直接跳过
    if (app.globalData.isLoggedIn && app.globalData.userInfo) {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    await this.loadImageUrls();
  },

  /**
   * 加载云存储图片临时 URL
   */
  async loadImageUrls() {
    try {
      const fileIDs = [CLOUD_IMAGES.logo, CLOUD_IMAGES.iconUser];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        logoUrl: urlMap[CLOUD_IMAGES.logo] || '',
        iconUser: urlMap[CLOUD_IMAGES.iconUser] || '',
      });
    } catch (e) {
      console.error('[登录页] 加载图片 URL 失败', e);
    }
  },

  // ======================================================
  // Step 1：获取 OpenID 并检查用户状态
  // ======================================================
  async handleWechatLogin() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    try {
      // 1. 调用云函数获取 openid
      const cloudRes = await wx.cloud.callFunction({ name: 'getOpenId' });
      const openId = cloudRes.result && cloudRes.result.openid;

      if (!openId) throw new Error('未获取到 openid');

      // 2. 查询 users 集合
      const db = wx.cloud.database();
      const userRes = await db.collection('users').get();

      if (userRes.data && userRes.data.length > 0) {
        // 老用户 → 直接完成登录
        const user = userRes.data[0];
        this._completeLogin(
          {
            nickName: user.nickName || '微信用户',
            avatarUrl: user.avatarUrl || '',
            openId,
            userId: user._id,
            isAdmin: user.isAdmin === true,
          },
          false,
        );
      } else {
        // 新用户 → 显示授权按钮，等待用户点击
        this.setData({ openId, isOldUser: false, isLoading: false });
      }
    } catch (e) {
      console.error('[登录] 获取 openid 或查询用户失败', e);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  // ======================================================
  // Step 2：用户选择头像和输入昵称
  // ======================================================
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatarUrl: avatarUrl });
  },

  onNickNameInput(e) {
    const nickName = e.detail.value;
    this.setData({ tempNickName: nickName });
  },

  async handleCompleteRegister() {
    if (this.data.isLoading) return;

    const { openId, tempAvatarUrl, tempNickName } = this.data;

    if (!openId) {
      wx.showToast({ title: '请先点击登录', icon: 'none' });
      return;
    }

    if (!tempNickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ isLoading: true });

    try {
      let finalAvatarUrl = tempAvatarUrl;

      // 如果用户选择了头像（本地临时文件），上传到云存储
      if (tempAvatarUrl && (tempAvatarUrl.startsWith('wxfile://') || tempAvatarUrl.startsWith('http'))) {
        finalAvatarUrl = await this._uploadAvatar(tempAvatarUrl);
      }

      await this._registerNewUser(openId, {
        nickName: tempNickName.trim(),
        avatarUrl: finalAvatarUrl,
      });
    } catch (e) {
      wx.showToast({ title: '注册失败，请重试', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  /**
   * 上传头像到云存储
   */
  async _uploadAvatar(tempFilePath) {
    try {
      const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`;
      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath,
      });
      return res.fileID;
    } catch (e) {
      console.error('[上传头像] 失败', e);
      return '';
    }
  },

  /**
   * 新用户注册
   */
  async _registerNewUser(openId, userInfo) {
    try {
      const nickName = userInfo.nickName || '微信用户';
      const avatarUrl = userInfo.avatarUrl || '';

      // 创建用户记录
      const db = wx.cloud.database();
      const addRes = await db.collection('users').add({
        data: {
          nickName: nickName,
          avatarUrl: avatarUrl,
          studyDays: 0,
          vocabulary: 0,
          listeningScore: 0,
          speakingScore: 0,
          readingScore: 0,
          writingScore: 0,
          _createTime: new Date(),
        },
      });

      // 完成登录
      this._completeLogin(
        {
          nickName: nickName,
          avatarUrl: avatarUrl,
          openId,
          userId: addRes._id,
        },
        true,
      );
    } catch (e) {
      console.error('[注册] 失败', e);
      wx.showToast({ title: '注册失败，请重试', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  /**
   * 使用默认信息注册
   */
  async _registerWithDefaultInfo(openId) {
    this.setData({ isLoading: true });
    try {
      const db = wx.cloud.database();
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
          _createTime: new Date(),
        },
      });

      this._completeLogin(
        {
          nickName: '微信用户',
          avatarUrl: '',
          openId,
          userId: addRes._id,
        },
        true,
      );
    } catch (e) {
      wx.showToast({ title: '注册失败，请重试', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  // ======================================================
  // 内部方法
  // ======================================================

  /**
   * 完成登录流程
   * @param {Object} userInfo - 用户信息
   * @param {boolean} isNewUser - 是否新用户（新用户跳测评，老用户跳首页）
   */
  _completeLogin(userInfo, isNewUser) {
    app.setLoginStatus(userInfo);

    wx.showToast({ title: '登录成功', icon: 'success', duration: 1200 });

    setTimeout(() => {
      if (isNewUser) {
        wx.redirectTo({ url: '/pages/assessment/intro/intro' });
      } else {
        wx.switchTab({ url: '/pages/home/home' });
      }
    }, 1200);
  },

  // ======================================================
  // 游客模式
  // ======================================================
  handleSkipLogin() {
    app.setLoginStatus({
      nickName: '游客',
      avatarUrl: '',
      isGuest: true,
    });
    wx.switchTab({ url: '/pages/home/home' });
  },

  // ======================================================
  // 协议弹窗
  // ======================================================
  showAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '本小程序遵循相关法律法规，收集的用户信息仅用于提供英语教学服务，不会泄露给任何第三方。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  showPrivacy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们高度重视您的隐私安全，承诺不会将您的个人信息泄露给任何第三方。如您有疑问，请联系客服。',
      showCancel: false,
      confirmText: '知道了',
    });
  },
});
