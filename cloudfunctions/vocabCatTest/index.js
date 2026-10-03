/**
 * 词汇量 CAT 自适应测评云函数
 *
 * 基于《词汇量水平测试服务 — 技术实现方案》实现，做小程序云开发适配：
 * - 架构映射：方案中的「自适应测试引擎 + 评分服务」 → 本云函数；
 *   「题库数据库 + Redis」 → 内置种子题库 + vocab_test_sessions 会话集合
 * - 引擎无状态：每次请求从会话记录读取 θ̂ 和已答列表，计算后写回
 * - 答案不下发前端：正确选项仅存于会话记录，反作弊服务端计时
 * - 题库与算法细节见 questionBank.js / catEngine.js
 *
 * Actions:
 *   start  - 开始/恢复测试，返回第一题
 *   answer - 提交作答并获取下一题（判定→更新θ→判断终止→选题）
 *   result - 获取已完成测试的完整结果
 */

const cloud = require('wx-server-sdk');
const { QUESTIONS, BAND_ORDER, BAND_DESC } = require('./questionBank');
const engine = require('./catEngine');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CAT_CONFIG = engine.CAT_CONFIG;
const SESSION_COLLECTION = 'vocab_test_sessions';

// ==================== 数据访问 ====================
async function getSessionById(sessionId, openid) {
  try {
    const res = await db.collection(SESSION_COLLECTION).doc(sessionId).get();
    if (!res.data || res.data._openid !== openid) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}

/** 30 天内该用户已答过的题目 ID（跨会话去重） */
async function getRecentAnsweredQids(openid) {
  const since = new Date(Date.now() - CAT_CONFIG.DEDUP_DAYS * 24 * 3600 * 1000);
  const qids = new Set();
  try {
    const res = await db
      .collection(SESSION_COLLECTION)
      .where({ _openid: openid, createdAt: db.command.gte(since) })
      .limit(50)
      .get();
    for (const doc of res.data) {
      for (const r of doc.responses || []) {
        qids.add(r.qid);
      }
    }
  } catch (e) {
    // 查询失败不影响主流程
  }
  return qids;
}

/** 会话内的选题上下文：已答题集合 + 词频段计数 */
function buildSessionContext(responses) {
  const answeredQids = new Set(responses.map((r) => r.qid));
  const bandCount = new Map();
  for (const r of responses) {
    bandCount.set(r.band, (bandCount.get(r.band) || 0) + 1);
  }
  return { answeredQids, bandCount };
}

/** 生成下一题 payload（隐藏答案） */
function buildQuestionPayload(question, shuffled) {
  return {
    qid: question.id,
    word: question.word,
    band: question.band,
    type: question.type,
    options: shuffled.options,
  };
}

/** 组装并落库最终结果 */
function buildFinalResult(responses, theta, se) {
  const vocabEstimate = engine.thetaToVocab(theta);
  const cefrLevel = engine.vocabToCefr(vocabEstimate);
  const breakdown = engine.breakdownByBand(responses, BAND_ORDER, BAND_DESC);
  const hasSuspicious = responses.some((r) => r.suspicious);
  return {
    itemsAnswered: responses.length,
    finalTheta: theta,
    finalSe: se,
    vocabEstimate,
    cefrLevel,
    breakdown,
    lowConfidence: se >= CAT_CONFIG.SE_THRESHOLD || hasSuspicious,
    completedAt: new Date(),
  };
}

// ==================== Action: start ====================
async function handleStart(openid, event) {
  const mode = event.mode === 'full' ? 'full' : 'single';

  // 尝试恢复进行中的会话（同一时间仅保留一个 active 会话）
  try {
    const active = await db
      .collection(SESSION_COLLECTION)
      .where({ _openid: openid, status: 'active' })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (active.data.length > 0) {
      const sess = active.data[0];
      // 恢复会话必须重置出题时间：否则恢复后第一答的 rtMs 会远超限时，
      // 被服务端反作弊逻辑判定为超时（计错）
      if (sess.lastQid != null) {
        await db
          .collection(SESSION_COLLECTION)
          .doc(sess._id)
          .update({ data: { lastQuestionAt: new Date() } });
      }
      const nextQuestion = sess.lastShuffledOptions
        ? { qid: sess.lastQid, word: sess.lastWord, band: sess.lastBand, options: sess.lastShuffledOptions }
        : null;
      return {
        success: true,
        sessionId: sess._id,
        resumed: true,
        itemsAnswered: sess.itemsAnswered || 0,
        nextQuestion,
      };
    }
  } catch (e) {
    // 查询失败则走新建流程
  }

  // 新建会话：初始能力 θ₀ = 0
  const recentQids = await getRecentAnsweredQids(openid);
  const { answeredQids, bandCount } = buildSessionContext([]);
  const question = engine.selectNextQuestion(0, answeredQids, bandCount, recentQids, QUESTIONS);
  if (!question) {
    return { success: false, error: '题库为空，无法开始测试' };
  }

  const shuffled = engine.shuffleOptions(question);
  const now = new Date();
  const addRes = await db.collection(SESSION_COLLECTION).add({
    data: {
      _openid: openid,
      status: 'active',
      mode,
      responses: [],
      thetaHistory: [0],
      itemsAnswered: 0,
      currentTheta: 0,
      currentSe: 99,
      lastQid: question.id,
      lastWord: question.word,
      lastBand: question.band,
      lastCorrectIndex: shuffled.correctIndex,
      lastShuffledOptions: shuffled.options,
      lastQuestionAt: now,
      createdAt: now,
    },
  });

  return {
    success: true,
    sessionId: addRes._id,
    resumed: false,
    itemsAnswered: 0,
    nextQuestion: buildQuestionPayload(question, shuffled),
  };
}

// ==================== Action: answer ====================
async function handleAnswer(openid, event) {
  const { sessionId, qid, selectedOption } = event;
  if (!sessionId || typeof qid !== 'number') {
    return { success: false, error: '参数不完整' };
  }

  const sess = await getSessionById(sessionId, openid);
  if (!sess) return { success: false, error: '会话不存在' };
  if (sess.status !== 'active') return { success: false, error: '测试已结束' };
  if (sess.lastQid !== qid) return { success: false, error: '题目状态不同步，请重新开始' };

  // 服务端计时反作弊：超时计错、过快标记可疑
  const rtMs = Date.now() - new Date(sess.lastQuestionAt).getTime();
  const timeout = rtMs > CAT_CONFIG.TIME_LIMIT_MS;
  const isCorrect =
    !timeout && Number.isInteger(selectedOption) && selectedOption === sess.lastCorrectIndex;
  const suspicious = rtMs < CAT_CONFIG.SUSPICIOUS_MS;

  const question = QUESTIONS.find((q) => q.id === qid);
  if (!question) return { success: false, error: '题目不存在' };

  // 追加作答记录
  const responses = (sess.responses || []).concat([
    {
      qid,
      word: question.word,
      band: question.band,
      isCorrect,
      rtMs,
      timeout: !!timeout,
      suspicious: !!suspicious,
      selectedOption: Number.isInteger(selectedOption) ? selectedOption : -1,
      answeredAt: new Date(),
    },
  ]);

  // 基于全量作答重新计算 EAP（引擎无状态）
  const irtResponses = responses.map((r) => {
    const q = QUESTIONS.find((x) => x.id === r.qid) || {};
    return { a: q.a || 1, b: q.b || 0, c: q.c || 0.25, isCorrect: r.isCorrect };
  });
  const { theta, se } = engine.eapEstimate(irtResponses);

  const thetaHistory = (sess.thetaHistory || []).concat([theta]);
  const itemsAnswered = responses.length;
  const terminate = engine.shouldTerminate(itemsAnswered, se, thetaHistory);

  const updateData = {
    responses,
    thetaHistory,
    itemsAnswered,
    currentTheta: theta,
    currentSe: se,
    lastUpdateTime: new Date(),
  };

  // correctIndex 用于前端作答后的对错反馈高亮（作答后才下发）
  const result = {
    isCorrect,
    correctIndex: sess.lastCorrectIndex,
    itemsAnswered,
    currentTheta: theta,
    currentSe: se,
  };

  if (terminate) {
    const finalResult = buildFinalResult(responses, theta, se);
    Object.assign(updateData, {
      status: 'completed',
      ...finalResult,
      // 清理临时状态字段
      lastQid: null,
      lastWord: null,
      lastBand: null,
      lastCorrectIndex: null,
      lastShuffledOptions: null,
      lastQuestionAt: null,
    });
    Object.assign(result, { shouldContinue: false, result: finalResult });
  } else {
    // 选题并返回下一题
    const { answeredQids, bandCount } = buildSessionContext(responses);
    const recentQids = await getRecentAnsweredQids(openid);
    const nextQuestion = engine.selectNextQuestion(
      theta, answeredQids, bandCount, recentQids, QUESTIONS
    );

    if (!nextQuestion) {
      // 题库耗尽兜底：直接结束
      const finalResult = buildFinalResult(responses, theta, se);
      Object.assign(updateData, { status: 'completed', ...finalResult });
      Object.assign(result, { shouldContinue: false, result: finalResult });
    } else {
      const shuffled = engine.shuffleOptions(nextQuestion);
      Object.assign(updateData, {
        lastQid: nextQuestion.id,
        lastWord: nextQuestion.word,
        lastBand: nextQuestion.band,
        lastCorrectIndex: shuffled.correctIndex,
        lastShuffledOptions: shuffled.options,
        lastQuestionAt: new Date(),
      });
      Object.assign(result, {
        shouldContinue: true,
        nextQuestion: buildQuestionPayload(nextQuestion, shuffled),
      });
    }
  }

  await db.collection(SESSION_COLLECTION).doc(sessionId).update({ data: updateData });
  return { success: true, ...result };
}

// ==================== Action: result ====================
async function handleResult(openid, event) {
  const cond = { _openid: openid, status: 'completed' };
  const res = await db
    .collection(SESSION_COLLECTION)
    .where(cond)
    .orderBy('completedAt', 'desc')
    .limit(1)
    .get();

  if (res.data.length === 0) {
    return { success: false, error: '暂无已完成的测评记录' };
  }
  const doc = res.data[0];
  if (event.sessionId && event.sessionId !== doc._id) {
    return { success: false, error: '指定会话结果不存在' };
  }
  return {
    success: true,
    result: {
      sessionId: doc._id,
      itemsAnswered: doc.itemsAnswered,
      finalTheta: doc.finalTheta,
      finalSe: doc.finalSe,
      vocabEstimate: doc.vocabEstimate,
      cefrLevel: doc.cefrLevel,
      breakdown: doc.breakdown,
      lowConfidence: !!doc.lowConfidence,
      completedAt: doc.completedAt,
    },
  };
}

// ==================== 入口 ====================
/** 测评授权校验（服务端硬卡点）：未授权/吊销/过期/无余量 → 拒绝开始 */
async function checkAssessmentGrant(openid) {
  try {
    const res = await db.collection('assessment_grants').where({ _openid: openid }).limit(1).get();
    const grant = res.data && res.data[0];
    if (!grant) return { authorized: false, reason: 'NO_GRANT' };
    if (grant.status === 'revoked') return { authorized: false, reason: 'REVOKED' };
    if (grant.expireAt && new Date(grant.expireAt) < new Date()) return { authorized: false, reason: 'EXPIRED' };
    const remaining = (Number(grant.totalQuota) || 0) - (Number(grant.usedCount) || 0);
    if (remaining <= 0) return { authorized: false, reason: 'NO_QUOTA' };
    return { authorized: true };
  } catch (e) {
    // 授权集合不可用时按未授权处理（fail-closed）
    console.error('[vocabCatTest] 授权校验失败', e);
    return { authorized: false, reason: 'CHECK_FAILED' };
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  try {
    switch (action) {
      case 'start': {
        const grant = await checkAssessmentGrant(OPENID);
        if (!grant.authorized) {
          return {
            success: false,
            error: 'GRANT_REQUIRED',
            reason: grant.reason,
            message: '测评功能需老师授权后使用，请联系管理员开通',
          };
        }
        return await handleStart(OPENID, event);
      }
      case 'answer':
        return await handleAnswer(OPENID, event);
      case 'result':
        return await handleResult(OPENID, event);
      default:
        return { success: false, error: `未知 action: ${action}` };
    }
  } catch (e) {
    console.error('[vocabCatTest] 执行失败:', action, e);
    return { success: false, error: e.message || '服务异常' };
  }
};
