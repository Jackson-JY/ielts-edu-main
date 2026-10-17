/**
 * 番茄时钟全局状态管理器（从 app.js 抽取）
 *
 * 用法（app.js onLaunch）：
 *   Object.assign(this, pomodoroManager.methods);
 *   this.globalData.pomodoro = pomodoroManager.createInitialState();
 *   this._pomodoroTimer = null;
 *   this._pomodoroListeners = [];
 *
 * 所有方法通过 app.pomodoroXxx() 调用，方法内 this === app 实例，
 * 页面/组件侧 getApp().pomodoroXxx() / getApp().globalData.pomodoro 访问方式不变。
 */

/** 创建一份全新的番茄钟状态（避免对象引用共享） */
function createInitialState() {
  return {
    // 状态机：idle | working | paused | work_done | resting | rest_done
    status: 'idle',
    // 当前阶段：work | rest
    phase: 'work',
    // 倒计时剩余秒数
    remaining: 25 * 60,
    // 当前阶段总秒数（用于计算进度百分比）
    total: 25 * 60,
    // 本阶段开始时的 Date.now() 时间戳（后台切回时用于重新校正 remaining）
    // 注意：暂停/继续时此值会被调整为"虚拟起点"，不代表真实点击开始的时刻
    startAt: null,
    // ★ 用户真正点击"开始"的原始时间戳（仅在全新启动时设置，暂停/继续不更改）
    // 用于写库时的 startedAt 字段，保留真实的专注开始时间
    originalStartAt: null,
    // 暂停时刻时间戳
    pausedAt: null,
    // 暂停时记录的剩余秒数
    pausedRemaining: 0,
    // 本次会话已完成的番茄数（用于 UI 显示 🍅 徽章）
    completedRounds: 0,

    // ─── 精确计时字段 ────────────────────────────────────────────
    // 当前工作段起始时刻（每次从 idle/paused 进入 working 时设置，暂停/完成时清 null）
    // 仅在 phase === 'work' 时有意义，休息阶段不计入专注时长
    segmentStartAt: null,
    // 本次会话待写库的专注秒数（每次暂停/完成时累加；每次写库后保留不足 1 分钟的余数）
    accumulatedSecs: 0,
    // 本次会话已写入 DB 的专注分钟数（用于倒计时完成时精确计算剩余应写分钟，防止多写）
    savedMinutes: 0,

    // ─── 写库信号 ────────────────────────────────────────────────
    // 需要写库时，将待写数据快照到此字段，组件监听到后执行实际 DB 操作
    // 快照自带所有必要字段，reset 清空全局状态后组件仍能正确写库
    _pendingSave: null,
    // 单调递增 ID，组件用来判断是否已处理过当前快照
    _pendingSaveId: 0,
    // 跨组件实例去重：记录最后一次被"认领"的快照 ID（多个 pomodoro 组件同时挂载时只允许一个写库）
    _pendingSaveHandled: 0,

    // 关联的作业信息（可为空 = 自由学习）
    homeworkId: '',
    homeworkContent: '',
    subject: '',

    // 用户配置
    workMinutes: 25,   // 专注时长（分钟）：25 | 45 | 60
    restMinutes: 5,    // 休息时长（分钟）：5 | 10
  };
}

