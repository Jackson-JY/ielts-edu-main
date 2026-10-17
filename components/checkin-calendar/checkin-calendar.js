// components/checkin-calendar/checkin-calendar.js
// 打卡日历组件：日历热力图 + 打卡明细弹窗 + 打卡表单弹窗
// 从 pages/profile 抽取；样式复用页面级类（styleIsolation: apply-shared）
const { formatDate } = require('../../utils/dateUtil');
const cloudDB = require('../../utils/cloudDB');
const { buildMonthDays } = require('../../utils/calendarUtil');

Component({
  options: {
    // 页面 wxss 样式对组件生效（section-card/modal-*/calendar-* 等类定义在页面级）
    styleIsolation: 'apply-shared',
  },

  data: {
    // 日历热力图
    displayedYear: new Date().getFullYear(),
    displayedMonth: new Date().getMonth(),
    maxYear: new Date().getFullYear(),
    maxMonth: new Date().getMonth(),
    monthLabel: '',
    canGoNext: false,
    dayLabels: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    checkinTypes: [
      { id: 'listening', label: '听力', color: '#80DED5' },
      { id: 'speaking',  label: '口语', color: '#12B7A8' },
      { id: 'reading',   label: '阅读', color: '#0E8C81' },
      { id: 'writing',   label: '写作', color: '#4DD4C4' },
      { id: 'homework',  label: '作业', color: '#B3E6E1' },
    ],
    // 打卡明细弹窗
    showCheckinDetail: false,
    selectedDate: '',
    selectedDateCheckins: [],
    // 打卡表单弹窗
    showCheckinForm: false,
    checkinTypeList: [
      { id: 'listening', label: '听力', color: '#80DED5', selected: false },
      { id: 'speaking',  label: '口语', color: '#12B7A8', selected: false },
      { id: 'reading',   label: '阅读', color: '#0E8C81', selected: false },
      { id: 'writing',   label: '写作', color: '#4DD4C4', selected: false },
      { id: 'homework',  label: '作业', color: '#B3E6E1', selected: false },
    ],
    checkinContent: '',
    // 打卡时长（分钟）
    checkinDuration: '',
    canSubmitCheckin: false,
  },

  methods: {
    updateMonthLabel() {
      const { displayedYear, displayedMonth } = this.data;
      const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      this.setData({
        monthLabel: `${displayedYear}年${monthNames[displayedMonth]}`,
        canGoNext: displayedYear < this.data.maxYear || (displayedYear === this.data.maxYear && displayedMonth < this.data.maxMonth),
      });
    },

    prevMonth() {
      let { displayedYear, displayedMonth } = this.data;
      if (displayedMonth === 0) { displayedMonth = 11; displayedYear--; }
      else { displayedMonth--; }
      this.setData({ displayedYear, displayedMonth });
      this.updateMonthLabel();
      this.initCalendar();
    },

    nextMonth() {
      const { displayedYear, displayedMonth, maxYear, maxMonth } = this.data;
      if (displayedYear > maxYear || (displayedYear === maxYear && displayedMonth >= maxMonth)) return;
      let y = displayedYear, m = displayedMonth;
      if (m === 11) { m = 0; y++; } else { m++; }
      this.setData({ displayedYear: y, displayedMonth: m });
      this.updateMonthLabel();
      this.initCalendar();
    },

    /**
     * 初始化日历热力图：拉当月 checkins → dateCountMap → buildMonthDays
     */
    async initCalendar() {
      const now = new Date();
      const { displayedYear, displayedMonth, maxYear, maxMonth, checkinTypes } = this.data;
      const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();

      const monthStart = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-01`;
      const monthEnd = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      let dateCountMap = {};
      let checkinRes = null;
      try {
        const db = wx.cloud.database();
        checkinRes = await cloudDB.getMy('checkins', (q) =>
          q.where({
            date: db.command.gte(monthStart).and(db.command.lte(monthEnd)),
          }).orderBy('date', 'asc').limit(500)
        );
        if (checkinRes.success && checkinRes.data.length > 0) {
          checkinRes.data.forEach(c => {
            dateCountMap[c.date] = (dateCountMap[c.date] || 0) + 1;
          });
        }
      } catch (e) {
        console.error('加载日历数据失败', e);
      }

      const days = buildMonthDays({
        displayedYear,
        displayedMonth,
        maxYear,
        maxMonth,
        dateCountMap,
        checkinRecords: checkinRes ? checkinRes.data : null,
        checkinSuccess: !!(checkinRes && checkinRes.success),
        typeList: checkinTypes,
        now,
      });

      this.setData({ calendarDays: days });
    },

    onTapCalendarCell(e) {
      const { date } = e.currentTarget.dataset;
      if (!date) return;
      this.loadCheckinDetail(date);
    },

    // 加载指定日期的打卡明细
    async loadCheckinDetail(date) {
      try {
        const checkinRes = await cloudDB.getMy('checkins', (q) =>
          q.where({ date }).orderBy('createdAt', 'desc').limit(100)
        );

        const checkins = checkinRes.success && checkinRes.data ? checkinRes.data : [];

        // 格式化打卡记录
        const formattedCheckins = checkins.map(item => {
          const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();
          const hours = String(createdAt.getHours()).padStart(2, '0');
          const minutes = String(createdAt.getMinutes()).padStart(2, '0');

          // 将类型ID转换为完整类型对象
          const types = (item.types || []).map(typeId => {
            return this.data.checkinTypes.find(t => t.id === typeId) || { id: typeId, label: typeId, color: '#80DED5' };
          });

          return {
            id: item._id || item.id,
            time: `${hours}:${minutes}`,
            types: types,
            content: item.content || '',
            duration: item.duration || 0
          };
        });

        this.setData({
          showCheckinDetail: true,
          selectedDate: date,
          selectedDateCheckins: formattedCheckins
        });
      } catch (e) {
        console.error('加载打卡明细失败', e);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    // 关闭打卡明细弹窗
    hideCheckinDetail() {
      this.setData({ showCheckinDetail: false });
    },

    // 显示打卡表单
    showCheckinForm() {
      this.setData({
        showCheckinForm: true,
        checkinTypeList: this.data.checkinTypeList.map(t => ({ ...t, selected: false })),
        checkinContent: '',
        checkinDuration: '',
        canSubmitCheckin: false
      });
    },

    // 关闭打卡表单
    hideCheckinForm() {
      this.setData({ showCheckinForm: false });
    },

    // 切换打卡类型选择
    toggleCheckinType(e) {
      const id = e.currentTarget.dataset.id;
      const checkinTypeList = this.data.checkinTypeList.map(item =>
        item.id === id ? { ...item, selected: !item.selected } : item
      );
      const canSubmitCheckin = checkinTypeList.some(t => t.selected);
      this.setData({ checkinTypeList, canSubmitCheckin });
    },

    // 输入备注内容
    onCheckinContentInput(e) {
      this.setData({ checkinContent: e.detail.value });
    },

    // 输入打卡时长（分钟）
    onCheckinDurationInput(e) {
      // 仅保留数字，避免脏数据
      const value = (e.detail.value || '').replace(/[^\d]/g, '');
      this.setData({ checkinDuration: value });
    },

    // 提交打卡
    async submitCheckin() {
      if (!this.data.canSubmitCheckin) {
        wx.showToast({ title: '请选择打卡类型', icon: 'none' });
        return;
      }

      const selectedTypes = this.data.checkinTypeList.filter(t => t.selected).map(t => t.id);
      const today = formatDate(new Date());
      const duration = parseInt(this.data.checkinDuration, 10);

      wx.showLoading({ title: '提交中...' });

      try {
        const checkinRecord = {
          date: today,
          types: selectedTypes,
          content: this.data.checkinContent,
          // 本次打卡时长（分钟），未填写则记为 0
          duration: Number.isNaN(duration) ? 0 : duration,
          createdAt: new Date()
        };

        const res = await cloudDB.addMy('checkins', checkinRecord);

        if (res.success) {
          wx.showToast({ title: '打卡成功', icon: 'success' });
          this.hideCheckinForm();
          // 刷新日历热力图；页面统计（streak/周月）通过事件刷新
          this.initCalendar();
          this.triggerEvent('checkinsuccess');
        } else {
          wx.showToast({ title: '打卡失败', icon: 'none' });
        }
      } catch (e) {
        console.error('打卡失败', e);
        wx.showToast({ title: '打卡失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
  },

  lifetimes: {
    attached() {
      this.updateMonthLabel();
      this.initCalendar();
    },
  },
});
