// 云函数：getDailyTasks —— 获取每日打卡任务
//   action='getByDate'  按日期取单条任务（学生端 + 管理端编辑回显）
//   action='getHistory' 取最近 N 天发布历史（管理端复制下拉）
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

// 学生端无需管理员鉴权，只需有 openid 或 token 即可
async function lightAuth(event) {
  const token = event && event._token;
  if (token) {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];
    if (session && session.expireAt && new Date(session.expireAt) > new Date()) {
      return { ok: true };
    }
  }
  const wxContext = cloud.getWXContext();
  if (wxContext.OPENID) return { ok: true };
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

exports.main = async (event) => {
  event = normalizeEvent(event);
  try {
    const auth = await lightAuth(event);
    if (!auth.ok) return { success: false, authError: true, error: '请先登录' };

    const { action } = event || {};

    // 按日期取单条
    if (action === 'getByDate') {
      const { date } = event;
      if (!date) return { success: false, error: '缺少日期' };
      const res = await db.collection('daily_tasks').where({ date }).limit(1).get();
      const task = res.data && res.data[0];
      if (!task) return { success: true, task: null };
      return {
        success: true,
        task: {
          _id: task._id,
          date: task.date,
          items: task.items,
          totalMinutes: task.totalMinutes,
          createdBy: task.createdBy,
          createdByName: task.createdByName,
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
      }));
      return { success: true, history };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    // 集合不存在时返回空（数据库集合需先有记录才能查询）
    if (e.errCode === -502005 || (e.message && e.message.includes('-502005'))) {
      if (event.action === 'getByDate') return { success: true, task: null };
      if (event.action === 'getHistory') return { success: true, history: [] };
    }
    console.error('[getDailyTasks] 失败', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
