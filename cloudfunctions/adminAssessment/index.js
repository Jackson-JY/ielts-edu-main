// 云函数：adminAssessment —— 测评报告（管理员）
//   action='list'   全体分布（词汇量分段 / CEFR / 四维均值）+ 有测评记录的学生列表
//   action='detail' 单生测评详情（词汇量 / 自评 / 写作产出 / 口语转写）
// 鉴权：token 优先（Web），openid+isAdmin 兜底（小程序）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const common = require('./_common');
const normalizeEvent = common.normalizeEvent;
const authenticate = (event) => common.authenticate(event, db, cloud);
const fetchAll = common.fetchAll;

const SKILLS = ['listening', 'reading', 'writing', 'speaking'];

/** 四维自评 → CEFR */
function levelToCefr(avg) {
  if (avg >= 4.5) return 'C2';
  if (avg >= 3.5) return 'C1';
  if (avg >= 2.5) return 'B2';
  if (avg >= 1.5) return 'B1';
  if (avg >= 0.8) return 'A2';
  return 'A1';
}

/** 提取单生四维等级 */
function extractLevels(record) {
  const selfAssess = (record && record.selfAssess) || {};
  const levels = {};
  SKILLS.forEach((s) => {
    levels[s] = selfAssess[s] && selfAssess[s].level != null ? selfAssess[s].level : 0;
  });
  return levels;
}

const VOCAB_BUCKETS = [
  [0, 2000],
  [2000, 4000],
  [4000, 6000],
  [6000, 8000],
  [8000, 10000],
  [10000, 15000],
  [15000, Infinity],
];

function bucketOf(v) {
  for (const [lo, hi] of VOCAB_BUCKETS) {
    if (v >= lo && v < hi) {
      return hi === Infinity ? '15000+' : `${lo}-${hi}`;
    }
  }
  return '0-2000';
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

    const { action, studentId } = event || {};

    // ---------- 全体分布 ----------
    if (action === 'list') {
      const [assessments, vocabSessionsAll, users] = await Promise.all([
        fetchAll(() => db.collection('assessment_results').where({ type: 'ability_model' })),
        fetchAll(() => db.collection('vocab_test_sessions')),
        fetchAll(() => db.collection('users')),
      ]);

      const vocabSessions = vocabSessionsAll.filter((v) => v.status === 'completed');

      // openid → 用户映射
      const userMap = {};
      users.forEach((u) => {
        if (u._openid) userMap[u._openid] = u;
      });

      // 收集有测评记录的 openid
      const openidSet = new Set();
      assessments.forEach((a) => a._openid && openidSet.add(a._openid));
      vocabSessions.forEach((v) => v._openid && openidSet.add(v._openid));

      // 学生列表
      const students = Array.from(openidSet).map((oid) => {
        const u = userMap[oid] || {};
        return { _id: u._id || oid, _openid: oid, nickName: u.nickName || '未命名用户', avatarUrl: u.avatarUrl || '' };
      });

      // 词汇量分布（合并两个来源）
      const vocabCounts = {};
      const initBucket = () => {
        const m = {};
        VOCAB_BUCKETS.forEach(([lo, hi]) => {
          m[hi === Infinity ? '15000+' : `${lo}-${hi}`] = 0;
        });
        return m;
      };
      const vocabBucketsMap = initBucket();
      assessments.forEach((a) => {
        const est = a.vocab && a.vocab.estimate;
        if (typeof est === 'number' && est > 0) vocabBucketsMap[bucketOf(est)] += 1;
      });
      vocabSessions.forEach((v) => {
        const est = v.vocabEstimate;
        if (typeof est === 'number' && est > 0) vocabBucketsMap[bucketOf(est)] += 1;
      });
      const vocabBuckets = VOCAB_BUCKETS.map(([lo, hi]) => ({
        label: hi === Infinity ? '15000+' : `${lo}-${hi}`,
        count: vocabBucketsMap[hi === Infinity ? '15000+' : `${lo}-${hi}`],
      }));

      // CEFR 分布 + 四维均值（基于有自评的记录）
      const cefr = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
      const sumLevels = { listening: 0, reading: 0, writing: 0, speaking: 0 };
      let selfAssessCount = 0;
      assessments.forEach((a) => {
        if (!a.selfAssess || !Object.keys(a.selfAssess).length) return;
        const levels = extractLevels(a);
        const avg = (levels.listening + levels.reading + levels.writing + levels.speaking) / 4;
        cefr[levelToCefr(avg)] += 1;
        SKILLS.forEach((s) => (sumLevels[s] += levels[s]));
        selfAssessCount += 1;
      });
      const skillAverages = {};
      SKILLS.forEach((s) => {
        skillAverages[s] = selfAssessCount ? Math.round((sumLevels[s] / selfAssessCount) * 10) / 10 : 0;
      });

      return {
        success: true,
        students,
        distribution: { vocabBuckets, cefr, skillAverages },
      };
    }

    // ---------- 单生详情 ----------
    if (action === 'detail') {
      if (!studentId) return { success: false, error: '缺少 studentId' };

      const userRes = await db.collection('users').doc(studentId).get();
      const user = userRes.data;
      const openid = user && user._openid;
      if (!openid) return { success: false, error: '用户无 openid' };

      const [assessRes, vocabRes, speakRes] = await Promise.all([
        db.collection('assessment_results').where({ _openid: openid, type: 'ability_model' }).orderBy('_createTime', 'desc').limit(1).get(),
        db.collection('vocab_test_sessions').where({ _openid: openid, status: 'completed' }).orderBy('completedAt', 'desc').limit(1).get(),
        db.collection('speaking_answers').where({ _openid: openid }).orderBy('lastUpdateTime', 'desc').limit(1).get(),
      ]);

      const record = assessRes.data && assessRes.data[0];
      const vocabSession = vocabRes.data && vocabRes.data[0];
      const speakingRecord = speakRes.data && speakRes.data[0];

      // 词汇量：优先 assessment_results.vocab，兜底 vocab_test_sessions
      let vocab = record && record.vocab;
      if (!vocab || typeof vocab.estimate !== 'number') {
        vocab = vocabSession
          ? { estimate: vocabSession.vocabEstimate, cefrLevel: vocabSession.cefrLevel, itemsAnswered: vocabSession.itemsAnswered, lowConfidence: vocabSession.lowConfidence }
          : null;
      }

      const detail = {
        vocab: vocab || null,
        selfAssess: (record && record.selfAssess) || null,
        writing: record && record.production && record.production.writing ? record.production.writing : null,
        speaking: speakingRecord ? speakingRecord.answers || [] : [],
        status: (record && record.status) || 'none',
        completeTime: (record && record.completeTime) || null,
      };

      return { success: true, detail };
    }

    return { success: false, error: '未知操作' };
  } catch (e) {
    console.error('[adminAssessment] 失败', e);
    return { success: false, error: e.message };
  }
};
