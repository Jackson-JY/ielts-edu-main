// 云函数：assessmentAccess —— 测评授权校验与扣次（学生端）
//   action='check'    校验当前用户测评授权：{ authorized, remaining, totalQuota, expireAt, reason }
//                     顺带按天去重写一条 access_logs（type='assessment'）
//   action='complete' 完整测评完成（写作最后一步）：
//                     ① 标记 assessment_results 记录 completed（学生数据不丢）
//                     ② 服务端原子扣次（usedCount: _.inc(1)，条件 usedCount < totalQuota 防并发超扣）
// 授权模型（assessment_grants，一用户一条）：
//   { _openid, userId, nickName, phone, totalQuota(必填>=1), usedCount, expireAt, status: 'active'|'revoked', note, grantedBy }
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const GRANTS = 'assessment_grants';
const RESULTS = 'assessment_results';
const ACCESS_LOGS = 'access_logs';

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 读取当前用户授权记录 */
async function getGrant(openid) {
  try {
    const res = await db.collection(GRANTS).where({ _openid: openid }).limit(1).get();
    return (res.data && res.data[0]) || null;
  } catch (e) {
    // 集合不存在等情况按无授权处理
    console.error('[assessmentAccess] 读取授权失败', e);
    return null;
  }
}

/** 授权判定 */
function evaluate(grant) {
  if (!grant) return { authorized: false, reason: 'NO_GRANT' };
  if (grant.status === 'revoked') return { authorized: false, reason: 'REVOKED' };
  const now = new Date();
  if (grant.expireAt && new Date(grant.expireAt) < now) {
    return { authorized: false, reason: 'EXPIRED' };
  }
  const total = Number(grant.totalQuota) || 0;
  const used = Number(grant.usedCount) || 0;
  const remaining = Math.max(0, total - used);
  if (remaining <= 0) return { authorized: false, reason: 'NO_QUOTA' };
  return {
    authorized: true,
    remaining,
    totalQuota: total,
    usedCount: used,
    expireAt: grant.expireAt || null,
  };
}

/** 访问日志：按（openid+type+天）去重，避免日志膨胀 */
async function logDailyVisit(openid, type, detail) {
  try {
    const day = dayKey(new Date());
    const exist = await db.collection(ACCESS_LOGS)
      .where({ openid, type, day })
      .limit(1)
      .get();
    if (exist.data && exist.data.length) return;
    await db.collection(ACCESS_LOGS).add({
      data: { openid, type, day, detail: detail || '', createdAt: new Date() },
    });
  } catch (e) {
    console.error('[assessmentAccess] 写访问日志失败', e);
  }
}

/** 标记测评记录完成：优先用客户端传的 recordId（校验归属），否则查最近一条进行中记录 */
async function finalizeRecord(openid, recordId) {
  const now = new Date();
  if (recordId) {
    try {
      const doc = await db.collection(RESULTS).doc(recordId).get();
      const data = doc.data || (doc.data === undefined ? null : doc.data);
      if (data && data._openid === openid && data.status !== 'completed') {
        await db.collection(RESULTS).doc(recordId).update({
          data: { status: 'completed', completeTime: now },
        });
        return recordId;
      }
      if (data && data.status === 'completed') return recordId; // 已完成，幂等
    } catch (e) {
      console.error('[assessmentAccess] 按 recordId 完成失败', e);
    }
  }
  // 兜底：最近 30 天内进行中的完整测评
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const res = await db.collection(RESULTS)
    .where({ _openid: openid, type: 'ability_model', status: 'in_progress' })
    .orderBy('_createTime', 'desc')
    .limit(5)
    .get();
  const hit = (res.data || []).find((d) => {
    const t = d._createTime ? new Date(d._createTime) : null;
    return t && t >= since;
  });
  if (hit) {
    await db.collection(RESULTS).doc(hit._id).update({
      data: { status: 'completed', completeTime: now },
    });
    return hit._id;
  }
  return null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: '无法获取用户身份' };
  const action = event && event.action;

  try {
    // ---------- 校验授权 ----------
    if (action === 'check') {
      const grant = await getGrant(OPENID);
      const verdict = evaluate(grant);
      await logDailyVisit(OPENID, 'assessment', '进入测评');
      return { success: true, ...verdict };
    }

    // ---------- 完成扣次 ----------
    if (action === 'complete') {
      const recordId = await finalizeRecord(OPENID, event.recordId);

      const grant = await getGrant(OPENID);
      const verdict = evaluate(grant);
      if (!verdict.authorized) {
        // 数据已标记完成，但不扣次；前端提示"未计入授权次数"
        return { success: true, recordId, charged: false, reason: verdict.reason };
      }

      // 原子扣次：条件更新（usedCount < totalQuota 才 +1），防并发超扣
      const upd = await db.collection(GRANTS)
        .where({ _openid: OPENID, usedCount: _.lt(verdict.totalQuota) })
        .update({ data: { usedCount: _.inc(1), lastUsedAt: new Date() } });
      const updated = (upd.stats && upd.stats.updated) || 0;
      if (updated === 0) {
        return { success: true, recordId, charged: false, reason: 'NO_QUOTA' };
      }
      return {
        success: true,
        recordId,
        charged: true,
        remaining: Math.max(0, verdict.totalQuota - verdict.usedCount - 1),
      };
    }

    return { success: false, error: `未知 action: ${action}` };
  } catch (e) {
    console.error('[assessmentAccess] 执行失败', e);
    return { success: false, error: e.message || '服务异常' };
  }
};
