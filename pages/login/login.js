// pages/login/login.js
const app = getApp();
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

Page({
  data: {
    isLoading: false,
    // 是否已勾选同意协议（默认 false，必须用户主动勾选）
    agreed: false,
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

  async handleWechatLogin() {
    if (this.data.isLoading) return;
    // 必须先勾选同意协议
    if (!this._ensureAgreed()) return;
    this.setData({ isLoading: true });

    try {
      // 1. 调用云函数获取 openid（并服务端判定黑名单 + 记录本次登录尝试）
      const cloudRes = await wx.cloud.callFunction({ name: 'getOpenId', data: { countAttempt: true } });
      const openId = cloudRes.result && cloudRes.result.openid;

      if (!openId) throw new Error('未获取到 openid');

      // 黑名单用户拒绝登录
      if (cloudRes.result && cloudRes.result.blocked) {
        this.setData({ isLoading: false });
        wx.showModal({
          title: '无法登录',
          content: '该账号已被禁用，如有疑问请联系客服。',
          showCancel: false,
          confirmText: '知道了',
        });
        return;
      }

      // 2. 查询 users 集合
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
    // 必须先勾选同意协议
    if (!this._ensureAgreed()) return;

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
          // 登录统计：新用户首次注册即第 1 次登录
          loginCount: 1,
          loginAttempts: 1,
          lastLoginAt: new Date(),
          lastAttemptAt: new Date(),
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

  // ======================================================
  // 内部方法
  // ======================================================

  /**
   * 记录一次登录：loginCount 原子自增，更新 lastLoginAt
   * 失败不影响登录主流程，仅记录日志
   * @param {Object} db - 云数据库实例
   * @param {string} userId - 用户文档 _id
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
  // 协议弹窗
  // ======================================================
  showAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=user' });
  },

  showPrivacy() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' });
  },
});
