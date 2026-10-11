// 云函数：getDailyTasks —— 获取每日打卡任务
//   action='getByDate'  按日期取任务
//     · 管理端（token）：返回 tasks[]（当日全部任务组，含 classIds/classKey，供多组编辑切换）
//     · 学生端（openid）：按学生所在班级过滤，合并「全体任务 + 本班任务」为一条
//       仅一条命中时 item id 保持原样（兼容历史打卡记录）；多条命中时 item id 加 `${taskId}_` 前缀并携带 taskId
//   action='getHistory' 取最近 N 天发布历史（管理端复制下拉，含发布对象）
// 鉴权：token 优先（Web），openid 兜底（小程序学生也可调用）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  if (event.body && typeof event.body === 'object') return event.body;
  return event;
}

/** 返回 { ok, isAdmin }：token 有效 → 管理端；openid → 学生端 */
async function lightAuth(event) {
  const token = event && event._token;
  if (token) {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];
    if (session && session.expireAt && new Date(session.expireAt) > new Date()) {
      return { ok: true, isAdmin: true };
    }
  }
  const wxContext = cloud.getWXContext();
  if (wxContext.OPENID) return { ok: true, isAdmin: false };
  return { ok: false, authError: true };
}

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

/** 管理端返回结构（原始 doc，含发布对象） */
function adminTaskView(t) {
  return {
    _id: t._id,
    date: t.date,
    classIds: Array.isArray(t.classIds) ? t.classIds : [],
    classKey: t.classKey || '',
    items: t.items,
    totalMinutes: t.totalMinutes,
    createdBy: t.createdBy,
    createdByName: t.createdByName,
  };
}

exports.main = async (event) => {
  event = normalizeEvent(event);
  try {
    const auth = await lightAuth(event);
    if (!auth.ok) return { success: false, authError: true, error: '请先登录' };

    const { action } = event || {};

    // 按日期取任务
    if (action === 'getByDate') {
      const { date } = event;
      if (!date) return { success: false, error: '缺少日期' };

      let tasks = [];
      try {
        tasks = await fetchAll(() => db.collection('daily_tasks').where({ date }));
      } catch (e) {
        if (!(e.errCode === -502005 || (e.message && e.message.includes('-502005')))) throw e;
        tasks = [];
      }

      // ---------- 管理端：返回当日全部任务组 ----------
      if (auth.isAdmin) {
        // 兼容：无 classKey 字段的历史数据按「全体」处理
        const views = tasks.map((t) => ({
          ...adminTaskView(t),
          classKey: t.classKey || (Array.isArray(t.classIds) && t.classIds.length ? t.classIds.slice().sort().join(',') : ''),
        }));
        const allTask = views.find((t) => t.classKey === '') || null;
        return { success: true, task: allTask, tasks: views };
      }

      // ---------- 学生端：按班级过滤 + 合并 ----------
      let myClassIds = [];
      try {
        const wxContext = cloud.getWXContext();
        const uRes = await db.collection('users').where({ _openid: wxContext.OPENID }).limit(1).get();
        const u = uRes.data && uRes.data[0];
        if (u && Array.isArray(u.classIds)) myClassIds = u.classIds;
      } catch (e) {
        // 查不到用户按无班级处理（只见全体任务）
      }
      const mySet = new Set(myClassIds);

      const matched = tasks.filter((t) => {
        const cids = Array.isArray(t.classIds) ? t.classIds : [];
        return cids.length === 0 || cids.some((cid) => mySet.has(cid));
      });

      if (matched.length === 0) return { success: true, task: null };

      if (matched.length === 1) {
        // 单条命中：保持原始 item id（与历史打卡记录完全兼容）
        const t = matched[0];
        return {
          success: true,
          task: {
            _id: t._id,
            date: t.date,
            items: (t.items || []).map((it) => ({ ...it, taskId: t._id })),
            totalMinutes: t.totalMinutes,
            createdBy: t.createdBy,
            createdByName: t.createdByName,
          },
        };
      }

      // 多条命中：合并 items，id 加 taskId 前缀避免跨组冲突
      const items = [];
      let totalMinutes = 0;
      matched.forEach((t) => {
        (t.items || []).forEach((it) => {
          items.push({ ...it, id: `${t._id}_${it.id}`, taskId: t._id });
        });
        totalMinutes += t.totalMinutes || 0;
      });
      return {
        success: true,
        task: {
          _id: matched[0]._id,
          date,
          items,
          totalMinutes,
          merged: true,
          taskCount: matched.length,
        },
      };
    }

    // 取最近历史（管理端复制用）
    if (action === 'getHistory') {
      const limit = Math.min(30, parseInt(event.limit, 10) || 14);
      const tasks = await fetchAll(() =>
        db.collection('daily_tasks').orderBy('date', 'desc').limit(limit)
      );
      const history = tasks.slice(0, limit).map((t) => ({
        _id: t._id,
        date: t.date,
        items: t.items,
        totalMinutes: t.totalMinutes,
        classIds: Array.isArray(t.classIds) ? t.classIds : [],
        classKey: t.classKey || (Array.isArray(t.classIds) && t.classIds.length ? t.classIds.slice().sort().join(',') : ''),
      }));
      return { success: true, history };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    // 集合不存在时返回空（数据库集合需先有记录才能查询）
    if (e.errCode === -502005 || (e.message && e.message.includes('-502005'))) {
      if (event.action === 'getByDate') return { success: true, task: null, tasks: [] };
      if (event.action === 'getHistory') return { success: true, history: [] };
    }
    console.error('[getDailyTasks] 失败', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
