// pages/homework-detail/homework-detail.js - 作业详情页
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

Page({
  data: {
    homework: null,
    loading: true,
    // 科目图标
    iconListening: '',
    iconSpeaking: '',
    iconReading: '',
    iconWriting: '',
    iconBook: '',
    iconCalendar: '',
    iconChart: '',
    iconDocument: '',
    iconCheck: '',
    iconFire: '',
  },

  async onLoad(options) {
    await this.loadIcons();
    const { id } = options;
    if (id) {
      await this.loadHomeworkDetail(id);
    } else {
      wx.showToast({ title: '作业ID无效', icon: 'none' });
      wx.navigateBack();
    }
  },

  /**
   * 加载云存储图标
   */
  async loadIcons() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconPen,
        CLOUD_IMAGES.iconCalendar,
        CLOUD_IMAGES.iconChart,
        CLOUD_IMAGES.iconDocument,
        CLOUD_IMAGES.iconCheck,
        CLOUD_IMAGES.iconFire,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconListening: urlMap[CLOUD_IMAGES.iconHeadphones] || '',
        iconSpeaking: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconReading: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconWriting: urlMap[CLOUD_IMAGES.iconPen] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconCalendar: urlMap[CLOUD_IMAGES.iconCalendar] || '',
        iconChart: urlMap[CLOUD_IMAGES.iconChart] || '',
        iconDocument: urlMap[CLOUD_IMAGES.iconDocument] || '',
        iconCheck: urlMap[CLOUD_IMAGES.iconCheck] || '',
        iconFire: urlMap[CLOUD_IMAGES.iconFire] || '',
      });
    } catch (e) {
      console.error('[作业详情] 加载图标失败', e);
    }
  },

  async loadHomeworkDetail(id) {
    try {
      const res = await cloudDB.getMy('homework', (q) =>
        q.where({ _id: id })
      );

      if (res.success && res.data.length > 0) {
        const hw = res.data[0];
        this.setData({
          homework: this.formatHomeworkDetail(hw),
          loading: false,
        });
      } else {
        wx.showToast({ title: '作业不存在', icon: 'none' });
        wx.navigateBack();
      }
    } catch (e) {
      console.error('加载作业详情失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  formatHomeworkDetail(hw) {
    const subject = hw.subject || this.mapTypeToSubject(hw.type) || '阅读';
    const description = hw.description || hw.content || '';
    const status = hw.status || (hw.submitted ? 'completed' : 'pending');

    let createTimeFormatted = '';
    if (hw._createTime) {
      const createDate = new Date(hw._createTime);
      createTimeFormatted = createDate.getFullYear() + '年' +
        (createDate.getMonth() + 1) + '月' + createDate.getDate() + '日';
    } else if (hw.date) {
      createTimeFormatted = hw.date;
    }

    const completion = Math.min(100, Math.max(0, parseInt(hw.completion) || 0));

    return {
      id: hw._id,
      title: hw.title || '未命名作业',
      subject: subject,
      subjectLabel: this.getSubjectLabel(subject),
      subjectColor: this.getSubjectColor(subject),
      subjectIcon: this.getSubjectIcon(subject),
      description: description,
      status: status,
      isCompleted: status === 'completed' || hw.submitted === true,
      courseName: hw.courseName || '',
      courseId: hw.courseId || '',
      completion: completion,
      timeSpent: hw.timeSpent || 0,
      estimatedTime: hw.estimatedTime || 0,
      createTimeFormatted: createTimeFormatted,
    };
  },

  mapTypeToSubject(type) {
    const typeMap = {
      'listening': '听力',
      'reading': '阅读',
      'writing': '写作',
      'speaking': '口语',
    };
    return typeMap[type] || type;
  },

  getSubjectLabel(subject) {
    const labelMap = {
      'listening': '听力',
      'reading': '阅读',
      'writing': '写作',
      'speaking': '口语',
      '听力': '听力',
      '阅读': '阅读',
      '写作': '写作',
      '口语': '口语',
    };
    return labelMap[subject] || subject;
  },

  /**
   * 获取科目对应的颜色
   */
  getSubjectColor(subject) {
    const colorMap = {
      '听力': '#A7FBF5',
      '阅读': '#FFD4B8',
      '写作': '#FFE8F0',
      '口语': '#E8D4F8',
    };
    return colorMap[subject] || '#D4E8FF';
  },

  /**
   * 获取科目对应的图标
   */
  getSubjectIcon(subject) {
    const iconMap = {
      '听力': this.data.iconListening,
      '阅读': this.data.iconReading,
      '写作': this.data.iconWriting,
      '口语': this.data.iconSpeaking,
    };
    return iconMap[subject] || this.data.iconBook;
  },

  async updateHomeworkStatus() {
    const { homework } = this.data;
    if (!homework) return;

    try {
      const db = wx.cloud.database();
      const updateData = {
        status: homework.completion >= 100 ? 'completed' : 'pending',
        submitted: homework.completion >= 100,
        completion: parseInt(homework.completion) || 0,
        timeSpent: parseInt(homework.timeSpent) || 0,
      };
      
      if (homework.completion >= 100) {
        updateData.completedAt = db.serverDate();
        updateData.submittedAt = db.serverDate();
      }
      
      await db.collection('homework').doc(homework.id).update({
        data: updateData
      });

      wx.showToast({ title: '作业状态已更新！', icon: 'success' });
      this.setData({
        'homework.status': updateData.status,
        'homework.isCompleted': updateData.submitted,
      });

      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage && prevPage.loadAllHomework) {
        prevPage.loadAllHomework();
      }
    } catch (e) {
      console.error('更新作业状态失败', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 完成度输入（钳制在 0~100）
  onCompletionInput(e) {
    let value = parseInt(e.detail.value) || 0;
    value = Math.min(100, Math.max(0, value));
    this.setData({
      'homework.completion': value
    });
  },

  // 累计时长输入
  onTimeSpentInput(e) {
    const value = e.detail.value;
    this.setData({
      'homework.timeSpent': value
    });
  },

  goBack() {
    wx.navigateBack();
  },
});
