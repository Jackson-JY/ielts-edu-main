// pages/homework/homework.js - 作业页面逻辑
const cloudDB = require('../../utils/cloudDB');

Page({
  data: {
    // 未完成作业列表
    pendingHomework: [],
    // 已完成作业列表
    completedHomework: [],
    // 折叠状态
    pendingExpanded: false,
    completedExpanded: false,
  },

  async onLoad() {
    this.loadAllHomework();
  },

  onShow() {
    this.loadAllHomework();
  },

  /**
   * 加载所有作业并分类
   */
  async loadAllHomework() {
    try {
      const res = await cloudDB.getMy('homework', (q) =>
        q.orderBy('_updateTime', 'desc')
      );

      if (res.success) {
        // 过滤未完成作业
        const pendingList = res.data.filter(hw => {
          if (hw.status) {
            return ['pending', 'assigned', 'in_progress'].includes(hw.status);
          }
          if (hw.submitted !== undefined) {
            return !hw.submitted;
          }
          return true;
        });

        // 过滤已完成作业
        const completedList = res.data.filter(hw => {
          if (hw.status === 'completed' || hw.submitted === true) {
            return true;
          }
          return false;
        });

        const pendingHomework = pendingList.map(hw => this.formatHomeworkData(hw));
        const completedHomework = completedList.map(hw => this.formatHomeworkData(hw));

        this.setData({
          pendingHomework,
          completedHomework
        });
      }
    } catch (e) {
      console.error('加载作业失败', e);
    }
  },

  /**
   * 切换待完成列表折叠状态
   */
  togglePendingList() {
    this.setData({
      pendingExpanded: !this.data.pendingExpanded
    });
  },

  /**
   * 切换已完成列表折叠状态
   */
  toggleCompletedList() {
    this.setData({
      completedExpanded: !this.data.completedExpanded
    });
  },

  /**
   * 格式化作业数据（统一新旧格式）
   */
  formatHomeworkData(hw) {
    const deadline = hw.deadline ? new Date(hw.deadline) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = deadline ? Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)) : null;

    // 兼容新旧字段
    const subject = hw.subject || this.mapTypeToSubject(hw.type) || '综合';
    const description = hw.description || hw.content || '';
    const status = hw.status || (hw.submitted ? 'completed' : 'pending');

    return {
      id: hw._id,
      title: hw.title || '未命名作业',
      subject: subject,
      subjectLabel: this.getSubjectLabel(subject),
      deadline: hw.deadline,
      deadlineFormatted: deadline ? `${deadline.getMonth() + 1}月${deadline.getDate()}日` : '无截止日期',
      daysLeft: daysLeft,
      isUrgent: daysLeft !== null && daysLeft <= 3 && daysLeft >= 0,
      isOverdue: daysLeft !== null && daysLeft < 0,
      description: description,
      status: status,
      courseName: hw.courseName || '',
      score: hw.score,
      totalScore: hw.totalScore,
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

  /**
   * 点击作业卡片
   */
  onHomeworkTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/homework-detail/homework-detail?id=${id}`
    });
  },

  /**
   * 创建示例作业（用于测试）
   */
  async createSampleHomework() {
    try {
      const db = wx.cloud.database();
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const sampleHomeworks = [
        {
          title: '雅思听力练习 - Section 3',
          subject: '听力',
          description: '完成剑桥雅思15 Test 2 的听力 Section 3，注意抓取关键词',
          deadline: tomorrow.toISOString(),
          status: 'pending',
        },
        {
          title: '写作 Task 2 议论文',
          subject: '写作',
          description: '题目：Some people think that the best way to reduce crime is to give longer prison sentences. To what extent do you agree or disagree?',
          deadline: nextWeek.toISOString(),
          status: 'pending',
        },
        {
          title: '口语 Part 2 准备',
          subject: '口语',
          description: '准备一个 Describe a memorable journey 的话题，练习2分钟陈述',
          deadline: tomorrow.toISOString(),
          status: 'assigned',
        }
      ];

      for (const hw of sampleHomeworks) {
        await cloudDB.addMy('homework', hw);
      }

      wx.showToast({ title: '示例作业已创建', icon: 'success' });
      this.loadPendingHomework();
    } catch (e) {
      console.error('创建示例作业失败', e);
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  /**
   * 长按标题创建示例数据
   */
  onTitleLongPress() {
    wx.showModal({
      title: '创建测试数据',
      content: '是否创建示例作业数据用于测试？',
      success: (res) => {
        if (res.confirm) {
          this.createSampleHomework();
        }
      }
    });
  },
});
