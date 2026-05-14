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
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconListening: urlMap[CLOUD_IMAGES.iconHeadphones] || '',
        iconSpeaking: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconReading: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconWriting: urlMap[CLOUD_IMAGES.iconPen] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
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
    const deadline = hw.deadline ? new Date(hw.deadline) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = deadline ? Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)) : null;

    const subject = hw.subject || this.mapTypeToSubject(hw.type) || '阅读';
    const description = hw.description || hw.content || '';
    const status = hw.status || (hw.submitted ? 'completed' : 'pending');

    let createTimeFormatted = '';
    if (hw._createTime) {
      const createDate = new Date(hw._createTime);
      createTimeFormatted = createDate.getFullYear() + '-' +
        String(createDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(createDate.getDate()).padStart(2, '0');
    } else if (hw.date) {
      createTimeFormatted = hw.date;
    }

    return {
      id: hw._id,
      title: hw.title || '未命名作业',
      subject: subject,
      subjectLabel: this.getSubjectLabel(subject),
      subjectColor: this.getSubjectColor(subject),
      subjectIcon: this.getSubjectIcon(subject),
      description: description,
      deadline: hw.deadline,
      deadlineFormatted: deadline ? (deadline.getFullYear() + '年' + (deadline.getMonth() + 1) + '月' + deadline.getDate() + '日') : '无截止日期',
      daysLeft: daysLeft,
      isUrgent: daysLeft !== null && daysLeft <= 3 && daysLeft >= 0,
      isOverdue: daysLeft !== null && daysLeft < 0,
      status: status,
      isCompleted: status === 'completed' || hw.submitted === true,
      courseName: hw.courseName || '',
      courseId: hw.courseId || '',
      completion: hw.completion || 0,
      timeSpent: hw.timeSpent || 0,
      score: hw.score,
      totalScore: hw.totalScore,
      feedback: hw.feedback || '',
      attachments: hw.attachments || [],
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

  // 完成度输入
  onCompletionInput(e) {
    const value = e.detail.value;
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

  previewAttachment(e) {
    const { url } = e.currentTarget.dataset;
    if (url) {
      wx.showModal({
        title: '打开附件',
        content: '是否在外部浏览器打开附件？',
        success: (res) => {
          if (res.confirm) {
            wx.setClipboardData({
              data: url,
              success: () => {
                wx.showToast({ title: '链接已复制', icon: 'success' });
              }
            });
          }
        }
      });
    }
  },
});