const methods = {
  /**
   * 开始/继续专注（或从 idle 启动）
   * @param {Object} [opts]
   * @param {string} [opts.homeworkId]
   * @param {string} [opts.homeworkContent]
   * @param {string} [opts.subject]
   * @param {number} [opts.workMinutes] - 25 | 45 | 60
   * @param {number} [opts.restMinutes] - 5 | 10
   */
  pomodoroStart(opts = {}) {
    const p = this.globalData.pomodoro;

    // 若处于暂停状态，恢复计时
    if (p.status === 'paused') {
      const pausedSecs = p.pausedRemaining;
      p.remaining = pausedSecs;
      p.startAt = Date.now() - (p.total - pausedSecs) * 1000;
      p.status = p.phase === 'work' ? 'working' : 'resting';
      p.pausedAt = null;
      // ★ 仅专注阶段才重置段起点（休息恢复不计专注时长）
      if (p.phase === 'work') p.segmentStartAt = Date.now();
      this._startPomodoroInterval();
      this._notifyPomodoroListeners();
      return;
    }

    // 全新启动
    if (opts.workMinutes) p.workMinutes = opts.workMinutes;
    if (opts.restMinutes) p.restMinutes = opts.restMinutes;
    if (opts.homeworkId !== undefined) p.homeworkId = opts.homeworkId;
    if (opts.homeworkContent !== undefined) p.homeworkContent = opts.homeworkContent;
    if (opts.subject !== undefined) p.subject = opts.subject;

    p.phase = 'work';
    p.total = p.workMinutes * 60;
    p.remaining = p.total;
    p.startAt = Date.now();
    p.originalStartAt = Date.now();   // 真实开始时刻，仅全新启动时记录
    p.segmentStartAt = Date.now();    // 当前段起点（用于暂停/重置时计算已用时长）
    p.accumulatedSecs = 0;            // 清零累计专注秒数
    p.savedMinutes = 0;               // 清零已写分钟数（防止完成时多写）
    p._pendingSave = null;
    p._pendingSaveId = 0;
    p._pendingSaveHandled = 0;
    p.status = 'working';
    p.completedRounds = 0;

    this._startPomodoroInterval();
    this._notifyPomodoroListeners();
  },

  /** 暂停计时 */
  pomodoroPause() {
    const p = this.globalData.pomodoro;
    if (p.status !== 'working' && p.status !== 'resting') return;

    // ★ 仅专注阶段暂停才累计专注时长并触发写库
    // 休息阶段暂停不记录专注时长（休息 ≠ 专注）
    if (p.phase === 'work' && p.segmentStartAt) {
      p.accumulatedSecs += Math.floor((Date.now() - p.segmentStartAt) / 1000);
      p.segmentStartAt = null;
      this._triggerPendingSave(true); // isPartial = true（未完成整轮番茄）
    }

    p.pausedRemaining = p.remaining;
    p.pausedAt = Date.now();
    p.status = 'paused';
    this._stopPomodoroInterval();
    this._notifyPomodoroListeners();
  },

  /** 重置为 idle */
  pomodoroReset() {
    this._stopPomodoroInterval();
    const p = this.globalData.pomodoro;

    // ★ 必须在清空状态之前触发写库快照
    // 只有专注阶段有专注时长可写；休息阶段重置不记录专注时长
    if (p.phase === 'work') {
      // 如果当前正在专注中，先把本段用时并入 accumulatedSecs
      if (p.status === 'working' && p.segmentStartAt) {
        p.accumulatedSecs += Math.floor((Date.now() - p.segmentStartAt) / 1000);
        p.segmentStartAt = null;
      }
      // 暂停状态下 segmentStartAt 已在 pause 时清零，accumulatedSecs 已包含暂停前的时长
      this._triggerPendingSave(true); // isPartial = true（主动中断，非自然完成）
    }

    // 清空所有状态
    p.status = 'idle';
    p.phase = 'work';
    p.remaining = p.workMinutes * 60;
    p.total = p.workMinutes * 60;
    p.startAt = null;
    p.originalStartAt = null;
    p.pausedAt = null;
    p.pausedRemaining = 0;
    p.completedRounds = 0;
    p.segmentStartAt = null;
    p.accumulatedSecs = 0;
    p.savedMinutes = 0;
    // 注意：_pendingSave / _pendingSaveId / _pendingSaveHandled 不清零
    // 它们需要保留到组件处理完写库请求为止（_notifyPomodoroListeners 会立即触发）
    this._notifyPomodoroListeners();
  },

  /**
   * 专注完成后，开始休息
   * 由 WORK_DONE 状态下用户点击"开始休息"触发
   */
  pomodoroStartRest() {
    const p = this.globalData.pomodoro;
    if (p.status !== 'work_done') return;
    p.phase = 'rest';
    p.total = p.restMinutes * 60;
    p.remaining = p.total;
    p.startAt = Date.now();
    p.status = 'resting';
    this._startPomodoroInterval();
    this._notifyPomodoroListeners();
  },

  /**
   * 修改关联作业（计时进行中也可更改）
   */
  pomodoroSetHomework(homeworkId, homeworkContent, subject) {
    const p = this.globalData.pomodoro;
    p.homeworkId = homeworkId || '';
    p.homeworkContent = homeworkContent || '';
    p.subject = subject || '';
    this._notifyPomodoroListeners();
  },

  /**
   * 修改时长配置（只在 idle 状态生效）
   */
  pomodoroSetConfig(workMinutes, restMinutes) {
    const p = this.globalData.pomodoro;
    if (p.status !== 'idle') return;
    if (workMinutes) {
      p.workMinutes = workMinutes;
      p.remaining = workMinutes * 60;
      p.total = workMinutes * 60;
    }
    if (restMinutes) p.restMinutes = restMinutes;
    this._notifyPomodoroListeners();
  },

  // ─── 内部方法 ───────────────────────────────────────────────

  /**
   * 打包写库快照并挂到 _pendingSave
   * @param {boolean} isPartial true=暂停/重置（未完整跑完一轮），false=倒计时自然归零
   *
   * 设计原则：
   * 1. 把所有写库所需字段快照到 _pendingSave，组件读取时全局状态可能已 reset
   * 2. 用单调 ID(_pendingSaveId) 让组件区分新旧快照
   * 3. accumulatedSecs 取 floor 后保留余数，下次暂停/完成时继续累加（不丢秒）
   * 4. 不足 1 分钟的碎片时间不写库（避免大量 0-分钟记录）
   */
  _triggerPendingSave(isPartial) {
    const p = this.globalData.pomodoro;
    const minutes = Math.floor(p.accumulatedSecs / 60);
    if (minutes <= 0) return; // 不足 1 分钟，跳过

    p.accumulatedSecs = p.accumulatedSecs % 60; // 保留余数，供下次累加
    p.savedMinutes += minutes;                  // 记录已写分钟数（完成时用于防止多写）
    p._pendingSaveId += 1;
    p._pendingSave = {
      id: p._pendingSaveId,
      minutes,
      isPartial,
      // ★ 快照：reset 后全局状态已清空，组件仍需这些数据写库
      homeworkId: p.homeworkId || '',
      homeworkContent: p.homeworkContent || '',
      subject: p.subject || '',
      originalStartAt: p.originalStartAt || p.startAt,
    };
  },

  _startPomodoroInterval() {
    this._stopPomodoroInterval();
    this._pomodoroTimer = setInterval(() => this._tickPomodoro(), 1000);
  },

  _stopPomodoroInterval() {
    if (this._pomodoroTimer) {
      clearInterval(this._pomodoroTimer);
      this._pomodoroTimer = null;
    }
  },

  _tickPomodoro() {
    const p = this.globalData.pomodoro;
    if (p.status !== 'working' && p.status !== 'resting') {
      this._stopPomodoroInterval();
      return;
    }

    // 以 startAt 时间戳计算剩余，避免后台节流导致计数漂移
    const elapsed = Math.floor((Date.now() - p.startAt) / 1000);
    p.remaining = Math.max(0, p.total - elapsed);

    if (p.remaining <= 0) {
      this._stopPomodoroInterval();
      if (p.phase === 'work') {
        this._handleWorkComplete();
      } else {
        this._handleRestComplete();
      }
    } else {
      this._notifyPomodoroListeners();
    }
  },

  /** 一轮专注完成（倒计时自然归零） */
  _handleWorkComplete() {
    const p = this.globalData.pomodoro;
    p.remaining = 0;

    p.segmentStartAt = null;
    // ★ 完整番茄：将 accumulatedSecs 设为"剩余应写秒数"
    // = (workMinutes - savedMinutes) * 60 + 之前暂停留下的余数
    // 这样 _triggerPendingSave 写入的分钟数 = workMinutes - savedMinutes
    // 最终总写入 = savedMinutes + (workMinutes - savedMinutes) = workMinutes，精确无多写
    const remainingSecs = (p.workMinutes - p.savedMinutes) * 60;
    p.accumulatedSecs = remainingSecs + (p.accumulatedSecs % 60);
    this._triggerPendingSave(false); // isPartial = false（完整番茄 ✅）

    p.status = 'work_done';
    p.completedRounds += 1;
    this._notifyPomodoroListeners();
    // 轻震动提示
    wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });
  },

  /** 休息完成 */
  _handleRestComplete() {
    const p = this.globalData.pomodoro;
    p.remaining = 0;
    p.phase = 'work';
    p.status = 'rest_done';
    // 自动重置进入下一轮 idle
    p.total = p.workMinutes * 60;
    p.remaining = p.total;
    this._notifyPomodoroListeners();
    wx.vibrateShort && wx.vibrateShort({ type: 'medium' });
  },

  /**
   * 通知所有注册了监听器的组件/页面刷新番茄状态
   * 各组件在 attached 时调用 getApp().addPomodoroListener(cb)，
   * detached 时调用 getApp().removePomodoroListener(cb)
   */
  addPomodoroListener(cb) {
    if (cb && !this._pomodoroListeners.includes(cb)) {
      this._pomodoroListeners.push(cb);
    }
  },

  removePomodoroListener(cb) {
    this._pomodoroListeners = this._pomodoroListeners.filter(f => f !== cb);
  },

  _notifyPomodoroListeners() {
    this._pomodoroListeners.forEach(cb => {
      try { cb(this.globalData.pomodoro); } catch (e) { console.error('[番茄] 监听器回调异常', e); }
    });
  },

  /** 切到后台：计时中仅停 interval 节电，startAt 保持不变（切回时按真实时间重算） */
  pomodoroHandleHide() {
    const p = this.globalData.pomodoro;
    if (p.status === 'working' || p.status === 'resting') {
      this._stopPomodoroInterval();
    }
  },

  /** 切回前台：重启 interval 并校正剩余时间；后台期间已到点则直接走完成逻辑 */
  pomodoroHandleShow() {
    const p = this.globalData.pomodoro;
    if (p.status === 'working' || p.status === 'resting') {
      // 重算剩余时间（后台期间经过的真实时间已记在 startAt 里）
      const elapsed = Math.floor((Date.now() - p.startAt) / 1000);
      p.remaining = Math.max(0, p.total - elapsed);
      if (p.remaining <= 0) {
        // 后台期间已完成
        if (p.phase === 'work') this._handleWorkComplete();
        else this._handleRestComplete();
      } else {
        this._startPomodoroInterval();
        this._notifyPomodoroListeners();
      }
    }
  },
};

module.exports = { createInitialState, methods };
