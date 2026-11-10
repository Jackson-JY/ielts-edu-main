// 云函数：manageClasses —— 班级管理（管理员）
//   action='list'        班级列表（含人数）+ 学生列表（含 classIds，供成员选择）
//   action='create'      新建班级 { name }
//   action='rename'      重命名 { classId, name }
//   action='delete'      删除班级 { classId }（自动解绑所有学生）
//   action='setStudents' 设置班级成员名单 { classId, userIds: [] }（双向同步 users.classIds）
// 鉴权：token 优先（Web），openid+isAdmin 兜底（小程序）
// 写操作落 admin_audit_logs
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const CLASSES = 'classes';
const USERS = 'users';

const common = require('./_common');
const normalizeEvent = common.normalizeEvent;
const authenticate = (event) => common.authenticate(event, db, cloud);
const logAudit = (auth, action, detail) => common.logAudit(db, auth, 'classes', action, detail);
const fetchAll = common.fetchAll;

function cleanName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  if (n.length > 20) return null;
  return n;
}

async function getClass(classId) {
  try {
    const res = await db.collection(CLASSES).doc(classId).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
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

    // ---------- 列表：班级 + 学生 ----------
    if (action === 'list') {
      const [classesRes, usersAll] = await Promise.all([
        fetchAll(() => db.collection(CLASSES).orderBy('createdAt', 'asc')),
        fetchAll(() => db.collection(USERS)),
      ]);
      // 管理员同样可以加入班级，因此不再过滤 isAdmin，仅回传标记供前端区分展示
      const students = (usersAll || []).map((u) => ({
        userId: u._id,
        nickName: u.nickName || '微信用户',
        phone: u.phone || '',
        avatarUrl: u.avatarUrl || '',
        isAdmin: u.isAdmin === true,
        classIds: Array.isArray(u.classIds) ? u.classIds : [],
      }));
      const countById = {};
      students.forEach((s) => {
        (s.classIds || []).forEach((cid) => {
          countById[cid] = (countById[cid] || 0) + 1;
        });
      });
      const classes = (classesRes || []).map((c) => ({
        _id: c._id,
        name: c.name,
        studentCount: countById[c._id] || 0,
        createdAt: c.createdAt,
      }));
      return { success: true, classes, students };
    }

    // ---------- 新建 ----------
    if (action === 'create') {
      const name = cleanName(event.name);
      if (!name) return { success: false, error: '班级名称不能为空且不超过 20 字' };
      const dup = await db.collection(CLASSES).where({ name }).limit(1).get();
      if (dup.data && dup.data.length > 0) return { success: false, error: `班级「${name}」已存在` };
      const now = new Date();
      const addRes = await db.collection(CLASSES).add({
        data: { name, createdBy: auth.userId || '', createdByName: auth.nickName || '', createdAt: now, updatedAt: now },
      });
      await logAudit(auth, 'classes.create', `新建班级：${name}`);
      return { success: true, message: '班级已创建', classId: addRes._id };
    }

    // ---------- 重命名 ----------
    if (action === 'rename') {
      const { classId } = event;
      const name = cleanName(event.name);
      if (!classId) return { success: false, error: '缺少班级' };
      if (!name) return { success: false, error: '班级名称不能为空且不超过 20 字' };
      const exist = await getClass(classId);
      if (!exist) return { success: false, error: '班级不存在' };
      const dup = await db.collection(CLASSES).where({ name }).limit(1).get();
      if (dup.data && dup.data.length > 0 && dup.data[0]._id !== classId) {
        return { success: false, error: `班级「${name}」已存在` };
      }
      await db.collection(CLASSES).doc(classId).update({ data: { name, updatedAt: new Date() } });
      await logAudit(auth, 'classes.rename', `重命名班级：${exist.name} → ${name}`);
      return { success: true, message: '已重命名' };
    }

    // ---------- 删除（自动解绑学生） ----------
    if (action === 'delete') {
      const { classId } = event;
      if (!classId) return { success: false, error: '缺少班级' };
      const exist = await getClass(classId);
      if (!exist) return { success: false, error: '班级不存在' };
      // 解绑所有学生
      let unbound = 0;
      try {
        const unbindRes = await db.collection(USERS).where({ classIds: classId }).update({
          data: { classIds: _.pull(classId) },
        });
        unbound = (unbindRes.stats && unbindRes.stats.updated) || 0;
      } catch (e) {
        console.error('[manageClasses] 解绑学生失败', e);
      }
      await db.collection(CLASSES).doc(classId).remove();
      await logAudit(auth, 'classes.delete', `删除班级：${exist.name}（解绑 ${unbound} 名学生）`);
      return { success: true, message: `已删除「${exist.name}」并解绑 ${unbound} 名学生` };
    }

    // ---------- 设置班级成员名单 ----------
    if (action === 'setStudents') {
      const { classId, userIds } = event;
      if (!classId) return { success: false, error: '缺少班级' };
      if (!Array.isArray(userIds)) return { success: false, error: '参数错误' };
      const exist = await getClass(classId);
      if (!exist) return { success: false, error: '班级不存在' };

      const ids = [...new Set(userIds.filter((x) => typeof x === 'string' && x))];

      // 当前成员
      const current = await fetchAll(() => db.collection(USERS).where({ classIds: classId }).field({ _id: true }));
      const currentSet = new Set((current || []).map((u) => u._id));
      const targetSet = new Set(ids);

      const toAdd = ids.filter((id) => !currentSet.has(id));
      const toRemove = [...currentSet].filter((id) => !targetSet.has(id));

      // 批量并行写（每批 20）
      const chunk = (arr, n) => {
        const out = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };
      for (const batch of chunk(toAdd, 20)) {
        await Promise.all(
          batch.map((id) =>
            db.collection(USERS).doc(id).update({ data: { classIds: _.addToSet(classId) } }).catch(() => null)
          )
        );
      }
      for (const batch of chunk(toRemove, 20)) {
        await Promise.all(
          batch.map((id) =>
            db.collection(USERS).doc(id).update({ data: { classIds: _.pull(classId) } }).catch(() => null)
          )
        );
      }

      await logAudit(
        auth,
        'classes.setStudents',
        `设置班级「${exist.name}」成员：新增 ${toAdd.length} 人，移除 ${toRemove.length} 人，现有 ${ids.length} 人`
      );
      return { success: true, message: '成员已更新', added: toAdd.length, removed: toRemove.length, total: ids.length };
    }

    return { success: false, error: `未知 action: ${action}` };
  } catch (e) {
    console.error('[manageClasses] 执行失败', e);
    return { success: false, error: e.message || '服务异常' };
  }
};
