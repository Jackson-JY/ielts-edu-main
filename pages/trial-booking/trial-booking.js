// pages/trial-booking/trial-booking.js
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');
const { formatDate } = require('../../utils/dateUtil');

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
      couponCode: '',
    },
    levelOptions: ['零基础', '初级 (4.0-5.0)', '中级 (5.0-6.0)', '中高级 (6.0-7.0)', '高级 (7.0+)'],
    levelIndex: 0,
    goalOptions: ['留学申请', '移民加分', '职业规划', '兴趣提升', '其他'],
    goalIndex: 0,
    canSubmit: false,
    isLoading: false,
    originalPrice: 400,
    finalPrice: 400,
    couponApplied: false,
    couponDiscount: 0,
    // 优惠码从云数据库加载
    validCoupons: {},
    // 课程封面图
    courseImageUrl: '',
    iconTarget: '',
    iconBook: '',
    iconDocument: '',
  },

  async onLoad() {
    this.initAvailableDates();
    this.loadCoupons();
    await this.loadImages();
  },

  async loadImages() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.trialCourse,
        CLOUD_IMAGES.iconTarget,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconDocument,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        courseImageUrl: urlMap[CLOUD_IMAGES.trialCourse] || '',
        iconTarget: urlMap[CLOUD_IMAGES.iconTarget] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconDocument: urlMap[CLOUD_IMAGES.iconDocument] || '',
      });
    } catch (e) {
      console.error('[试听预约] 加载图片失败', e);
    }
  },

  /**
   * 初始化可用日期
   */
  initAvailableDates() {
    const dates = [];
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const now = new Date();

    for (let i = 1; i <= 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      dates.push({
        date: formatDate(date),
        weekday: weekdays[date.getDay()],
        day: date.getDate(),
        month: (date.getMonth() + 1) + '月',
      });
    }

    this.setData({
      availableDates: dates,
      selectedDate: dates[0].date,
    });

    this.loadTimeSlots(dates[0].date);
  },

  /**
   * 从云数据库加载优惠码
   */
  async loadCoupons() {
    try {
      const res = await cloudDB.get('coupons', (q) => q.where({ active: true }));
      if (res.success && res.data.length > 0) {
        const coupons = {};
        res.data.forEach(c => { coupons[c.code] = c.discount; });
        this.setData({ validCoupons: coupons });
      } else {
        // 备用默认优惠码
        this.setData({
          validCoupons: { 'IELTS100': 100, 'IELTS50': 50, 'WELCOME': 80, 'VIP200': 200, 'STUDENT': 120 },
        });
      }
    } catch (e) {
      console.error('加载优惠码失败', e);
      this.setData({
        validCoupons: { 'IELTS100': 100, 'IELTS50': 50, 'WELCOME': 80, 'VIP200': 200, 'STUDENT': 120 },
      });
    }
  },

  /**
   * 从云数据库加载时间段
   */
  async loadTimeSlots(date) {
    this.setData({ isLoading: true });
    try {
      const res = await cloudDB.get('time_slots', (q) =>
        q.where({ date, available: true }).orderBy('order', 'asc')
      );

      if (res.success && res.data.length > 0) {
        this.setData({ timeSlots: res.data });
      } else {
        // 无数据时显示默认时间段
        this.setData({
          timeSlots: [
            { time: '09:00-10:00', available: true },
            { time: '10:30-11:30', available: true },
            { time: '14:00-15:00', available: false },
            { time: '15:30-16:30', available: true },
            { time: '19:00-20:00', available: true },
            { time: '20:30-21:30', available: false },
          ],
        });
      }
    } catch (e) {
      console.error('加载时间段失败', e);
      this.setData({
        timeSlots: [
          { time: '09:00-10:00', available: true },
          { time: '10:30-11:30', available: true },
          { time: '14:00-15:00', available: false },
          { time: '15:30-16:30', available: true },
          { time: '19:00-20:00', available: true },
          { time: '20:30-21:30', available: false },
        ],
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({ selectedDate: date, selectedTime: '' });
    this.loadTimeSlots(date);
  },

  selectTime(e) {
    const { time, available } = e.currentTarget.dataset;
    if (!available) {
      wx.showToast({ title: '该时间段已满', icon: 'none' });
      return;
    }
    this.setData({ selectedTime: time });
    this.checkCanSubmit();
  },

  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`formData.${field}`]: value });
    this.checkCanSubmit();
  },

  onLevelChange(e) {
    const index = e.detail.value;
    this.setData({ levelIndex: index, 'formData.level': this.data.levelOptions[index] });
    this.checkCanSubmit();
  },

  onGoalChange(e) {
    const index = e.detail.value;
    this.setData({ goalIndex: index, 'formData.goal': this.data.goalOptions[index] });
    this.checkCanSubmit();
  },

  checkCanSubmit() {
    const { name, phone, level, goal } = this.data.formData;
    const phoneRegex = /^1[3-9]\d{9}$/;
    const canSubmit = name && phone && phoneRegex.test(phone) && level && goal && this.data.selectedTime;
    this.setData({ canSubmit });
  },

  applyCoupon() {
    const { couponCode } = this.data.formData;
    const { validCoupons, originalPrice } = this.data;
    if (!couponCode) {
      wx.showToast({ title: '请输入优惠码', icon: 'none' });
      return;
    }
    const code = couponCode.toUpperCase().trim();
    if (validCoupons[code]) {
      const discount = validCoupons[code];
      const finalPrice = Math.max(0, originalPrice - discount);
      this.setData({ couponApplied: true, couponDiscount: discount, finalPrice });
      wx.showToast({ title: `优惠 ¥${discount}`, icon: 'success' });
    } else {
      wx.showToast({ title: '优惠码无效', icon: 'none' });
      this.setData({ couponApplied: false, couponDiscount: 0, finalPrice: originalPrice });
    }
  },

  /**
   * 提交预约（保存到云数据库）
   */
  async submitBooking() {
    if (!this.data.canSubmit) return;

    const { formData, selectedDate, selectedTime } = this.data;
    this.setData({ isLoading: true });

    wx.showLoading({ title: '提交中...' });

    try {
      const res = await cloudDB.addMy('trial_bookings', {
        date: selectedDate,
        time: selectedTime,
        name: formData.name,
        phone: formData.phone,
        level: formData.level,
        goal: formData.goal,
        couponCode: formData.couponCode || '',
        price: this.data.finalPrice,
        originalPrice: this.data.originalPrice,
        paid: true,
        status: 'pending',
      });

      wx.hideLoading();

      if (res.success) {
        wx.showModal({
          title: '预约成功',
          content: `您已成功预约试听课程，老师会在24小时内联系您确认上课时间。`,
          showCancel: false,
          confirmText: '知道了',
          success: () => { wx.navigateBack(); },
        });
      } else {
        wx.showToast({ title: '预约失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('提交预约失败', e);
      wx.showToast({ title: '预约失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  },
});
