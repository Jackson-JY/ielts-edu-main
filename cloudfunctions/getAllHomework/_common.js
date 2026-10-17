/**
 * 云函数共享工具层（单一源：cloudfunctions/_shared/common.js）
 *
 * CloudBase 每个云函数独立打包、无共享 node_modules，因此采用
 * 「单一源 + 部署前同步拷贝」模式：
 *   1. 修改本文件后运行 `node cloudfunctions/sync-shared.js`
 *   2. 脚本会把本文件拷贝为所有引用它的函数目录下的 _common.js
 *   3. 各函数通过 require('./_common') 使用，禁止直接修改拷贝副本
 */
const crypto = require('crypto');

/** 管理员账号密码哈希盐（与 adminLogin / initAdmin / adminManage 历史约定一致，禁止改动） */
const PASSWORD_SALT = 'ielts-edu-admin-v1';

/**
 * 统一入参归一化：兼容两种调用形态
 * - 小程序云调用 / tcb fn invoke：event 即参数对象
 * - HTTP 触发（云接入）：参数在 event.body（JSON 字符串或对象）
 * body 为合法 JSON 时合并到 event 上（body 字段优先），否则原样返回。
 */
function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event === 'object' && event.body) {
    try {
      const parsed = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (parsed && typeof parsed === 'object') return { ...event, ...parsed };
    } catch (e) {
      return event;
    }
  }
  return event;
}

/**
 * 统一管理员鉴权：
 * - _token 优先（Web 端，查 admin_sessions，校验 expireAt）
 * - openid + users.isAdmin 兜底（小程序端）
 * 返回 { ok, userId, openid, nickName, authError }：
 * - token 有效 / openid 管理员 → { ok: true, userId, openid, nickName }
 * - token 无效或过期 / 无 openid → { ok: false, authError: true }（前端引导重新登录）
 * - 有 openid 但非管理员 → { ok: false }
 * - 内部异常（如数据库故障）→ { ok: false, authError: true }
 */
async function authenticate(event, db, cloud) {
  try {
    const token = event && event._token;
    if (token) {
      const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
      const session = res.data && res.data[0];
      if (session && session.expireAt && new Date(session.expireAt) > new Date()) {
        return { ok: true, userId: session.userId, openid: session.openid, nickName: session.nickName, token };
      }
      return { ok: false, authError: true };
    }

    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return { ok: false, authError: true };

    const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
    const user = res.data && res.data[0];
    if (user && user.isAdmin === true) {
      return { ok: true, userId: user._id, openid, nickName: user.nickName };
    }
    return { ok: false };
  } catch (e) {
    console.error('[common] 鉴权异常', e);
    return { ok: false, authError: true };
  }
}

/** 分页拉取全量，避免单次 limit 截断（每页 100，默认最多 50 页 = 5000 条） */
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

/** 管理员账号密码哈希：sha256(username:password:盐) */
function hashPassword(username, password) {
  return crypto.createHash('sha256').update(`${username}:${password}:${PASSWORD_SALT}`).digest('hex');
}

/** 写管理员操作审计日志（admin_audit_logs），失败不阻断主流程 */
async function logAudit(db, auth, module, action, detail) {
  try {
    await db.collection('admin_audit_logs').add({
      data: {
        adminId: (auth && auth.userId) || '',
        adminName: (auth && auth.nickName) || '管理员',
        module,
        action,
        detail: detail || '',
        createdAt: new Date(),
      },
    });
  } catch (e) {
    console.error('[common] 写审计日志失败', e);
  }
}

module.exports = { PASSWORD_SALT, normalizeEvent, authenticate, fetchAll, hashPassword, logAudit };
