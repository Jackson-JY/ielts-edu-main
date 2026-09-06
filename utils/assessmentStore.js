/**
 * 测评结果存储工具
 * 各测评模块完成后，把该模块数据合并写入 assessment_results 集合的同一条记录：
 * - 完整测评：四个模块按顺序共享一条 in_progress 记录，写作完成时标记 completed
 * - 单项测评：复用 30 天内未完成的记录，没有则新建
 *
 * 记录结构（type: 'ability_model'）：
 * {
 *   vocab:      { estimate, cefrLevel, lowConfidence, itemsAnswered },  // 词汇测试（阅读页写入）
 *   selfAssess: { listening: { ratings, level }, reading: {...}, writing: {...}, speaking: {...} },
 *   production: { writing: {...}, speaking: {...} },
 *   status: 'in_progress' | 'completed',
 * }
 */
const cloudDB = require('./cloudDB');

const COLLECTION = 'assessment_results';
// 未完成记录的复用窗口：30 天
const ACTIVE_WINDOW_MS = 30 * 24 * 3600 * 1000;

/** 计算 12 条自评的平均等级（保留 1 位小数） */
function calcLevel(ratings) {
  if (!ratings || !ratings.length) return 0;
  const sum = ratings.reduce((s, r) => s + (Number(r) || 0), 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

/** 获取当前进行中的测评记录（30 天内未完成的最新一条），没有则返回 null */
async function getActiveRecord() {
  try {
    const res = await cloudDB.getMy(COLLECTION, (q) =>
      q.orderBy('_createTime', 'desc').limit(5)
    );
    if (!res.success || !res.data.length) return null;

    const now = Date.now();
    for (const doc of res.data) {
      if (doc.type !== 'ability_model' || doc.status === 'completed') continue;
      const t = doc._createTime ? new Date(doc._createTime).getTime() : 0;
      if (now - t < ACTIVE_WINDOW_MS) return doc;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 合并写入模块数据。
 * @param {Object} fields 顶层字段，object 类型的字段做二级浅合并，例如：
 *   { selfAssess: { listening: { ratings, level } } }
 *   { vocab: { estimate: 8000, cefrLevel: 'B2' } }
 * @returns {Promise<boolean>} 是否成功
 */
async function saveSection(fields) {
  try {
    const record = await getActiveRecord();
    const patch = {};
    Object.keys(fields).forEach((key) => {
      const val = fields[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        patch[key] = { ...(record && record[key] ? record[key] : {}), ...val };
      } else {
        patch[key] = val;
      }
    });

    if (record) {
      const res = await cloudDB.update(COLLECTION, record._id, patch);
      return res.success;
    }
    const res = await cloudDB.addMy(COLLECTION, {
      type: 'ability_model',
      status: 'in_progress',
      ...patch,
    });
    return res.success;
  } catch (e) {
    return false;
  }
}

/** 保存某项自评结果（ratings 为 12 条 0-5 分数组） */
async function saveSelfAssess(skill, ratings) {
  return saveSection({
    selfAssess: { [skill]: { ratings, level: calcLevel(ratings) } },
  });
}

/** 标记整份测评完成（完整测评最后一个模块调用） */
async function finalize() {
  const record = await getActiveRecord();
  if (!record) return true;
  const res = await cloudDB.update(COLLECTION, record._id, {
    status: 'completed',
    completeTime: new Date(),
  });
  return res.success;
}

/** 获取最新一条测评结果（含已完成，仅限本次能力模型测评的记录） */
async function getLatestResult() {
  const res = await cloudDB.getMy(COLLECTION, (q) =>
    q.where({ type: 'ability_model' }).orderBy('_createTime', 'desc').limit(1)
  );
  if (res.success && res.data.length) return res.data[0];
  return null;
}

/** 获取最新词汇测试结果（vocab_test_sessions 集合）
 *  注意：该集合由云函数写入，只有 createdAt/completedAt，没有 _createTime，
 *  必须按 completedAt 排序（status=completed 的会话才有该字段）
 */
async function getLatestVocabResult() {
  const res = await cloudDB.getMy('vocab_test_sessions', (q) =>
    q.where({ status: 'completed' }).orderBy('completedAt', 'desc').limit(5)
  );
  if (!res.success) return null;
  for (const doc of res.data) {
    if (doc.status === 'completed' && typeof doc.vocabEstimate === 'number') {
      return {
        vocabEstimate: doc.vocabEstimate,
        cefrLevel: doc.cefrLevel,
        itemsAnswered: doc.itemsAnswered,
        lowConfidence: !!doc.lowConfidence,
      };
    }
  }
  return null;
}

module.exports = {
  calcLevel,
  getActiveRecord,
  saveSection,
  saveSelfAssess,
  finalize,
  getLatestResult,
  getLatestVocabResult,
};
