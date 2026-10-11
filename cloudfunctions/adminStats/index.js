// 云函数：adminStats —— 学生数据分析（管理员）
//   action='overview' 学生总览 + 列表（含打卡/作业/考试聚合）
//   action='trend'    单生学习行为趋势（按日期）
// 鉴权：token 优先（Web），openid+isAdmin 兜底（小程序）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 归一化 event：兼容 SDK 调用（event 直接是数据对象）与 HTTP 调用（event.body 是 JSON 字符串）
 */
function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  if (event.body && typeof event.body === 'object') {
    return event.body;
  }
  return event;
}

async function authenticate(event) {
  const token = event && event._token;
  if (token) {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];
    if (session && session.expireAt && new Date(session.expireAt) > new Date()) {
      return { ok: true };
    }
    return { ok: false, authError: true };
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (openid) {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
    const user = res.data && res.data[0];
    if (user && user.isAdmin === true) return { ok: true };
    return { ok: false };
  }
  return { ok: false, authError: true };
}

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 取日期前 10 位（兼容字符串与 Date 对象） */
function dateKey(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.substring(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return fmtDate(d);
}

/** 按 openid 计数 */
function groupCount(list, key) {
  const m = {};
  list.forEach((item) => {
    const k = item[key];
    if (!k) return;
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

/**
 * 分页拉取全量数据，避免单次 limit(1000) 静默截断
 * @param {Function} buildQuery - 返回 collection/where 查询对象的函数
 * @param {number} maxPages - 安全上限，默认 50 页 × 100 = 5000 条
 * @returns {Promise<Array>}
 */
async function fetchAll(buildQuery, maxPages = 50) {
  const PAGE = 100;
  let all = [];
  for (let i = 0; i < maxPages; i++) {
    const res = await buildQuery().skip(i * PAGE).limit(PAGE).get();
    const page = res.data || [];
    all = all.concat(page);
    if (page.length < PAGE) break;
  }
  return all;
}

/** 班级列表（集合不存在时返回空数组） */
async function safeListClasses() {
  try {
    return await fetchAll(() => db.collection('classes'));
  } catch (e) {
    return [];
  }
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 取某日期所在周的周一（0 点） */
function mondayOf(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

/**
 * 生成时间桶：granularity = day(近14天) | week(近12周) | month(近12月)
 * 返回 [{ label, startStr, endStr }]（start 升序，含当前桶）
 */
function buildBuckets(granularity) {
  const now = new Date();
  const g = granularity === 'week' || granularity === 'month' ? granularity : 'day';
  const buckets = [];
  if (g === 'day') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const s = fmtDate(d);
      buckets.push({ label: s, startStr: s, endStr: s });
    }
  } else if (g === 'week') {
    const thisMonday = mondayOf(now);
    for (let i = 11; i >= 0; i--) {
      const start = new Date(thisMonday);
      start.setDate(start.getDate() - 7 * i);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      buckets.push({ label: fmtDate(start), startStr: fmtDate(start), endStr: fmtDate(end) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      buckets.push({
        label: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}`,
        startStr: fmtDate(start),
        endStr: fmtDate(end),
      });
    }
  }
  return buckets;
}

exports.main = async (event) => {
  event = normalizeEvent(event);
  try {
    const auth = await authenticate(event);
    if (!auth.ok) {
      return auth.authError
        ? { success: false, authError: true, error: '登录已过期' }
        : { success: false, error: '无权操作，仅管理员可操作' };
    }

    const { action, studentId } = event || {};

    // ---------- 总览 ----------
    if (action === 'overview') {
      const [users, checkins, homework, exams, classes] = await Promise.all([
        fetchAll(() => db.collection('users')),
        fetchAll(() => db.collection('checkins')),
        fetchAll(() => db.collection('homework')),
        fetchAll(() => db.collection('exam_scores')),
        safeListClasses(),
      ]);
      const classNameById = {};
      classes.forEach((c) => {
        classNameById[c._id] = c.name;
      });

      const students = users.filter((u) => u.isAdmin !== true);

      const checkinByUser = groupCount(checkins, '_openid');
      const homeworkByUser = groupCount(homework, '_openid');
      const examByUser = groupCount(exams, '_openid');

      // 最近活跃（打卡日期最大者）
      const lastActiveByUser = {};
      checkins.forEach((c) => {
        const d = dateKey(c.date);
        if (!d) return;
        if (!lastActiveByUser[c._openid] || d > lastActiveByUser[c._openid]) {
          lastActiveByUser[c._openid] = d;
        }
      });

      // 本周范围（周日起）
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      const weekStartStr = fmtDate(weekStart);
      const monthStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

      const activeThisWeek = new Set(
        checkins.filter((c) => dateKey(c.date) >= weekStartStr).map((c) => c._openid)
      ).size;

      const newThisMonth = students.filter((u) => dateKey(u._createTime).substring(0, 7) === monthStr).length;

      const studentList = students.map((u) => {
        const classIds = Array.isArray(u.classIds) ? u.classIds : [];
        return {
          _id: u._id,
          _openid: u._openid,
          nickName: u.nickName || '未命名用户',
          avatarUrl: u.avatarUrl || '',
          _createTime: u._createTime,
          classIds,
          classNames: classIds.map((cid) => classNameById[cid] || '').filter(Boolean),
          checkinCount: checkinByUser[u._openid] || 0,
          homeworkCount: homeworkByUser[u._openid] || 0,
          examCount: examByUser[u._openid] || 0,
          lastActive: lastActiveByUser[u._openid] || null,
        };
      });

      return {
        success: true,
        overview: {
          totalStudents: students.length,
          activeThisWeek,
          newThisMonth,
          totalHomework: homework.length,
        },
        classes: classes.map((c) => ({ _id: c._id, name: c.name })),
        students: studentList,
      };
    }

    // ---------- 单生趋势（日/周/月 分桶） ----------
    if (action === 'trend') {
      if (!studentId) return { success: false, error: '缺少 studentId' };

      const userRes = await db.collection('users').doc(studentId).get();
      const user = userRes.data;
      const openid = user && user._openid;
      if (!openid) return { success: false, error: '用户无 openid' };

      const buckets = buildBuckets(event.granularity);
      const firstStr = buckets[0].startStr;
      const lastStr = buckets[buckets.length - 1].endStr;

      const [checkins, homework, exams] = await Promise.all([
        fetchAll(() => db.collection('checkins').where({ _openid: openid })),
        fetchAll(() => db.collection('homework').where({ _openid: openid })),
        fetchAll(() => db.collection('exam_scores').where({ _openid: openid })),
      ]);

      const series = buckets.map(() => ({ checkins: 0, homework: 0, exams: 0 }));
      const bucketOfDay = (ds) => {
        if (!ds) return -1;
        for (let i = buckets.length - 1; i >= 0; i--) {
          if (ds >= buckets[i].startStr && ds <= buckets[i].endStr) return i;
        }
        return -1;
      };

      checkins.forEach((c) => {
        const i = bucketOfDay(dateKey(c.date));
        if (i >= 0) series[i].checkins += 1;
      });
      homework.forEach((h) => {
        const i = bucketOfDay(dateKey(h.date) || dateKey(h._createTime) || dateKey(h._updateTime));
        if (i >= 0) series[i].homework += 1;
      });
      exams.forEach((e) => {
        const i = bucketOfDay(dateKey(e.date));
        if (i >= 0) series[i].exams += 1;
      });

      const trend = buckets.map((b, i) => ({
        date: b.label,
        checkins: series[i].checkins,
        homework: series[i].homework,
        exams: series[i].exams,
      }));
      return { success: true, granularity: event.granularity || 'day', trend };
    }

    // ---------- 打卡周榜 ----------
    if (action === 'checkinWeekly') {
      const { weekStart, weekEnd } = event;
      if (!weekStart || !weekEnd) return { success: false, error: '缺少周起止日期' };

      const [users, pomodoroRes] = await Promise.all([
        fetchAll(() => db.collection('users')),
        fetchAll(() =>
          db.collection('pomodoro_sessions').where({
            date: db.command.gte(weekStart).and(db.command.lte(weekEnd)),
          })
        ),
      ]);

      // 尝试拉 checkin_records（集合可能尚未创建）
      let checkinRecords = [];
      try {
        checkinRecords = await fetchAll(() =>
          db.collection('checkin_records').where({
            date: db.command.gte(weekStart).and(db.command.lte(weekEnd)),
          })
        );
      } catch (e) {
        // 集合不存在，按空处理
      }

      // 尝试拉全量 checkin_records 算连续天数（需取历史数据）
      let allCheckinRecords = [];
      try {
        allCheckinRecords = await fetchAll(() => db.collection('checkin_records'));
      } catch (e) {
        // ignore
      }

      const students = users.filter((u) => u.isAdmin !== true);

      // 按学生聚合打卡记录
      const checkinByOpenid = {};
      checkinRecords.forEach((r) => {
        const k = r._openid;
        if (!k) return;
        checkinByOpenid[k] = checkinByOpenid[k] || [];
        checkinByOpenid[k].push(r);
      });

      // 全量打卡记录用于算连续天数
      const allCheckinByOpenid = {};
      allCheckinRecords.forEach((r) => {
        const k = r._openid;
        if (!k) return;
        allCheckinByOpenid[k] = allCheckinByOpenid[k] || [];
        allCheckinByOpenid[k].push(r);
      });

      // 按学生聚合番茄钟
      const pomoByOpenid = {};
      pomodoroRes.forEach((p) => {
        const k = p._openid;
        if (!k) return;
        pomoByOpenid[k] = pomoByOpenid[k] || [];
        pomoByOpenid[k].push(p);
      });

      // 计算连续天数（从 weekEnd 往前数，当天没打不算断）
      function calcStreak(records, endDate) {
        if (!records || records.length === 0) return 0;
        const dates = new Set(
          records
            .filter((r) => r.completedCount >= 1 || r.allDone || (r.items && r.items.some((it) => it.done)))
            .map((r) => dateKey(r.date))
        );
        let streak = 0;
        const d = new Date(endDate);
        // 如果当天没有打卡，从昨天开始数
        const endStr = fmtDate(d);
        if (!dates.has(endStr)) {
          d.setDate(d.getDate() - 1);
        }
        while (true) {
          const ds = fmtDate(d);
          if (dates.has(ds)) {
            streak++;
            d.setDate(d.getDate() - 1);
          } else {
            break;
          }
        }
        return streak;
      }

      // 按天聚合学习时长（番茄钟 + 手填，取 max）
      function calcStudyMinutes(pomoList, checkinList) {
        const pomoByDate = {};
        (pomoList || []).forEach((p) => {
          const d = dateKey(p.date) || dateKey(p.startedAt);
          if (!d) return;
          pomoByDate[d] = (pomoByDate[d] || 0) + (p.totalFocusMinutes || 0);
        });
        const manualByDate = {};
        (checkinList || []).forEach((r) => {
          const d = dateKey(r.date);
          if (!d) return;
          let dayManual = 0;
          (r.items || []).forEach((it) => {
            if (it.done && it.actualMinutes) dayManual += it.actualMinutes;
          });
          manualByDate[d] = (manualByDate[d] || 0) + dayManual;
        });
        // 每天 max(pomodoro, manual)，然后求和
        const allDates = new Set([...Object.keys(pomoByDate), ...Object.keys(manualByDate)]);
        let total = 0;
        allDates.forEach((d) => {
          total += Math.max(pomoByDate[d] || 0, manualByDate[d] || 0);
        });
        return total;
      }

      const rows = students.map((u) => {
        const openid = u._openid;
        const weekCheckins = checkinByOpenid[openid] || [];
        const allCheckins = allCheckinByOpenid[openid] || [];
        const pomoList = pomoByOpenid[openid] || [];

        // 本周打卡天数（完成 >= 1 项即算）
        const checkinDays = new Set(
          weekCheckins
            .filter((r) => (r.completedCount >= 1) || r.allDone || (r.items && r.items.some((it) => it.done)))
            .map((r) => dateKey(r.date))
        ).size;

        // 本周完成总项数
        const completedItems = weekCheckins.reduce((sum, r) => {
          return sum + (r.completedCount || (r.items ? r.items.filter((it) => it.done).length : 0));
        }, 0);

        // 学习时长（分钟）
        const studyMinutes = calcStudyMinutes(pomoList, weekCheckins);

        // 连续天数
        const streak = calcStreak(allCheckins, weekEnd);

        return {
          _id: u._id,
          _openid: openid,
          nickName: u.nickName || '未命名',
          avatarUrl: u.avatarUrl || '',
          checkinDays,
          completedItems,
          studyMinutes,
          studyHours: Math.round((studyMinutes / 60) * 10) / 10,
          streak,
        };
      });

      // 按打卡天数降序，再按学习时长降序
      rows.sort((a, b) => b.checkinDays - a.checkinDays || b.studyMinutes - a.studyMinutes);

      return { success: true, weekStart, weekEnd, rows };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    console.error('[adminStats] 失败', e);
    return { success: false, error: e.message };
  }
};
