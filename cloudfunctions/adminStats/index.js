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
      const [usersRes, checkinsRes, homeworkRes, examRes] = await Promise.all([
        db.collection('users').limit(1000).get(),
        db.collection('checkins').limit(1000).get(),
        db.collection('homework').limit(1000).get(),
        db.collection('exam_scores').limit(1000).get(),
      ]);

      const users = usersRes.data || [];
      const checkins = checkinsRes.data || [];
      const homework = homeworkRes.data || [];
      const exams = examRes.data || [];

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

      const studentList = students.map((u) => ({
        _id: u._id,
        _openid: u._openid,
        nickName: u.nickName || '未命名用户',
        avatarUrl: u.avatarUrl || '',
        _createTime: u._createTime,
        checkinCount: checkinByUser[u._openid] || 0,
        homeworkCount: homeworkByUser[u._openid] || 0,
        examCount: examByUser[u._openid] || 0,
        lastActive: lastActiveByUser[u._openid] || null,
      }));

      return {
        success: true,
        overview: {
          totalStudents: students.length,
          activeThisWeek,
          newThisMonth,
          totalHomework: homework.length,
        },
        students: studentList,
      };
    }

    // ---------- 单生趋势 ----------
    if (action === 'trend') {
      if (!studentId) return { success: false, error: '缺少 studentId' };

      const userRes = await db.collection('users').doc(studentId).get();
      const user = userRes.data;
      const openid = user && user._openid;
      if (!openid) return { success: false, error: '用户无 openid' };

      const [checkinsRes, homeworkRes, examRes] = await Promise.all([
        db.collection('checkins').where({ _openid: openid }).limit(1000).get(),
        db.collection('homework').where({ _openid: openid }).limit(1000).get(),
        db.collection('exam_scores').where({ _openid: openid }).limit(1000).get(),
      ]);

      const dateMap = {};
      const touch = (d) => {
        if (!d) return;
        dateMap[d] = dateMap[d] || { date: d, checkins: 0, homework: 0, exams: 0 };
      };

      checkinsRes.data.forEach((c) => {
        const d = dateKey(c.date);
        touch(d);
        if (d) dateMap[d].checkins += 1;
      });
      homeworkRes.data.forEach((h) => {
        const d = dateKey(h.date) || dateKey(h._createTime) || dateKey(h._updateTime);
        touch(d);
        if (d) dateMap[d].homework += 1;
      });
      examRes.data.forEach((e) => {
        const d = dateKey(e.date);
        touch(d);
        if (d) dateMap[d].exams += 1;
      });

      const trend = Object.values(dateMap).sort((a, b) => (a.date < b.date ? -1 : 1));
      return { success: true, trend };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    console.error('[adminStats] 失败', e);
    return { success: false, error: e.message };
  }
};
