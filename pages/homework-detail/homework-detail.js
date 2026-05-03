// pages/homework-detail/homework-detail.js - 作业详情页
const cloudDB = require('../../utils/cloudDB');

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

  /**
   * 格式化作业详情数据（兼容新旧格式）
   */
  formatHomeworkDetail(hw) {
    const deadline = hw.deadline ? new Date(hw.deadline) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = deadline ? Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)) : null;

    // 兼容新旧字段
    const subject = hw.subject || this.mapTypeToSubject(hw.type) || '综合';
    const description = hw.description || hw.content || '';
    const status = hw.status || (hw.submitted ? 'completed' : 'pending');

    // 格式化创建时间
    let createTimeFormatted = '';
    if (hw._createTime) {
      const createDate = new Date(hw._createTime);
      createTimeFormatted = `${createDate.getFullYear()}-${String(createDate.getMonth() + 1).padStart(2, '0')}-${String(createDate.getDate()).padStart(2, '0')}`;
    } else if (hw.date) {
      createTimeFormatted = hw.date;
    }\n
    return {
      id: hw._id,
      title: hw.title || '未命名作业',
      subject: subject,
      subjectLabel: this.getSubjectLabel(subject),
      description: description,
      deadline: hw.deadline,
      deadlineFormatted: deadline ? `${deadline.getFullYear()}年${deadline.getMonth() + 1}月${deadline.getDate()}日` : '无截止日期',
      daysLeft: daysLeft,
      isUrgent: daysLeft !== null && daysLeft <= 3 && daysLeft >= 0,
      isOverdue: daysLeft !== null && daysLeft < 0,
      status: status,
      isCompleted: status === 'completed' || hw.submitted === true,
      courseName: hw.courseName || '',
      courseId: hw.courseId || '',
      score: hw.score,
      totalScore: hw.totalScore,
      feedback: hw.feedback || '',
      attachments: hw.attachments || [],
      createTimeFormatted: createTimeFormatted,
    };
  },

  /**
   * 将旧 type 字段映射到 subject
   */
  mapTypeToSubject(type) {
    const typeMap = {
      'listening': '听力',
      'reading': '阅读',
      'writing': '写作',
      'speaking': '口语',
    };
    return typeMap[type] || type;
  },

  /**
   * 获取科目显示标签
   */
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

  // 标记作业完成
  async markAsComplete() {
    const { homework } = this.data;
    if (!homework || homework.isCompleted) return;

    try {
      const db = wx.cloud.database();
      await db.collection('homework').doc(homework.id).update({
        data: {
          status: 'completed',
          submitted: true,
          completedAt: db.serverDate(),
          submittedAt: db.serverDate(),
        }
      });

      wx.showToast({ title: '已完成作业！', icon: 'success' });
      
      // 更新本地状态
      this.setData({
        'homework.status': 'completed',
        'homework.isCompleted': true,
      });
      
      // 返回上一页并刷新
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage && prevPage.loadPendingHomework) {
        prevPage.loadPendingHomework();
      }
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (e) {
      console.error('标记完成失败', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 预览附件
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
