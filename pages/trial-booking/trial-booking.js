// pages/trial-booking/trial-booking.js
Page({
  data: {
    selectedDate: '',
    selectedTime: '',
    availableDates: [],
    timeSlots: [],
    formData: {
      name: '',
      phone: '',
      level: '',
      goal: '',
      couponCode: ''
    },
    levelOptions: ['零基础', '初级 (4.0-5.0)', '中级 (5.0-6.0)', '中高级 (6.0-7.0)', '高级 (7.0+)'],
    levelIndex: 0,
    goalOptions: ['留学申请', '移民加分', '职业规划', '兴趣提升', '其他'],
    goalIndex: 0,
    canSubmit: false,
    isLoading: false,
    // 价格相关
    originalPrice: 400,
    finalPrice: 400,
    couponApplied: false,
    couponDiscount: 0,
    // 模拟优惠码数据（实际应从服务器获取）
    validCoupons: {
      'IELTS100': 100,
      'IELTS50': 50,
      'WELCOME': 80,
      'VIP200': 200,
      'STUDENT': 120
    }
  },

  onLoad() {
    this.initAvailableDates();
    this.initTimeSlots();
  },

  /**
   * 初始化可用日期
   * @description 生成未来7天的可选日期列表
   */
  initAvailableDates() {
    const dates = [];
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const now = new Date();
    
    for (let i = 1; i <= 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      
      dates.push({
        date: this.formatDate(date),
        weekday: weekdays[date.getDay()],
        day: date.getDate(),
        month: (date.getMonth() + 1) + '月'
      });
    }
    
    this.setData({
      availableDates: dates,
      selectedDate: dates[0].date
    });
    
    this.loadTimeSlots(dates[0].date);
  },

  /**
   * 初始化时间段
   * @description 设置可选的时间段列表
   */
  initTimeSlots() {
    // ✅ 模拟数据，实际应从服务器获取
    const slots = [
      { time: '09:00-10:00', available: true },
      { time: '10:30-11:30', available: true },
      { time: '14:00-15:00', available: false },
      { time: '15:30-16:30', available: true },
      { time: '19:00-20:00', available: true },
      { time: '20:30-21:30', available: false }
    ];
    
    this.setData({
      timeSlots: slots
    });
  },

  /**
   * 格式化日期为 YYYY-MM-DD
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的日期字符串
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 选择日期
   * @param {Object} e - 事件对象
   */
  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({
      selectedDate: date,
      selectedTime: ''
    });
    this.loadTimeSlots(date);
  },

  /**
   * 加载时间段
   * @description 根据日期从服务器加载可用时间段
   * @param {string} date - 选中的日期
   */
  loadTimeSlots(date) {
    // TODO: 从服务器获取该日期的可用时间段
    console.log('加载日期的可用时间段:', date);
    
    // 模拟：不同日期可能有不同的可用时间
    // 实际项目中应该调用 API
  },

  /**
   * 选择时间段
   * @param {Object} e - 事件对象
   */
  selectTime(e) {
    const { time, available } = e.currentTarget.dataset;
    
    if (!available) {
      wx.showToast({
        title: '该时间段已满',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      selectedTime: time
    });
    
    this.checkCanSubmit();
  },

  /**
   * 输入框内容变化
   * @param {Object} e - 事件对象
   */
  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`formData.${field}`]: value
    });
    
    this.checkCanSubmit();
  },

  /**
   * 英语水平选择变化
   * @param {Object} e - 事件对象
   */
  onLevelChange(e) {
    const index = e.detail.value;
    this.setData({
      levelIndex: index,
      'formData.level': this.data.levelOptions[index]
    });
    
    this.checkCanSubmit();
  },

  /**
   * 学习目标选择变化
   * @param {Object} e - 事件对象
   */
  onGoalChange(e) {
    const index = e.detail.value;
    this.setData({
      goalIndex: index,
      'formData.goal': this.data.goalOptions[index]
    });
    
    this.checkCanSubmit();
  },

  /**
   * ✅ 增强：验证是否可以提交
   * @description 使用正则表达式验证手机号格式
   */
  checkCanSubmit() {
    const { name, phone, level, goal } = this.data.formData;

    // 手机号正则：1开头，第二位3-9，共11位
    const phoneRegex = /^1[3-9]\d{9}$/;

    const canSubmit = name &&
                     phone &&
                     phoneRegex.test(phone) &&
                     level &&
                     goal &&
                     this.data.selectedTime;

    this.setData({
      canSubmit
    });
  },

  /**
   * 应用优惠码
   * @description 验证并应用优惠码，计算减免金额
   */
  applyCoupon() {
    const { couponCode } = this.data.formData;
    const { validCoupons, originalPrice } = this.data;

    if (!couponCode) {
      wx.showToast({
        title: '请输入优惠码',
        icon: 'none'
      });
      return;
    }

    // 转换为大写进行匹配
    const code = couponCode.toUpperCase().trim();

    if (validCoupons[code]) {
      const discount = validCoupons[code];
      const finalPrice = Math.max(0, originalPrice - discount);

      this.setData({
        couponApplied: true,
        couponDiscount: discount,
        finalPrice: finalPrice
      });

      wx.showToast({
        title: `优惠 ¥${discount}`,
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: '优惠码无效',
        icon: 'none'
      });

      // 重置优惠状态
      this.setData({
        couponApplied: false,
        couponDiscount: 0,
        finalPrice: originalPrice
      });
    }
  },

  /**
   * 提交预约
   * @description 验证并提交试听预约
   */
  submitBooking() {
    if (!this.data.canSubmit) {
      return;
    }
    
    const { formData, selectedDate, selectedTime } = this.data;
    
    this.setData({ isLoading: true });
    
    wx.showLoading({
      title: '提交中...'
    });
    
    // 模拟提交预约
    setTimeout(() => {
      wx.hideLoading();
      
      this.setData({ isLoading: false });
      
      wx.showModal({
        title: '支付成功',
        content: `您已成功支付 ¥${this.data.finalPrice} 预约试听课程，老师会在24小时内联系您确认上课时间。`,
        showCancel: false,
        confirmText: '知道了',
        success: () => {
          wx.navigateBack();
        }
      });
    }, 1500);
  }
});
