// 云函数：adminDashboard —— 统计看板数据（管理员）
//   action='overview'   指标总览：用户/今日活跃/今日新增/今日测评/今日打卡/今日管理操作/授权概况
//   action='trend'      近 14 天趋势：日活跃(去重)/登录/测评/打卡
//   action='auditLogs'  管理员操作记录（分页 + 筛选 adminName/action/module）
//   action='accessLogs' 用户访问记录（分页 + 筛选 type/nickName）
// 鉴权：token 优先（Web），openid+isAdmin 兜底（小程序）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const pad = (n) => String(n).padStart(2, '0');
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  if (event.body && typeof event.body === 'object') return event.body;
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

/** 时间窗口起点 */
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysAgoStart(n) {
  const d = todayStart();
  d.setDate(d.getDate() - n);
  return d;
}

/** 分页拉取全量，避免单次 limit(1000) 静默截断 */
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

/** 取某日期所在周的周一（0 点） */
function mondayOf(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

/**
 * 生成时间桶：granularity = day(近14天) | week(近12周) | month(近12月)
 * 返回 [{ label, start: Date, startStr, endStr }]（start 升序，含当前桶）
 */
function buildBuckets(granularity) {
  const g = granularity === 'week' || granularity === 'month' ? granularity : 'day';
  const buckets = [];
  if (g === 'day') {
    for (let i = 13; i >= 0; i--) {
      const start = daysAgoStart(i);
      buckets.push({ label: dayStr(start), start, startStr: dayStr(start), endStr: dayStr(start) });
    }
  } else if (g === 'week') {
    const thisMonday = mondayOf(new Date());
    for (let i = 11; i >= 0; i--) {
      const start = new Date(thisMonday);
      start.setDate(start.getDate() - 7 * i);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      buckets.push({ label: dayStr(start), start, startStr: dayStr(start), endStr: dayStr(end) });
    }
  } else {
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const label = `${start.getFullYear()}-${pad(start.getMonth() + 1)}`;
      buckets.push({ label, start, startStr: dayStr(start), endStr: dayStr(end) });
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

    const action = event.action || 'overview';

    // ---------- 指标总览 ----------
    if (action === 'overview') {
      const t0 = todayStart();
      const [usersTotal, usersNew, visitsToday, loginsToday, assessmentsToday, checkinsToday, auditToday, grantsAll, resultsDone] = await Promise.all([
        db.collection('users').where({ isAdmin: _.neq(true) }).count(),
        db.collection('users').where({ isAdmin: _.neq(true), _createTime: _.gte(t0) }).count(),
        db.collection('access_logs').where({ day: dayStr(new Date()) }).count(),
        db.collection('access_logs').where({ day: dayStr(new Date()), type: 'login' }).count(),
        db.collection('access_logs').where({ day: dayStr(new Date()), type: 'assessment' }).count(),
        db.collection('checkin_records').where({ date: dayStr(new Date()), completedCount: _.gt(0) }).count(),
        db.collection('admin_audit_logs').where({ createdAt: _.gte(t0) }).count(),
        db.collection('assessment_grants').limit(500).get(),
        db.collection('assessment_results').where({ status: 'completed' }).count(),
      ]);

      const grants = grantsAll.data || [];
      const now = new Date();
      const activeGrants = grants.filter((g) => {
        if (g.status === 'revoked') return false;
        if (g.expireAt && new Date(g.expireAt) < now) return false;
        return (Number(g.totalQuota) || 0) - (Number(g.usedCount) || 0) > 0;
      });
      const expiringSoon = activeGrants.filter((g) => {
        if (!g.expireAt) return false;
        const diff = new Date(g.expireAt) - now;
        return diff < 7 * 24 * 3600 * 1000;
      });
      const remainingTotal = activeGrants.reduce(
        (s, g) => s + Math.max(0, (Number(g.totalQuota) || 0) - (Number(g.usedCount) || 0)),
        0
      );

      return {
        success: true,
        overview: {
          usersTotal: usersTotal.total,
          usersNewToday: usersNew.total,
          visitsToday: visitsToday.total,
          loginsToday: loginsToday.total,
          assessmentsToday: assessmentsToday.total,
          checkinsToday: checkinsToday.total,
          auditToday: auditToday.total,
          assessmentsCompleted: resultsDone.total,
          grants: {
            total: grants.length,
            active: activeGrants.length,
            expiringSoon: expiringSoon.length,
            remainingTotal,
          },
        },
      };
    }

    // ---------- 趋势（日/周/月 柱状分桶） ----------
    if (action === 'trend') {
      const buckets = buildBuckets(event.granularity);
      const since = buckets[0].start;
      const firstStr = buckets[0].startStr;
      const lastStr = buckets[buckets.length - 1].endStr;

      const [logs, checkins] = await Promise.all([
        fetchAll(() => db.collection('access_logs').where({ createdAt: _.gte(since) })),
        fetchAll(() =>
          db.collection('checkin_records').where({ date: _.gte(firstStr).and(_.lte(lastStr)), completedCount: _.gt(0) })
        ),
      ]);

      // 按日期串定位桶（'YYYY-MM-DD' 字典序即时间序）
      const series = buckets.map((b) => ({ visitors: new Set(), logins: 0, assessments: 0, checkins: 0 }));

      const bucketOfDay = (ds) => {
        if (!ds) return -1;
        for (let i = buckets.length - 1; i >= 0; i--) {
          if (ds >= buckets[i].startStr && ds <= buckets[i].endStr) return i;
        }
        return -1;
      };

      logs.forEach((l) => {
        const ds = l.day || dayStr(new Date(l.createdAt));
        const i = bucketOfDay(ds);
        if (i < 0) return;
        series[i].visitors.add(l.openid);
        if (l.type === 'login') series[i].logins += 1;
        if (l.type === 'assessment') series[i].assessments += 1;
      });
      checkins.forEach((c) => {
        const i = bucketOfDay(c.date);
        if (i < 0) return;
        series[i].checkins += 1;
      });

      const labels = buckets.map((b) => b.label);
      const trend = buckets.map((b, i) => ({
        date: b.label,
        visitors: series[i].visitors.size,
        logins: series[i].logins,
        assessments: series[i].assessments,
        checkins: series[i].checkins,
      }));

      return { success: true, granularity: event.granularity || 'day', days: labels, buckets: labels, trend };
    }

    // ---------- 管理员操作记录 ----------
    if (action === 'auditLogs') {
      const { page = 1, pageSize = 20, module } = event;
      const skip = Math.max(0, (Number(page) - 1) * Number(pageSize));
      const where = module ? { module } : {};
      const [listRes, countRes] = await Promise.all([
        db.collection('admin_audit_logs').where(where).orderBy('createdAt', 'desc').skip(skip).limit(Number(pageSize)).get(),
        db.collection('admin_audit_logs').where(where).count(),
      ]);
      return { success: true, list: listRes.data || [], total: countRes.total, page: Number(page), pageSize: Number(pageSize) };
    }

    // ---------- 用户访问记录 ----------
    if (action === 'accessLogs') {
      const { page = 1, pageSize = 20, type } = event;
      const skip = Math.max(0, (Number(page) - 1) * Number(pageSize));
      const where = type ? { type } : {};
      const [listRes, countRes, usersRes] = await Promise.all([
        db.collection('access_logs').where(where).orderBy('createdAt', 'desc').skip(skip).limit(Number(pageSize)).get(),
        db.collection('access_logs').where(where).count(),
        db.collection('users').where({ isAdmin: _.neq(true) }).limit(500).get(),
      ]);
      const userMap = {};
      (usersRes.data || []).forEach((u) => {
        userMap[u._openid] = { nickName: u.nickName || '微信用户', phone: u.phone || '' };
      });
      const list = (listRes.data || []).map((l) => ({
        ...l,
        nickName: (userMap[l.openid] && userMap[l.openid].nickName) || '未知用户',
        phone: (userMap[l.openid] && userMap[l.openid].phone) || '',
      }));
      return { success: true, list, total: countRes.total, page: Number(page), pageSize: Number(pageSize) };
    }

    return { success: false, error: `未知 action: ${action}` };
  } catch (e) {
    console.error('[adminDashboard] 执行失败', e);
    return { success: false, error: e.message || '服务异常' };
  }
};
