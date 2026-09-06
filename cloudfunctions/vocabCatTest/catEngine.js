/**
 * CAT 自适应测试引擎（纯算法模块，无外部依赖）
 *
 * 实现《词汇量水平测试服务 — 技术实现方案》核心算法：
 * - IRT 3PL 模型与费舍尔信息量
 * - EAP 能力估计（先验 N(0,1)）
 * - 最大信息量选题 + Top-K 随机 + 词频段内容平衡
 * - 终止条件与词汇量对数映射
 */

// ==================== 配置 ====================
const CAT_CONFIG = {
  MAX_ITEMS: 40,            // 题数上限
  MIN_ITEMS: 15,            // 提前终止的最少题数
  SE_THRESHOLD: 0.3,        // 精度阈值：SE(θ) < 0.3
  CONVERGE_WINDOW: 5,       // 收敛判定窗口：连续 5 题
  CONVERGE_DELTA: 0.05,     // 收敛 Δθ 阈值
  TOP_K: 5,                 // 信息量 Top-K 随机选题
  THETA_CAND_WINDOW: 1.5,   // 候选题 |b-θ| 窗口
  TIME_LIMIT_MS: 15000,     // 单题限时（超时计为答错）
  SUSPICIOUS_MS: 2000,      // 低于此作答时间标记可疑
  DEDUP_DAYS: 30,           // 跨会话去重窗口
  // 词汇量对数映射参数：θ=0 → 8000 词，θ=2 → 20000 词
  VOCAB_ALPHA: 0.199,
  VOCAB_BETA: 3.903,
};

// EAP 数值积分网格：θ ∈ [-4, 4]，步长 0.1
const THETA_GRID = [];
for (let t = -4; t <= 4.0001; t += 0.1) {
  THETA_GRID.push(Math.round(t * 10) / 10);
}

