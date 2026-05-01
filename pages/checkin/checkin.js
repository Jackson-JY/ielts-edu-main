// pages/checkin/checkin.js

Page({
  data: {
    currentStreak: 7,
    totalDays: 15,
    achievementCount: 3,
    currentMonth: 4,
    currentYear: 2026,
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    todayChecked: false,
    checkinFeed: [
      {
        avatar: '👦',
        name: '张同学',
        text: '坚持打卡第15天！',
        time: '2小时前',
      },
      {
        avatar: '👧',
        name: '李同学',
        text: '完成了今日课程',
        time: '3小时前',
      },
      {
        avatar: '👨',
        name: '王同学',
        text: '获得7天成就徽章',
        time: '5小时前',
      },
    ],
  },

  onLoad() {
    this.initCalendar();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.checkTodayStatus();
  },

  // 初始化日历
  initCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    this.setData({
      currentYear: year,
      currentMonth: month,
    });

    this.generateCalendarDays();
    this.checkTodayStatus();
  },

  // 生成日历天数
  generateCalendarDays() {
    const { currentYear, currentMonth } = this.data;
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay();

    const today = new Date();
    const todayStr = today.toDateString();

    // 模拟打卡数据（实际应该从云数据库加载）
    const checkedDays = [1, 2, 3, 4, 5, 6, 7, 10, 12, 15, 16, 17, 18, 19, 20];

    const calendarDays = [];

    // 填充前面的空白
    for (let i = 0; i < startDay; i++) {
      calendarDays.push({
        day: '',
        isCurrentMonth: false,
        isToday: false,
        isChecked: false,
      });
    }

    // 填充日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(currentYear, currentMonth - 1, i);
      const isToday = date.toDateString() === todayStr;
      const isChecked = checkedDays.includes(i);

      calendarDays.push({
        day: i,
        isCurrentMonth: true,
        isToday,
        isChecked,
      });
    }

    this.setData({ calendarDays });
  },

  // 检查今日打卡状态
  checkTodayStatus() {
    // TODO: 从云数据库检查今日是否已打卡
    const todayChecked = false; // 模拟数据
    this.setData({ todayChecked });
  },

  // 上一个月
  prevMonth() {
    let { currentMonth, currentYear } = this.data;

    if (currentMonth === 1) {
      currentMonth = 12;
      currentYear -= 1;
    } else {
      currentMonth -= 1;
    }

    this.setData({
      currentMonth,
      currentYear,
    });

    this.generateCalendarDays();
  },

  // 下一个月
  nextMonth() {
    let { currentMonth, currentYear } = this.data;

    if (currentMonth === 12) {
      currentMonth = 1;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }

    this.setData({
      currentMonth,
      currentYear,
    });

    this.generateCalendarDays();
  },

  // 执行打卡
  doCheckin() {
    if (this.data.todayChecked) {
      wx.showToast({
        title: '今日已打卡',
        icon: 'none',
      });
      return;
    }

    // TODO: 保存到云数据库
    console.log('执行打卡');

    this.setData({
      todayChecked: true,
      currentStreak: this.data.currentStreak + 1,
      totalDays: this.data.totalDays + 1,
    });

    wx.showToast({
      title: '打卡成功！',
      icon: 'success',
    });

    // 刷新日历
    this.generateCalendarDays();
  },

  onShareAppMessage() {
    return {
      title: '我已坚持打卡15天，一起来学习吧！',
      path: '/pages/checkin/checkin',
    };
  },
});
