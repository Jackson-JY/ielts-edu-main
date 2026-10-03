// 云函数：assessmentGrant —— 测评授权管理（管理员）
//   action='list'   授权列表 + 学生列表（供选择）
//   action='grant'  新增/调整授权（userId + totalQuota>=1 + expireAt + note）
//   action='revoke' 吊销授权
//   action='resume' 恢复授权（过期/无余量时返回提示）
// 鉴权：token 优先（Web），openid+isAdmin 兜底（小程序）
// 每次写操作落一条 admin_audit_logs
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const GRANTS = 'assessment_grants';
const AUDIT = 'admin_audit_logs';

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
      return { ok: true, userId: session.userId, nickName: session.nickName };
    }
    return { ok: false, authError: true };
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (openid) {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
    const user = res.data && res.data[0];
    if (user && user.isAdmin === true) return { ok: true, userId: user._id, nickName: user.nickName };
    return { ok: false };
  }
  return { ok: false, authError: true };
}

async function logAudit(auth, action, detail) {
  try {
    await db.collection(AUDIT).add({
      data: {
        adminId: auth.userId || '',
        adminName: auth.nickName || '管理员',
        module: 'assessment_grant',
        action,
        detail: detail || '',
        createdAt: new Date(),
      },
    });
  } catch (e) {
    console.error('[assessmentGrant] 写审计日志失败', e);
  }
}

/** 查询用户（ userId 为 users._id ） */
async function getUser(userId) {
  try {
    const res = await db.collection('users').doc(userId).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
}

/** 授权判定（与 assessmentAccess 口径一致） */
function evaluate(grant) {
  if (!grant || grant.status === 'revoked') return { authorized: false, reason: grant ? 'REVOKED' : 'NO_GRANT' };
  const now = new Date();
  if (grant.expireAt && new Date(grant.expireAt) < now) return { authorized: false, reason: 'EXPIRED' };
  const total = Number(grant.totalQuota) || 0;
  const used = Number(grant.usedCount) || 0;
  if (total - used <= 0) return { authorized: false, reason: 'NO_QUOTA' };
  return { authorized: true, remaining: total - used };
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

    const action = event.action;

    // ---------- 列表：授权 + 学生 ----------
    if (action === 'list') {
      const [grantsRes, usersRes] = await Promise.all([
        db.collection(GRANTS).orderBy('updatedAt', 'desc').limit(200).get(),
        db.collection('users').where({ isAdmin: _.neq(true) }).limit(500).get(),
      ]);
      const students = (usersRes.data || []).map((u) => ({
        userId: u._id,
        nickName: u.nickName || '微信用户',
        phone: u.phone || '',
        avatarUrl: u.avatarUrl || '',
      }));
      return { success: true, grants: grantsRes.data || [], students };
    }

    // ---------- 授权（新增/调整） ----------
    if (action === 'grant') {
      const { userId, totalQuota, expireAt, note } = event;
      if (!userId) return { success: false, error: '缺少学生' };
      const quota = Number(totalQuota);
      if (!Number.isInteger(quota) || quota < 1) return { success: false, error: '使用次数必须为不小于 1 的整数' };
      const user = await getUser(userId);
      if (!user) return { success: false, error: '学生不存在' };
      let expireDate = null;
      if (expireAt) {
        expireDate = new Date(expireAt);
        if (isNaN(expireDate.getTime())) return { success: false, error: '截止时间格式错误' };
      }

      const now = new Date();
      const existRes = await db.collection(GRANTS).where({ userId }).limit(1).get();
      const exist = existRes.data && existRes.data[0];

      if (exist) {
        await db.collection(GRANTS).doc(exist._id).update({
          data: {
            _openid: user._openid || exist._openid,
            nickName: user.nickName || exist.nickName,
            phone: user.phone || exist.phone || '',
            totalQuota: quota,
            ...(expireDate ? { expireAt: expireDate } : {}),
            note: note || '',
            status: 'active',
            grantedBy: auth.nickName || '管理员',
            updatedAt: now,
          },
        });
        await logAudit(auth, 'grant.grant', `调整授权：${user.nickName || '学生'} → ${quota} 次${expireDate ? `，截止 ${dayStr(expireDate)}` : ''}`);
        return { success: true, message: '授权已更新' };
      }

      await db.collection(GRANTS).add({
        data: {
          userId,
          _openid: user._openid || '',
          nickName: user.nickName || '微信用户',
          phone: user.phone || '',
          totalQuota: quota,
          usedCount: 0,
          ...(expireDate ? { expireAt: expireDate } : {}),
          note: note || '',
          status: 'active',
          grantedBy: auth.nickName || '管理员',
          grantedAt: now,
          updatedAt: now,
        },
      });
      await logAudit(auth, 'grant.grant', `新增授权：${user.nickName || '学生'} → ${quota} 次${expireDate ? `，截止 ${dayStr(expireDate)}` : ''}`);
      return { success: true, message: '授权成功' };
    }

    // ---------- 吊销 ----------
    if (action === 'revoke') {
      const { userId } = event;
      if (!userId) return { success: false, error: '缺少学生' };
      const existRes = await db.collection(GRANTS).where({ userId }).limit(1).get();
      const exist = existRes.data && existRes.data[0];
      if (!exist) return { success: false, error: '该学生暂无授权记录' };
      await db.collection(GRANTS).doc(exist._id).update({
        data: { status: 'revoked', updatedAt: new Date() },
      });
      await logAudit(auth, 'grant.revoke', `吊销授权：${exist.nickName || '学生'}`);
      return { success: true, message: '已吊销' };
    }

    // ---------- 恢复 ----------
    if (action === 'resume') {
      const { userId } = event;
      if (!userId) return { success: false, error: '缺少学生' };
      const existRes = await db.collection(GRANTS).where({ userId }).limit(1).get();
      const exist = existRes.data && existRes.data[0];
      if (!exist) return { success: false, error: '该学生暂无授权记录' };
      await db.collection(GRANTS).doc(exist._id).update({
        data: { status: 'active', updatedAt: new Date() },
      });
      const verdict = evaluate({ ...exist, status: 'active' });
      await logAudit(auth, 'grant.resume', `恢复授权：${exist.nickName || '学生'}${verdict.authorized ? '' : '（注意：已过期或次数用尽）'}`);
      return {
        success: true,
        message: '已恢复',
        ...(verdict.authorized ? {} : { warning: '该授权已过期或次数用尽，请调整次数/截止时间' }),
      };
    }

    return { success: false, error: `未知 action: ${action}` };
  } catch (e) {
    console.error('[assessmentGrant] 执行失败', e);
    return { success: false, error: e.message || '服务异常' };
  }
};

function dayStr(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