// ==================== IRT 3PL ====================
/** 3PL 正确作答概率：P(θ) = c + (1-c)/(1+exp(-a(θ-b))) */
function prob3PL(theta, item) {
  const { a, b, c } = item;
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/** 题目 i 在能力 θ 处的费舍尔信息量：I = a²·P(1-P)/(1-c)² */
function fisherInfo(theta, item) {
  const p = prob3PL(theta, item);
  const { a, c } = item;
  return (a * a * p * (1 - p)) / ((1 - c) * (1 - c));
}

// ==================== EAP 能力估计 ====================
/**
 * 基于全部作答记录的 EAP 估计（先验 N(0,1)）
 * @param {Array<{a,b,c,isCorrect}>} responses
 * @returns {{theta: number, se: number}}
 */
function eapEstimate(responses) {
  let weights = THETA_GRID.map((t) => Math.exp(-0.5 * t * t));

  for (const resp of responses) {
    for (let j = 0; j < THETA_GRID.length; j++) {
      const p = prob3PL(THETA_GRID[j], resp);
      weights[j] *= resp.isCorrect ? p : 1 - p;
    }
  }

  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return { theta: 0, se: 99 };

  let mean = 0;
  for (let j = 0; j < THETA_GRID.length; j++) {
    weights[j] /= total;
    mean += weights[j] * THETA_GRID[j];
  }

  let variance = 0;
  for (let j = 0; j < THETA_GRID.length; j++) {
    variance += weights[j] * Math.pow(THETA_GRID[j] - mean, 2);
  }

  return {
    theta: Math.round(mean * 1000) / 1000,
    se: Math.round(Math.sqrt(variance) * 1000) / 1000,
  };
}

// ==================== 选题 ====================
/**
 * 按 词频段覆盖度 + 最大费舍尔信息量 选题
 * @param {number} theta 当前能力估计
 * @param {Set<number>} answeredQids 本次会话已答题 ID
 * @param {Map<string, number>} bandCount 本次会话各词频段已出题数
 * @param {Set<number>} recentQids 跨会话去重题 ID（30 天内）
 * @param {Array} questionBank 完整题库
 */
function selectNextQuestion(theta, answeredQids, bandCount, recentQids, questionBank) {
  // 候选池：本次未答 + 跨会话去重
  let candidates = questionBank.filter(
    (q) => q.isActive && !answeredQids.has(q.id) && !recentQids.has(q.id)
  );
  // 去重后为空则放宽跨会话去重（避免无题可选）
  if (candidates.length === 0) {
    candidates = questionBank.filter((q) => q.isActive && !answeredQids.has(q.id));
  }
  if (candidates.length === 0) return null;

  // 能力窗口筛选：|b - θ| < 1.5
  let pool = candidates.filter((q) => Math.abs(q.b - theta) < CAT_CONFIG.THETA_CAND_WINDOW);
  if (pool.length === 0) pool = candidates;

  // 内容平衡：优先从出题最少的词频段中选
  let minCount = Infinity;
  for (const q of pool) {
    const cnt = bandCount.get(q.band) || 0;
    if (cnt < minCount) minCount = cnt;
  }
  const balanced = pool.filter((q) => (bandCount.get(q.band) || 0) === minCount);
  const finalPool = balanced.length >= 3 ? balanced : pool;

  // 信息量 Top-K 随机选一（防固定暴露）
  const scored = finalPool
    .map((q) => ({ q, info: fisherInfo(theta, q) }))
    .sort((x, y) => y.info - x.info);
  const topK = scored.slice(0, Math.min(CAT_CONFIG.TOP_K, scored.length));
  return topK[Math.floor(Math.random() * topK.length)].q;
}

// ==================== 终止条件 ====================
/**
 * @param {number} itemsAnswered 已答题数
 * @param {number} se 当前测量标准误
 * @param {number[]} thetaHistory 能力估计历史（含初始值）
 */
function shouldTerminate(itemsAnswered, se, thetaHistory) {
  // 精度达标：SE < 0.3
  if (itemsAnswered >= CAT_CONFIG.MIN_ITEMS && se < CAT_CONFIG.SE_THRESHOLD) return true;
  // 题数上限
  if (itemsAnswered >= CAT_CONFIG.MAX_ITEMS) return true;
  // 收敛判定：连续 5 题 Δθ < 0.05
  if (itemsAnswered >= CAT_CONFIG.MIN_ITEMS && thetaHistory.length >= CAT_CONFIG.CONVERGE_WINDOW + 1) {
    const recent = thetaHistory.slice(-CAT_CONFIG.CONVERGE_WINDOW - 1);
    let converged = true;
    for (let i = 1; i < recent.length; i++) {
      if (Math.abs(recent[i] - recent[i - 1]) >= CAT_CONFIG.CONVERGE_DELTA) {
        converged = false;
        break;
      }
    }
    if (converged) return true;
  }
  return false;
}

// ==================== 结果映射 ====================
/** 能力 θ → 词汇量估值（对数映射 V = 10^(αθ+β)，取整到百位） */
function thetaToVocab(theta) {
  const v = Math.pow(10, CAT_CONFIG.VOCAB_ALPHA * theta + CAT_CONFIG.VOCAB_BETA);
  return Math.round(v / 100) * 100;
}

/** 词汇量 → CEFR 等级 */
function vocabToCefr(vocab) {
  if (vocab >= 13000) return 'C2';
  if (vocab >= 8000) return 'C1';
  if (vocab >= 5500) return 'B2';
  if (vocab >= 3500) return 'B1';
  if (vocab >= 1500) return 'A2';
  return 'A1';
}

/** 分词频段正确率统计（band 顺序按 BAND_ORDER） */
function breakdownByBand(responses, bandOrder, bandDesc) {
  const bands = {};
  for (const band of bandOrder) {
    bands[band] = { total: 0, correct: 0 };
  }
  for (const r of responses) {
    if (!bands[r.band]) continue;
    bands[r.band].total += 1;
    if (r.isCorrect) bands[r.band].correct += 1;
  }
  return bandOrder
    .map((band) => ({
      band,
      desc: bandDesc[band],
      total: bands[band].total,
      correct: bands[band].correct,
      rate: bands[band].total > 0 ? Math.round((bands[band].correct / bands[band].total) * 100) : 0,
    }))
    .filter((b) => b.total > 0);
}

/** Fisher-Yates 洗牌 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 选项打乱并返回 {options, correctIndex} */
function shuffleOptions(question) {
  const texts = shuffle(question.options.map((o) => o.text));
  return {
    options: texts,
    correctIndex: texts.indexOf(question.correctText),
  };
}

module.exports = {
  CAT_CONFIG,
  THETA_GRID,
  prob3PL,
  fisherInfo,
  eapEstimate,
  selectNextQuestion,
  shouldTerminate,
  thetaToVocab,
  vocabToCefr,
  breakdownByBand,
  shuffleOptions,
};
