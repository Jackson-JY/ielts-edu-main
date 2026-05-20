// pages/homework/homework.js - 作业页面逻辑
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

Page({
  data: {
    // 未完成作业列表
    pendingHomework: [],
    // 已完成作业列表
    completedHomework: [],
    // 折叠状态
    pendingExpanded: false,
    completedExpanded: false,
    // 科目图标
    iconListening: '',
    iconSpeaking: '',
    iconReading: '',
    iconWriting: '',
    iconBook: '',
    // 科目颜色映射
    subjectColors: {
      '听力': '#A7FBF5',
      '阅读': '#FFD4B8',
      '写作': '#FFE8F0',
      '口语': '#E8D4F8',
    },
    // 是否为管理员
    isAdmin: false,
    // 学生名称映射
    studentNameMap: {},
  },

  async onLoad() {
    this.loadIcons();
    this.checkAdminAndLoad();
  },

  onShow() {
    this.loadAllHomework();
  },

  /**
   * 检查管理员身份并加载数据
   */
  checkAdminAndLoad() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    const isAdmin = userInfo && userInfo.isAdmin === true;
    this.setData({ isAdmin }, () => {
      this.loadAllHomework();
      if (isAdmin) {
        this.loadStudentNames();
      }
    });
  },

  /**
   * 加载学生名称映射（管理员使用）
   */
  async loadStudentNames() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAllUsers',
      });

      if (res.result && res.result.success) {
        const studentNameMap = {};
        (res.result.data || []).forEach(user => {
          studentNameMap[user._id] = user.nickName || '未命名用户';
        });
        this.setData({ studentNameMap });
      }
    } catch (e) {
      console.error('加载学生名称映射失败', e);
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
      console.error('[作业页] 加载图标失败', e);
    }
  },

  /**
   * 加载所有作业并分类
   * @description 管理员加载所有作业，普通用户只加载自己的作业
   */
  async loadAllHomework() {
    try {
      let allHomework = [];

      if (this.data.isAdmin) {
        // 管理员：使用云函数获取所有作业
        allHomework = await this.loadAllHomeworkAdmin();
      } else {
        // 普通用户：使用原有方式查询自己的作业
        const res = await cloudDB.getMy('homework', (q) =>
          q.orderBy('_updateTime', 'desc')
        );

        if (res.success) {
          allHomework = res.data;
        }
      }

      // 过滤未完成作业
      const pendingList = allHomework.filter(hw => {
        if (hw.status) {
          return ['pending', 'assigned', 'in_progress'].includes(hw.status);
        }
        if (hw.submitted !== undefined) {
          return !hw.submitted;
        }
        return true;
      });

      // 过滤已完成作业
      const completedList = allHomework.filter(hw => {
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
    } catch (e) {
      console.error('加载作业失败', e);
    }
  },

  /**
   * 管理员加载所有作业（分页获取）
   */
  async loadAllHomeworkAdmin() {
    try {
      let allData = [];
      let skip = 0;
      const pageSize = 500;
      let hasMore = true;

      while (hasMore) {
        const res = await wx.cloud.callFunction({
          name: 'getAllHomework',
          data: { skip, limit: pageSize }
        });

        if (res.result && res.result.success) {
          const list = res.result.data || [];
          allData = allData.concat(list);
          skip += pageSize;
          hasMore = list.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allData;
    } catch (e) {
      console.error('管理员加载作业失败', e);
      return [];
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

    // 兼容新旧字段，默认为'阅读'
    const subject = hw.subject || this.mapTypeToSubject(hw.type) || '阅读';
    const description = hw.description || hw.content || '';
    const status = hw.status || (hw.submitted ? 'completed' : 'pending');

    // 管理员模式下显示学生名称
    let studentName = '';
    if (this.data.isAdmin && hw._openid) {
      studentName = this.data.studentNameMap[hw._openid] || '';
    }

    return {
      id: hw._id,
      title: hw.title || '未命名作业',
      subject: subject,
      subjectLabel: this.getSubjectLabel(subject),
      subjectColor: this.getSubjectColor(subject),
      subjectIcon: this.getSubjectIcon(subject),
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
      studentName: studentName,
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
