// pages/homework-detail/homework-detail.js - 作业详情页
const cloudDB = require('../../utils/cloudDB');
const { mapTypeToSubject, getSubjectLabel } = require('../../utils/subjectUtil');

Page({
  data: {
    homework: null,
    loading: true,
  },

  async onLoad(options) {
    const { id } = options;
    if (id) {
      await this.loadHomeworkDetail(id);
    } else {
      wx.showToast({ title: '作业ID无效', icon: 'none' });
      wx.navigateBack();
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
    const subject = hw.subject || mapTypeToSubject(hw.type) || '阅读';
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
      subjectLabel: getSubjectLabel(subject),
      subjectColor: this.getSubjectColor(subject),
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

  /**
   * 获取科目对应的颜色
   */
  getSubjectColor(subject) {
    const colorMap = {
      '听力': '#E6F7F5',
      '阅读': '#FFF1E5',
      '写作': '#FFE5EC',
      '口语': '#F0E6FA',
    };
    return colorMap[subject] || '#E5E5EA';
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

      wx.showToast({ title: '作业状态已更新', icon: 'success' });
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
