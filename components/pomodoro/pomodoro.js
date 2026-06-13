// components/pomodoro/pomodoro.js
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');
const { formatDate } = require('../../utils/dateUtil');

Component({
  /**
   * 组件属性：父页面传入关联作业信息（可留空 = 自由学习）
   */
  properties: {
    // 是否展示抽屉
    visible: {
      type: Boolean,
      value: false,
    },
    // 预置关联的作业 ID（作业页传入）
    linkedHomeworkId: {
      type: String,
      value: '',
    },
    // 预置关联的作业内容摘要
    linkedContent: {
      type: String,
      value: '',
    },
    // 预置科目
    linkedSubject: {
      type: String,
      value: '',
    },
    // 父页面可传入该用户的全部作业列表，供弹窗内选择关联
    homeworkOptions: {
      type: Array,
      value: [],
    },
    // 父页面可传入该用户的全部任务列表，供弹窗内选择关联
    taskOptions: {
      type: Array,
      value: [],
    },
  },

  data: {
    // ─── 计时器显示状态（每秒从 app.globalData 同步过来）─────────
    status: 'idle',       // idle | working | paused | work_done | resting | rest_done
    phase: 'work',        // work | rest
    remaining: 25 * 60,
    total: 25 * 60,
    progress: 0,          // 0~100，用于 conic-gradient 进度环
    completedRounds: 0,
    timeLabel: '25:00',   // 倒计时格式化文字
    phaseLabel: '准备开始',

    // ─── 关联作业 / 任务 ───────────────────────────────────────
    homeworkId: '',
    homeworkContent: '',
    subject: '',
    showHomeworkPicker: false,
    // 新建任务内联表单
    showNewTaskForm: false,
    newTaskContent: '',
    newTaskTime: '',
    newTaskSubmitting: false,

    // ─── 配置档位 ──────────────────────────────────────────────
    workMinutes: 25,
    restMinutes: 5,
    workOptions: [
      { label: '25 分钟', value: 25 },
      { label: '45 分钟', value: 45 },
      { label: '60 分钟', value: 60 },
    ],
    restOptions: [
      { label: '5 分钟', value: 5 },
      { label: '10 分钟', value: 10 },
    ],
    selectedWorkIdx: 0,
    selectedRestIdx: 0,

    // ─── 统计数据 ──────────────────────────────────────────────
    todayPomodoros: 0,       // 今日完成番茄数
    todayFocusMinutes: 0,    // 今日专注分钟
    totalPomodoros: 0,       // 历史累计番茄数
    totalFocusMinutes: 0,    // 历史累计专注分钟

    // ─── 图标 ─────────────────────────────────────────────────
    iconPlay: '',
    iconPause: '',
    iconRefresh: '',
  },

  // 注意：以下两个实例字段必须在 attached() 里用 this.xxx = 赋值才会生效。
  // Component() 顶层自定义字段不会自动挂到实例上（读出来是 undefined），切勿依赖此处声明的初值。
  // _pomodoroListener：绑定到 app 的监听回调（存引用便于 detached 时移除）
  // _lastSaveId：本实例最近处理的写库快照 ID（防止同一实例对同一快照重复处理）

  lifetimes: {
    attached() {
      // ★ 必须在实例上显式初始化：Component() 顶层自定义字段（如 _lastSaveId: 0）
      //   不会被挂到实例上，靠那行声明读到的是 undefined，
      //   导致 `save.id > this._lastSaveId` 恒为 false，写库永远不触发。
      this._lastSaveId = 0;

      this._loadIcons();
      this._loadTodayStats();

      // 注册到全局监听器
      this._pomodoroListener = (p) => this._syncFromGlobal(p);
      getApp().addPomodoroListener(this._pomodoroListener);

      // 立刻同步一次当前状态
      this._syncFromGlobal(getApp().globalData.pomodoro);
    },

    detached() {
      getApp().removePomodoroListener(this._pomodoroListener);
      this._pomodoroListener = null;
    },
  },

  observers: {
    // 父页面更新 visible 时，若有预置作业信息则同步给全局
    'visible'(val) {
      if (!val) return;
      const { linkedHomeworkId, linkedContent, linkedSubject } = this.properties;
      if (linkedHomeworkId) {
        getApp().pomodoroSetHomework(linkedHomeworkId, linkedContent, linkedSubject);
        this.setData({
          homeworkId: linkedHomeworkId,
          homeworkContent: linkedContent,
          subject: linkedSubject,
        });
      }
    },

    // 父页面更新关联作业
    'linkedHomeworkId, linkedContent, linkedSubject'(id, content, subject) {
      if (id && this.data.visible) {
        getApp().pomodoroSetHomework(id, content, subject);
        this.setData({ homeworkId: id, homeworkContent: content, subject });
      }
    },
  },

  methods: {
    // ─── 与 app 全局状态同步 ────────────────────────────────────

    _syncFromGlobal(p) {
      const remaining = p.remaining;
      const total = p.total;
      const progress = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;

      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const timeLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const phaseMap = {
        idle: '准备开始',
        working: '专注中 🎯',
        paused: '已暂停',
        work_done: '专注完成 🎉',
        resting: '休息中 ☕',
        rest_done: '休息完毕！',
      };

      this.setData({
        status: p.status,
        phase: p.phase,
        remaining,
        total,
        progress,
        timeLabel,
        phaseLabel: phaseMap[p.status] || '',
        completedRounds: p.completedRounds,
        workMinutes: p.workMinutes,
        restMinutes: p.restMinutes,
        homeworkId: p.homeworkId,
        homeworkContent: p.homeworkContent,
        subject: p.subject,
      });

      // ★ 检测 app.js 挂出的写库快照
      // 触发场景：专注倒计时完成、暂停、重置（三种情况均由 app._triggerPendingSave 统一产生）
      // 休息阶段暂停/重置不产生快照，因此不会误增专注时长

      // 全新会话启动时（pomodoroStart 会把 _pendingSaveId 置回 0），
      // 同步重置组件实例的 _lastSaveId，否则新会话第一次暂停的 save.id=1
      // 会被误判为"已处理过"而跳过写库
      if (this._lastSaveId == null) this._lastSaveId = 0; // 兜底，防止 undefined
      if (p._pendingSaveId === 0 && this._lastSaveId > 0) {
        this._lastSaveId = 0;
      }

      const save = p._pendingSave;
      if (save && save.id > this._lastSaveId) {
        this._lastSaveId = save.id;
        // 跨实例去重：作业页 + 我的页各有一个组件实例，只允许第一个认领的写库
        if (p._pendingSaveHandled < save.id) {
          p._pendingSaveHandled = save.id; // 原子性认领（JS 单线程，无竞态）
          this._saveSegment(save);
        }
      }
    },

    // ─── 用户操作 ───────────────────────────────────────────────

    /** 开始 / 继续 */
    onTapStart() {
      const p = this.data;
      if (p.status === 'idle') {
        getApp().pomodoroStart({
          workMinutes: p.workMinutes,
          restMinutes: p.restMinutes,
          homeworkId: p.homeworkId,
          homeworkContent: p.homeworkContent,
          subject: p.subject,
        });
      } else if (p.status === 'paused') {
        getApp().pomodoroStart();
      }
    },

    /** 暂停 */
    onTapPause() {
      getApp().pomodoroPause();
    },

    /** 重置 */
    onTapReset() {
      wx.showModal({
        title: '重置番茄时钟',
        content: '确定要重置当前番茄吗？本轮进度将会清除。',
        confirmText: '重置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) getApp().pomodoroReset();
        },
      });
    },

    /** 开始休息（work_done 状态下） */
    onTapStartRest() {
      getApp().pomodoroStartRest();
    },

    /** 跳过休息，重新进入 idle 准备下一轮 */
    onTapSkipRest() {
      getApp().pomodoroReset();
    },

    /**
     * 写库：将一段专注时间持久化到云数据库
     * @param {Object} save  app._triggerPendingSave 产生的快照对象
     *   { id, minutes, isPartial, homeworkId, homeworkContent, subject, originalStartAt }
     *
     * 触发场景：
     *   isPartial = false → 倒计时自然完成（整轮番茄 ✅）
     *   isPartial = true  → 暂停或重置（中途停下，记录已完成的碎片时长）
     *
     * 说明：save 快照在 reset 前已打包好所有字段，不依赖当前全局状态，
     *       因此 reset 之后调用也能正确拿到 homeworkId 等信息。
     */
    async _saveSegment(save) {
      const today = formatDate(new Date());
      const endedAt = new Date();
      const startedAt = save.originalStartAt ? new Date(save.originalStartAt) : endedAt;

      try {
        // 1. 写入番茄会话记录
        //    completedPomodoros: 1 仅当整轮完成；部分专注记为 0，统计"番茄数"时不计入
        await cloudDB.addMy('pomodoro_sessions', {
          homeworkId: save.homeworkId,
          homeworkContent: save.homeworkContent,
          subject: save.subject,
          totalFocusMinutes: save.minutes,   // 本次实际专注分钟数（可能 < workMinutes）
          completedPomodoros: save.isPartial ? 0 : 1,
          isPartial: save.isPartial,
          startedAt,
          endedAt,
          date: today,
          note: '',
        });

        // 2. 原子自增作业已专注时长（只有关联了作业时才回写）
        if (save.homeworkId) {
          try {
            const db = wx.cloud.database();
            await db.collection('homework').doc(save.homeworkId).update({
              data: {
                timeSpent: db.command.inc(save.minutes),
                _updateTime: endedAt,
              },
            });
          } catch (hwErr) {
            // 回写作业失败不影响番茄记录，记日志即可
            console.error('[番茄] 回写 homework.timeSpent 失败', hwErr);
          }
        }

        // 3. 刷新统计显示
        this._loadTodayStats();

        // 4. 通知父页面（作业列表需刷新 timeSpent）
        this.triggerEvent('sessionSaved', {
          homeworkId: save.homeworkId,
          subject: save.subject,
          minutes: save.minutes,
          isPartial: save.isPartial,
        });
      } catch (e) {
        console.error('[番茄] 写入会话记录失败', e);
      }
    },

    // ─── 关联作业选择 ────────────────────────────────────────────

    onTapToggleHomeworkPicker() {
      this.setData({ showHomeworkPicker: !this.data.showHomeworkPicker });
    },

    onTapSelectHomework(e) {
      const { id, content, subject } = e.currentTarget.dataset;
      getApp().pomodoroSetHomework(id, content, subject);
      this.setData({
        homeworkId: id,
        homeworkContent: content,
        subject,
        showHomeworkPicker: false,
        showNewTaskForm: false,
      });
    },

    /** 选择一个任务进行关联（任务也存于 homework 表，机制与作业相同） */
    onTapSelectTask(e) {
      const { id, content } = e.currentTarget.dataset;
      getApp().pomodoroSetHomework(id, content, '任务');
      this.setData({
        homeworkId: id,
        homeworkContent: content,
        subject: '任务',
        showHomeworkPicker: false,
        showNewTaskForm: false,
      });
    },

    onTapClearHomework() {
      getApp().pomodoroSetHomework('', '', '');
      this.setData({ homeworkId: '', homeworkContent: '', subject: '' });
    },

    // ─── 新建任务并关联 ──────────────────────────────────────────

    /** 展开/收起"新建任务"内联表单 */
    onTapToggleNewTask() {
      this.setData({
        showNewTaskForm: !this.data.showNewTaskForm,
        newTaskContent: '',
        newTaskTime: '',
      });
    },

    onNewTaskContentInput(e) {
      this.setData({ newTaskContent: e.detail.value });
    },

    onNewTaskTimeInput(e) {
      this.setData({ newTaskTime: e.detail.value });
    },

    /** 创建任务（写入 homework 表 recordType='task'）并立即关联 */
    async onTapCreateAndLinkTask() {
      if (this.data.newTaskSubmitting) return;
      const content = (this.data.newTaskContent || '').trim();
      if (!content) {
        wx.showToast({ title: '请输入任务信息', icon: 'none' });
        return;
      }

      this.setData({ newTaskSubmitting: true });
      try {
        const res = await cloudDB.addMy('homework', {
          recordType: 'task',
          title: '任务',
          description: content,
          content,
          estimatedTime: parseInt(this.data.newTaskTime) || 0,
          timeSpent: 0,
          completion: 0,
          status: 'pending',
          submitted: false,
          assignedAt: new Date(),
        });

        if (res.success && res.id) {
          // 立即关联新任务
          getApp().pomodoroSetHomework(res.id, content, '任务');
          this.setData({
            homeworkId: res.id,
            homeworkContent: content,
            subject: '任务',
            showNewTaskForm: false,
            showHomeworkPicker: false,
            newTaskSubmitting: false,
            newTaskContent: '',
            newTaskTime: '',
          });
          // 通知父页面刷新任务列表
          this.triggerEvent('taskCreated', { id: res.id, content });
          wx.showToast({ title: '已创建并关联', icon: 'none' });
        } else {
          this.setData({ newTaskSubmitting: false });
          wx.showToast({ title: '创建失败，请重试', icon: 'none' });
        }
      } catch (err) {
        this.setData({ newTaskSubmitting: false });
        console.error('[番茄] 新建任务失败', err);
        wx.showToast({ title: '创建失败，请重试', icon: 'none' });
      }
    },

    // ─── 时长配置 ────────────────────────────────────────────────

    onTapWorkOption(e) {
      const { value, index } = e.currentTarget.dataset;
      this.setData({ selectedWorkIdx: index });
      getApp().pomodoroSetConfig(value, null);
    },

    onTapRestOption(e) {
      const { value, index } = e.currentTarget.dataset;
      this.setData({ selectedRestIdx: index });
      getApp().pomodoroSetConfig(null, value);
    },

    // ─── 关闭抽屉 ────────────────────────────────────────────────

    onTapClose() {
      this.triggerEvent('close');
    },

    onTapMask() {
      // 计时中不允许意外关闭
      const { status } = this.data;
      if (status === 'working' || status === 'resting') {
        wx.showToast({ title: '专注中，请勿关闭', icon: 'none' });
        return;
      }
      this.triggerEvent('close');
    },

    // ─── 统计数据 ────────────────────────────────────────────────

    /**
     * 加载今日 + 历史累计统计
     *
     * 改用云函数 getPomodoroStats：
     * 1. 服务端用 getWXContext().OPENID 强制按当前用户过滤，杜绝越权读他人数据
     * 2. 服务端聚合汇总，绕过客户端 .get() 单次最多 20 条的限制，
     *    保证「累计」统计覆盖该用户的全部历史记录（旧的客户端查询会漏算第 20 条之后的数据）
     */
    async _loadTodayStats() {
      try {
        const today = formatDate(new Date());
        const res = await wx.cloud.callFunction({
          name: 'getPomodoroStats',
          data: { date: today },
        });

        const r = (res && res.result) || {};
        if (!r.success) {
          console.error('[番茄] 加载统计失败', r.error);
          return;
        }

        this.setData({
          todayPomodoros: r.todayPomodoros || 0,
          todayFocusMinutes: r.todayFocusMinutes || 0,
          totalPomodoros: r.totalPomodoros || 0,
          totalFocusMinutes: r.totalFocusMinutes || 0,
        });
      } catch (e) {
        console.error('[番茄] 加载统计失败', e);
      }
    },

    // ─── 图标 ────────────────────────────────────────────────────

    async _loadIcons() {
      try {
        const fileIDs = [CLOUD_IMAGES.iconPlay, CLOUD_IMAGES.iconPause, CLOUD_IMAGES.iconRefresh];
        const urlMap = await cloudStorage.getTempUrls(fileIDs);
        this.setData({
          iconPlay: urlMap[CLOUD_IMAGES.iconPlay] || '',
          iconPause: urlMap[CLOUD_IMAGES.iconPause] || '',
          iconRefresh: urlMap[CLOUD_IMAGES.iconRefresh] || '',
        });
      } catch (e) {
        console.error('[番茄组件] 加载图标失败', e);
      }
    },
  },
});
