// pages/homework/homework.js - 作业页面逻辑
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');

// 听说读写四个模块的基础展示信息（图标在 loadIcons 中异步补全）
const SUBJECT_MODULES_BASE = [
  { id: 'listening', label: '听力', bgColor: 'rgba(18, 183, 168, 0.12)' },
  { id: 'speaking', label: '口语', bgColor: 'rgba(23, 33, 43, 0.08)' },
  { id: 'reading', label: '阅读', bgColor: 'rgba(18, 183, 168, 0.20)' },
  { id: 'writing', label: '写作', bgColor: 'rgba(122, 135, 148, 0.14)' },
];

// 科目中文名/英文 key 统一映射到模块 id
const SUBJECT_TO_ID = {
  '听力': 'listening',
  '口语': 'speaking',
  '阅读': 'reading',
  '写作': 'writing',
  listening: 'listening',
  speaking: 'speaking',
  reading: 'reading',
  writing: 'writing',
};

Page({
  data: {
    // 全部作业缓存（用于按模块过滤、统计）
    allHomework: [],

    // 听说读写模块宫格
    subjectModules: [],
    // 当前展开查看的模块 id（空字符串表示展示模块宫格）
    activeSubject: '',
    activeSubjectLabel: '',
    activeSubjectItems: [],

    // 科目图标
    iconListening: '',
    iconSpeaking: '',
    iconReading: '',
    iconWriting: '',
    iconBook: '',
    // 是否为管理员
    isAdmin: false,
    // 学生名称映射（管理员：_openid -> 昵称）
    studentNameMap: {},
    // 当前登录用户昵称（学生本人视角展示自己的昵称）
    currentUserName: '',

    // ─── 我的任务（保存在 homework 表，recordType='task' 区分）──────
    tasks: [],
    // 添加任务弹窗
    showTaskInput: false,
    taskInputContent: '',
    taskInputTime: '',
    taskSubmitting: false,

    // ─── 番茄时钟 ────────────────────────────────────────────────
    showPomodoro: false,
    pomodoroHomeworkId: '',
    pomodoroHomeworkContent: '',
    pomodoroHomeworkSubject: '',
    // 传递给组件的作业选项列表（当前模块下所有未完成的作业）
    pomodoroHomeworkOptions: [],
    // 传递给组件的任务选项列表（当前用户全部未完成任务）
    pomodoroTaskOptions: [],
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
    const currentUserName = (userInfo && userInfo.nickName) || '';
    this.setData({ isAdmin, currentUserName }, () => {
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
          // 作业记录通过 _openid 关联用户（私有集合按 _openid 隔离），
          // 之前误用 _id 做映射键，导致教师端永远查不到学员姓名，这里改为按 _openid 映射
          if (user._openid) {
            studentNameMap[user._openid] = user.nickName || '未命名用户';
          }
        });
        this.setData({ studentNameMap }, () => {
          // 学生姓名加载完成后，刷新当前模块明细中的姓名展示
          if (this.data.activeSubject) {
            this.buildActiveSubjectItems(this.data.activeSubject);
          }
        });
      }
    } catch (e) {
      console.error('加载学生名称映射失败', e);
    }
  },

  /**
   * 加载云存储图标，并补全听说读写模块宫格的图标
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

      const iconListening = urlMap[CLOUD_IMAGES.iconHeadphones] || '';
      const iconSpeaking = urlMap[CLOUD_IMAGES.iconMic] || '';
      const iconReading = urlMap[CLOUD_IMAGES.iconBook] || '';
      const iconWriting = urlMap[CLOUD_IMAGES.iconPen] || '';

      const moduleIconMap = {
        listening: iconListening,
        speaking: iconSpeaking,
        reading: iconReading,
        writing: iconWriting,
      };
      const subjectModules = SUBJECT_MODULES_BASE.map(m => ({
        ...m,
        icon: moduleIconMap[m.id] || '',
        total: 0,
        completed: 0,
      }));

      this.setData({
        iconListening,
        iconSpeaking,
        iconReading,
        iconWriting,
        iconBook: iconReading,
        subjectModules,
      });

      // 图标就绪后，若已有作业数据则重新统计一次（保证宫格图标展示正确）
      if (this.data.allHomework.length > 0) {
        this.refreshSubjectModules(this.data.allHomework);
      }
    } catch (e) {
      console.error('[作业页] 加载图标失败', e);
    }
  },

  /**
   * 加载所有作业
   * @description 管理员加载所有作业，普通用户只加载自己的作业
   */
  async loadAllHomework() {
    try {
      let allRecords = [];

      if (this.data.isAdmin) {
        // 管理员：使用云函数获取所有作业
        allRecords = await this.loadAllHomeworkAdmin();
      } else {
        // 普通用户：使用原有方式查询自己的作业
        const res = await cloudDB.getMy('homework', (q) =>
          q.orderBy('_updateTime', 'desc')
        );

        if (res.success) {
          allRecords = res.data;
        }
      }

      // 作业与任务同表存储，用 recordType 区分；作业列表/统计只取非任务记录
      const allHomework = allRecords.filter(r => r.recordType !== 'task');

      this.setData({ allHomework });
      this.refreshSubjectModules(allHomework);

      // 若当前正在查看某个模块的明细，同步刷新
      if (this.data.activeSubject) {
        this.buildActiveSubjectItems(this.data.activeSubject);
      }

      // 任务始终按当前用户加载（管理员云函数不含个人任务，故单独查询）
      this.loadTasks();
    } catch (e) {
      console.error('加载作业失败', e);
    }
  },

  /**
   * 加载当前用户的任务（recordType='task'）
   */
  async loadTasks() {
    try {
      const res = await cloudDB.getMy('homework', (q) =>
        q.where({ recordType: 'task' }).orderBy('_updateTime', 'desc')
      );
      const tasks = res.success ? res.data.map(t => this.formatTaskItem(t)) : [];
      this.setData({ tasks });
    } catch (e) {
      console.error('加载任务失败', e);
    }
  },

  /**
   * 格式化任务展示数据
   */
  formatTaskItem(t) {
    const estimatedTime = t.estimatedTime || 0;
    const timeSpent = t.timeSpent || 0;
    return {
      id: t._id,
      content: t.description || t.content || '未命名任务',
      estimatedTime,
      timeSpent,
      duration: timeSpent > 0 ? timeSpent : estimatedTime,
      durationLabel: timeSpent > 0 ? '已专注' : '预估',
      isCompleted: t.status === 'completed',
    };
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
   * 根据全部作业数据，统计听说读写四个模块各自的总数/已完成数
   */
  refreshSubjectModules(allHomework) {
    if (!this.data.subjectModules.length) return;

    const stats = {
      listening: { total: 0, completed: 0 },
      speaking: { total: 0, completed: 0 },
      reading: { total: 0, completed: 0 },
      writing: { total: 0, completed: 0 },
    };

    allHomework.forEach(hw => {
      const moduleId = this.resolveModuleId(hw);
      if (!stats[moduleId]) return;
      stats[moduleId].total += 1;
      if (this.isHomeworkCompleted(hw)) {
        stats[moduleId].completed += 1;
      }
    });

    const subjectModules = this.data.subjectModules.map(m => ({
      ...m,
      total: stats[m.id] ? stats[m.id].total : 0,
      completed: stats[m.id] ? stats[m.id].completed : 0,
      progress: stats[m.id] && stats[m.id].total > 0
        ? Math.round((stats[m.id].completed / stats[m.id].total) * 100)
        : 0,
    }));

    this.setData({ subjectModules });
  },

  /**
   * 将一条作业记录归类到 听/说/读/写 中的某一个模块
   */
  resolveModuleId(hw) {
    const subject = hw.subject || this.mapTypeToSubject(hw.type) || '阅读';
    return SUBJECT_TO_ID[subject] || SUBJECT_TO_ID[this.getSubjectLabel(subject)] || 'reading';
  },

  /**
   * 判断一条作业记录是否已完成打卡
   */
  isHomeworkCompleted(hw) {
    return hw.status === 'completed' || hw.submitted === true;
  },

  /**
   * 点击听说读写模块，进入对应模块的作业明细列表
   */
  onTapSubjectModule(e) {
    const { id, label } = e.currentTarget.dataset;
    this.setData({
      activeSubject: id,
      activeSubjectLabel: label,
    });
    this.buildActiveSubjectItems(id);
  },

  /**
   * 从模块明细返回模块宫格
   */
  onBackToModules() {
    this.setData({
      activeSubject: '',
      activeSubjectLabel: '',
      activeSubjectItems: [],
    });
  },

  /**
   * 构建某个模块下的作业明细列表（左侧作业内容，右侧时长/完成度/打卡状态）
   */
  buildActiveSubjectItems(moduleId) {
    const items = this.data.allHomework
      .filter(hw => this.resolveModuleId(hw) === moduleId)
      .map(hw => this.formatSubjectHomeworkItem(hw));

    this.setData({ activeSubjectItems: items });
  },

  /**
   * 格式化单条作业为"模块明细条目"展示数据
   * 左列：作业内容；右列：时长、完成度、已完成 ✅ 打卡选项
   */
  formatSubjectHomeworkItem(hw) {
    const isCompleted = this.isHomeworkCompleted(hw);
    const content = hw.description || hw.content || hw.title || '暂无作业内容描述';

    // 学生昵称：管理员看对应学员昵称，学生本人看自己的昵称
    let studentName = '';
    if (this.data.isAdmin) {
      studentName = (hw._openid && this.data.studentNameMap[hw._openid]) || '';
    } else {
      studentName = this.data.currentUserName || '';
    }

    const completion = hw.completion != null && hw.completion !== ''
      ? Math.min(100, Math.max(0, parseInt(hw.completion) || 0))
      : (isCompleted ? 100 : 0);

    // estimatedTime：老师布置时的预估时长
    // timeSpent：学生通过番茄时钟累积的实际专注分钟数（由 _saveSession 用 inc 原子写入）
    const estimatedTime = hw.estimatedTime || 0;
    const timeSpent = hw.timeSpent || 0;

    return {
      id: hw._id,
      content,
      courseName: hw.courseName || '',
      studentName,
      estimatedTime,              // 预估时长（分钟）
      timeSpent,                  // 已专注时长（番茄累计，分钟）
      // 右栏主时长显示：有已专注记录时优先展示实际值，否则展示预估值
      duration: timeSpent > 0 ? timeSpent : estimatedTime,
      durationLabel: timeSpent > 0 ? '已专注' : '预估',
      completion,
      isCompleted,
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
   * 点击模块明细中的某条作业，跳转到作业详情页
   */
  onHomeworkTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/homework-detail/homework-detail?id=${id}`
    });
  },

  /**
   * 点击"已完成 ✅"打卡选项，切换该作业的完成状态
   * @description 仅学员本人可对自己的作业打卡，管理员查看他人作业时不展示该入口
   */
  async onToggleHomeworkComplete(e) {
    if (this.data.isAdmin) return;

    const { id, completed } = e.currentTarget.dataset;
    const nextCompleted = !completed;

    wx.showLoading({ title: '更新中...' });

    try {
      const res = await cloudDB.update('homework', id, {
        status: nextCompleted ? 'completed' : 'pending',
        submitted: nextCompleted,
        completion: nextCompleted ? 100 : 0,
      });

      wx.hideLoading();

      if (res.success) {
        wx.showToast({
          title: nextCompleted ? '已完成打卡 ✅' : '已取消完成标记',
          icon: 'none',
        });
        await this.loadAllHomework();
      } else {
        wx.showToast({ title: '更新失败，请重试', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[作业打卡] 更新状态失败', err);
      wx.showToast({ title: '更新失败，请重试', icon: 'none' });
    }
  },

  // ─── 番茄时钟 ────────────────────────────────────────────────

  /**
   * 点击某条作业的 🍅 按钮，打开番茄时钟并关联该作业
   */
  onTapStartPomodoro(e) {
    const { id, content, subject } = e.currentTarget.dataset;

    // 构建当前模块下所有未完成作业的选项列表，供组件内切换关联
    const pomodoroHomeworkOptions = this.data.activeSubjectItems.map(item => ({
      id: item.id,
      content: item.content,
      subject: this.data.activeSubjectLabel,
    }));

    this.setData({
      showPomodoro: true,
      pomodoroHomeworkId: id || '',
      pomodoroHomeworkContent: content || '',
      pomodoroHomeworkSubject: subject || this.data.activeSubjectLabel,
      pomodoroHomeworkOptions,
      pomodoroTaskOptions: this.buildPomodoroTaskOptions(),
    });
  },

  /** 构建未完成任务的番茄可选列表 */
  buildPomodoroTaskOptions() {
    return this.data.tasks
      .filter(t => !t.isCompleted)
      .map(t => ({ id: t.id, content: t.content }));
  },

  /** 关闭番茄弹窗 */
  onPomodoroClose() {
    this.setData({ showPomodoro: false });
  },

  /**
   * 番茄完成并写库后，刷新作业列表统计
   */
  onPomodoroSessionSaved() {
    this.loadAllHomework();
  },

  /** 番茄组件内新建了任务，刷新任务列表 */
  onPomodoroTaskCreated() {
    this.loadTasks();
  },

  // ─── 任务管理 ────────────────────────────────────────────────

  /** 打开"添加任务"弹窗 */
  onTapAddTask() {
    this.setData({ showTaskInput: true, taskInputContent: '', taskInputTime: '' });
  },

  onTaskInputContent(e) {
    this.setData({ taskInputContent: e.detail.value });
  },

  onTaskInputTime(e) {
    this.setData({ taskInputTime: e.detail.value });
  },

  closeTaskInput() {
    if (this.data.taskSubmitting) return;
    this.setData({ showTaskInput: false });
  },

  /** 确认添加任务（保存到 homework 表，recordType='task'） */
  async onConfirmAddTask() {
    if (this.data.taskSubmitting) return;

    const content = (this.data.taskInputContent || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入任务信息', icon: 'none' });
      return;
    }

    this.setData({ taskSubmitting: true });
    try {
      const res = await cloudDB.addMy('homework', {
        recordType: 'task',
        title: '任务',
        description: content,
        content,
        estimatedTime: parseInt(this.data.taskInputTime) || 0,
        timeSpent: 0,
        completion: 0,
        status: 'pending',
        submitted: false,
        assignedAt: new Date(),
      });

      if (res.success) {
        this.setData({ showTaskInput: false, taskSubmitting: false });
        await this.loadTasks();
      } else {
        this.setData({ taskSubmitting: false });
        wx.showToast({ title: '添加失败，请重试', icon: 'none' });
      }
    } catch (err) {
      this.setData({ taskSubmitting: false });
      console.error('[任务] 添加失败', err);
      wx.showToast({ title: '添加失败，请重试', icon: 'none' });
    }
  },

  /** 勾选/取消勾选任务完成 */
  async onToggleTaskComplete(e) {
    const { id, completed } = e.currentTarget.dataset;
    const nextCompleted = !completed;

    // 乐观更新本地状态
    const tasks = this.data.tasks.map(t =>
      t.id === id ? { ...t, isCompleted: nextCompleted } : t
    );
    this.setData({ tasks });

    try {
      const res = await cloudDB.update('homework', id, {
        status: nextCompleted ? 'completed' : 'pending',
        submitted: nextCompleted,
        completion: nextCompleted ? 100 : 0,
      });
      if (!res.success) throw new Error('update failed');
    } catch (err) {
      console.error('[任务] 更新状态失败', err);
      // 回滚
      const rollback = this.data.tasks.map(t =>
        t.id === id ? { ...t, isCompleted: completed } : t
      );
      this.setData({ tasks: rollback });
      wx.showToast({ title: '更新失败，请重试', icon: 'none' });
    }
  },

  /** 删除任务 */
  onTapDeleteTask(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除任务',
      content: '确定删除这条任务吗？',
      confirmText: '删除',
      confirmColor: '#E25C5C',
      success: async (m) => {
        if (!m.confirm) return;
        const res = await cloudDB.remove('homework', id);
        if (res.success) {
          this.loadTasks();
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  /** 点击任务的 🍅 按钮，打开番茄并关联该任务 */
  onTapStartTaskPomodoro(e) {
    const { id, content } = e.currentTarget.dataset;
    this.setData({
      showPomodoro: true,
      pomodoroHomeworkId: id || '',
      pomodoroHomeworkContent: content || '',
      pomodoroHomeworkSubject: '任务',
      pomodoroHomeworkOptions: [],
      pomodoroTaskOptions: this.buildPomodoroTaskOptions(),
    });
  },
});
