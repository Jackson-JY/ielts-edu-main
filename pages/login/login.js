// pages/login/login.js
const app = getApp();

Page({
  data: {
    isLoading: false
  },

  onLoad() {},

  /**
   * 微信一键登录
   * @description 使用微信头像昵称填写能力进行登录
   * @deprecated wx.getUserProfile 已弃用，使用新方法
   */
  handleWechatLogin() {
    this.setData({ isLoading: true });
    
    // ✅ 修复：使用新的登录方案
    // 方案1: 使用 wx.login 获取 code，发送到后端换取 openid
    // 方案2: 使用微信头像昵称填写能力（推荐）
    
    wx.showModal({
      title: '登录提示',
      content: '我们将使用您的微信头像和昵称来创建账号',
      success: (res) => {
        if (res.confirm) {
          // 实际项目中，这里应该：
          // 1. 调用 wx.login 获取 code
          // 2. 发送 code 到后端获取 session
          // 3. 使用按钮组件获取用户头像和昵称
          
          // 模拟登录成功
          const userInfo = {
            nickName: '微信用户',
            avatarUrl: '',
            gender: 0,
            city: '',
            province: '',
            country: ''
          };
          
          // 设置登录状态
          app.setLoginStatus(userInfo);
          
          wx.showToast({
            title: '登录成功',
            icon: 'success',
          });
          
          // 跳转到测评介绍页
          setTimeout(() => {
            wx.redirectTo({
              url: '/pages/assessment/intro/intro',
            });
          }, 1500);
        } else {
          this.setData({ isLoading: false });
        }
      }
    });
  },

  /**
   * 头像选择回调
   * @description 用于获取用户头像（新方案）
   * @param {Object} e - 事件对象
   */
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    
    // 这里可以上传头像到服务器
    console.log('选择的头像:', avatarUrl);
    
    // 保存到全局数据
    const userInfo = app.globalData.userInfo || {};
    userInfo.avatarUrl = avatarUrl;
    app.setLoginStatus(userInfo);
  },

  /**
   * 昵称输入回调
   * @description 用于获取用户昵称（新方案）
   * @param {Object} e - 事件对象
   */
  onInputNickname(e) {
    const nickName = e.detail.value;
    
    // 保存到全局数据
    const userInfo = app.globalData.userInfo || {};
    userInfo.nickName = nickName;
    app.setLoginStatus(userInfo);
  },

  // 跳过登录
  handleSkipLogin() {
    // 设置游客模式
    app.setLoginStatus({
      nickName: '游客',
      avatarUrl: '',
      isGuest: true,
    });

    // 跳转到首页
    wx.switchTab({
      url: '/pages/home/home',
    });
  },
});
