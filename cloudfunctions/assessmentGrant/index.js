// 云函数：assessmentGrant —— 测评授权管理（管理员）
//   action='list'        授权列表 + 学生列表（供选择）+ 班级列表
//   action='grant'       新增/调整单人授权（userId + totalQuota>=1 + expireAt + note）
//   action='grantBatch'  按班级/多人批量授权（classIds[] / userIds[] + totalQuota + expireAt + note）
//                        规则：已有授权次数累加、截止时间取更晚者；无授权新建；已吊销自动恢复
//   action='revoke'      吊销授权
//   action='resume'      恢复授权（过期/无余量时返回提示）
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

/** 班级列表（集合不存在时返回空数组） */
async function safeListClasses() {
  try {
    const res = await db.collection('classes').limit(100).get();
    return (res.data || []).map((c) => ({ _id: c._id, name: c.name }));
  } catch (e) {
    return [];
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

    // ---------- 列表：授权 + 学生 + 班级 ----------
    if (action === 'list') {
      const [grantsRes, usersRes, classesRes] = await Promise.all([
        db.collection(GRANTS).orderBy('updatedAt', 'desc').limit(200).get(),
        db.collection('users').limit(500).get(),
        safeListClasses(),
      ]);
      const students = (usersRes.data || []).map((u) => ({
        userId: u._id,
        nickName: u.nickName || '微信用户',
        phone: u.phone || '',
        avatarUrl: u.avatarUrl || '',
        classIds: Array.isArray(u.classIds) ? u.classIds : [],
      }));
      return { success: true, grants: grantsRes.data || [], students, classes: classesRes };
    }

    // ---------- 按班级/多人批量授权 ----------
    if (action === 'grantBatch') {
      const { classIds, userIds, totalQuota, expireAt, note } = event;
      const quota = Number(totalQuota);
      if (!Number.isInteger(quota) || quota < 1) return { success: false, error: '使用次数必须为不小于 1 的整数' };
      const clsIds = Array.isArray(classIds) ? classIds.filter((x) => typeof x === 'string' && x) : [];
      const usrIds = Array.isArray(userIds) ? userIds.filter((x) => typeof x === 'string' && x) : [];
      if (clsIds.length === 0 && usrIds.length === 0) return { success: false, error: '请选择班级或学生' };
      let expireDate = null;
      if (expireAt) {
        expireDate = new Date(expireAt);
        if (isNaN(expireDate.getTime())) return { success: false, error: '截止时间格式错误' };
      }

      // 汇总目标学生：指定学生 ∪ 班级内全部学生
      const targetMap = {};
      if (usrIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < usrIds.length; i += 50) chunks.push(usrIds.slice(i, i + 50));
        const ress = await Promise.all(chunks.map((ids) => db.collection('users').where({ _id: _.in(ids) }).get()));
        ress.forEach((r) => (r.data || []).forEach((u) => { targetMap[u._id] = u; }));
      }
      if (clsIds.length > 0) {
        const ress = await Promise.all(clsIds.map((cid) => db.collection('users').where({ classIds: cid }).limit(1000).get()));
        ress.forEach((r) => (r.data || []).forEach((u) => { targetMap[u._id] = u; }));
      }
      const targets = Object.values(targetMap);
      if (targets.length === 0) return { success: false, error: '所选班级/学生下没有学生' };

      // 班级名（审计用）
      let clsNames = [];
      if (clsIds.length > 0) {
        const cRes = await db.collection('classes').where({ _id: _.in(clsIds) }).get();
        clsNames = (cRes.data || []).map((c) => c.name);
      }

      const now = new Date();
      let created = 0;
      let added = 0;

      // 逐个 upsert（每批 20 并行）
      const chunk = (arr, n) => {
        const out = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };
      for (const batch of chunk(targets, 20)) {
        await Promise.all(
          batch.map(async (user) => {
            const existRes = await db.collection(GRANTS).where({ userId: user._id }).limit(1).get();
            const exist = existRes.data && existRes.data[0];
            if (exist) {
              // 次数累加；截止时间：未传则保持原样；传了则取更晚者（长期有效视为最晚）
              let expireUpdate = {};
              if (expireDate) {
                const oldTs = exist.expireAt ? new Date(exist.expireAt).getTime() : Infinity;
                expireUpdate = oldTs <= expireDate.getTime() ? { expireAt: expireDate } : { expireAt: _.remove() };
              }
              await db.collection(GRANTS).doc(exist._id).update({
                data: {
                  totalQuota: (Number(exist.totalQuota) || 0) + quota,
                  ...expireUpdate,
                  note: note || exist.note || '',
                  status: 'active',
                  grantedBy: auth.nickName || '管理员',
                  updatedAt: now,
                },
              });
              added += 1;
            } else {
              await db.collection(GRANTS).add({
                data: {
                  userId: user._id,
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
              created += 1;
            }
          })
        );
      }

      const targetDesc = [
        clsNames.length ? `班级[${clsNames.join('、')}]` : '',
        usrIds.length ? `指定 ${usrIds.length} 人` : '',
      ]
        .filter(Boolean)
        .join(' + ');
      await logAudit(
        auth,
        'grant.grantBatch',
        `批量授权：${targetDesc} → 每人 +${quota} 次${expireDate ? `，截止 ${dayStr(expireDate)}` : '，长期有效'}（新建 ${created}，累加 ${added}，共 ${targets.length} 人）`
      );
      return {
        success: true,
        message: `已为 ${targets.length} 名学生授权（新建 ${created}，累加 ${added}）`,
        total: targets.length,
        created,
        added,
      };
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
