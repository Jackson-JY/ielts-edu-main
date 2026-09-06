/**
 * CAT 引擎本地仿真验证（不依赖云环境）
 * 模拟不同真实能力水平的虚拟学习者，验证：
 * 1. 测试在题数上限内收敛并终止
 * 2. SE 达标率
 * 3. 词汇量估值与真实水平的一致性
 */
const { QUESTIONS } = require('./questionBank');
const engine = require('./catEngine');

function simulate(trueTheta, rng = Math.random) {
  const answeredQids = new Set();
  const bandCount = new Map();
  const responses = [];
  const thetaHistory = [0];
  let theta = 0;
  let se = 99;

  for (let i = 0; i < engine.CAT_CONFIG.MAX_ITEMS; i++) {
    const q = engine.selectNextQuestion(theta, answeredQids, bandCount, new Set(), QUESTIONS);
    if (!q) return { terminated: 'exhausted', items: responses.length, theta, se };
    // 虚拟学习者按 3PL 真实概率作答（用真实参数作答，c 猜测建模在内）
    const p = engine.prob3PL(trueTheta, q);
    const isCorrect = rng() < p;
    responses.push({ qid: q.id, band: q.band, isCorrect });
    answeredQids.add(q.id);
    bandCount.set(q.band, (bandCount.get(q.band) || 0) + 1);

    const est = engine.eapEstimate(responses.map((r) => {
      const item = QUESTIONS.find((x) => x.id === r.qid);
      return { a: item.a, b: item.b, c: item.c, isCorrect: r.isCorrect };
    }));
    theta = est.theta;
    se = est.se;
    thetaHistory.push(theta);

    if (engine.shouldTerminate(responses.length, se, thetaHistory)) {
      return { terminated: 'converged', items: responses.length, theta, se };
    }
  }
  return { terminated: 'maxItems', items: responses.length, theta, se };
}

const scenarios = [
  { name: '初级 (θ=-2, ~2500词)', theta: -2 },
  { name: '四级 (θ=-0.8, ~4700词)', theta: -0.8 },
  { name: '六级 (θ=0, ~8000词)', theta: 0 },
  { name: '雅思7 (θ=1.2, ~14000词)', theta: 1.2 },
  { name: 'GRE (θ=2.2, ~24000词)', theta: 2.2 },
];

let pass = 0, total = 0;
for (const sc of scenarios) {
  const runs = [];
  for (let i = 0; i < 30; i++) {
    runs.push(simulate(sc.theta));
  }
  const avgItems = runs.reduce((s, r) => s + r.items, 0) / runs.length;
  const avgSe = runs.reduce((s, r) => s + r.se, 0) / runs.length;
  const avgVocab = runs.reduce((s, r) => s + engine.thetaToVocab(r.theta), 0) / runs.length;
  const trueVocab = engine.thetaToVocab(sc.theta);
  const errPct = Math.abs(avgVocab - trueVocab) / trueVocab * 100;
  const maxItems = Math.max(...runs.map((r) => r.items));

  const ok = maxItems <= 40 && errPct < 15;
  if (ok) pass++;
  total++;
  console.log(
    `${ok ? '✓' : '✗'} ${sc.name}: 平均${avgItems.toFixed(1)}题, 平均SE=${avgSe.toFixed(2)}, ` +
    `估值≈${Math.round(avgVocab)}词 (真实${trueVocab}词, 偏差${errPct.toFixed(1)}%), 最大题数=${maxItems}`
  );
}
console.log(`\n通过: ${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
