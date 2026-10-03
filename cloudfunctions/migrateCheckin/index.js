/**
 * 云函数：migrateCheckin —— 旧 checkins 集合迁移到 checkin_records
 *
 * 旧 checkins 结构（推断）：{ _openid, date, types:[string], content, createdAt }
 * 新 checkin_records 结构：
 *   {_openid, userId, nickName, date, taskId, totalItems,
 *    items:[{id,subject,done,doneAt,actualMinutes}],
 *    completedCount, checked, allDone, sharedAt, posterSavedAt, createdAt, updatedAt}
 *
 * 迁移策略：
 *   1. 按 openid+date 聚合旧记录（同一天可能有多条）
 *   2. 旧 types 数组中的每个科目映射为一个 done=true 的 item
 *   3. taskId 设为 null（旧数据无对应 daily_tasks），totalItems = items.length
 *   4. dryRun=true 只预览不执行
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function verifyAdmin() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return false;
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  return !!(res.data && res.data[0] && res.data[0].isAdmin === true);
}

const SUBJECT_LABEL = {
  listening: '听力', reading: '阅读', writing: '写作', speaking: '口语',
};

exports.main = async (event) => {
  const { dryRun = true } = event || {};

  try {
    const isAdmin = await verifyAdmin();
    if (!isAdmin) {
      return { success: false, error: '无权操作，仅管理员可迁移' };
    }

    // 分页拉取旧 checkins
    const PAGE = 100;
    let allOld = [];
    for (let i = 0; i < 100; i++) {
      const res = await db.collection('checkins').skip(i * PAGE).limit(PAGE).get();
      const page = res.data || [];
      allOld = allOld.concat(page);
      if (page.length < PAGE) break;
    }

    // 按 openid+date 聚合
    const groups = {};
    allOld.forEach((c) => {
      const key = `${c._openid || ''}_${c.date || ''}`;
      if (!groups[key]) groups[key] = { openid: c._openid, date: c.date, types: new Set() };
      (c.types || []).forEach((t) => groups[key].types.add(t));
    });

    const migrations = [];
    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const key in groups) {
      const g = groups[key];
      if (!g.openid || !g.date) { skipped++; continue; }

      const types = [...g.types];
      const items = types.map((t, i) => ({
        id: `migrated_${t}_${i}`,
        subject: t,
        done: true,
        doneAt: null,
        actualMinutes: 0,
      }));

      const completedCount = items.length;
      const totalItems = items.length;
      const allDone = completedCount === totalItems && totalItems > 0;

      migrations.push({
        openid: g.openid,
        date: g.date,
        items,
        completedCount,
        totalItems,
        allDone,
      });

      if (!dryRun) {
        try {
          // 检查是否已存在（避免重复迁移）
          const existing = await db.collection('checkin_records')
            .where({ _openid: g.openid, date: g.date })
            .limit(1).get();
          if (existing.data && existing.data.length > 0) {
            skipped++;
            continue;
          }
          await db.collection('checkin_records').add({
            data: {
              _openid: g.openid,
              userId: '',
              nickName: '',
              date: g.date,
              taskId: null,
              totalItems,
              items,
              completedCount,
              checked: true,
              allDone,
              sharedAt: null,
              posterSavedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          created++;
        } catch (e) {
          errors.push({ openid: g.openid, date: g.date, error: e.message });
        }
      }
    }

    return {
      success: true,
      dryRun,
      totalOld: allOld.length,
      totalGroups: Object.keys(groups).length,
      toMigrate: migrations.length,
      created,
      skipped,
      errors: errors.slice(0, 10),
      sample: migrations.slice(0, 5),
      message: dryRun
        ? `预览：旧记录 ${allOld.length} 条，聚合为 ${migrations.length} 组待迁移`
        : `迁移完成：新建 ${created} 条，跳过 ${skipped} 条，失败 ${errors.length} 条`,
    };
  } catch (e) {
    console.error('[migrateCheckin] 失败', e);
    return { success: false, error: e.message };
  }
};
