// 云函数：aiGenerateReport —— AI 智能测评报告
// 入参：{ studentId }
// 鉴权：token（Web）或 openid+isAdmin（小程序）
// 返回：
//   part1: 能力图谱表格（科目 / 分数 / 平均问题指数 / 主要问题）+ 词汇量
//   part2: 大模型生成的结构化分析报告
const cloud = require('wx-server-sdk');

// AI 生成可能耗时较长，设置 60 秒超时
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 60000 });
const db = cloud.database();

// ============ 48 项能力模型自评题目（与小程序 assessmentData.js 保持一致） ============
const ASSESSMENT_ITEMS = {
  listening: [
    '听力播放时，我经常需要停下来想一下刚才听到的那个词是什么意思。',
    '我觉得外国人说话太快了，很多小词（如 of, to, and）根本听不见。',
    '即使听到了答案句，但如果里面的词和题目写得不一样，我就不太敢选。',
    '我听听力时很难抓住关键信号词，经常等他说完了才发现答案已经过了。',
    '遇到长句子时，我听懂了后半句就忘了前半句的主语是什么。',
    '预览题目时，我完全看不出空格里应该填名词还是动词。',
    '听到电话号码或邮箱地址时，我需要想一下才能写下来，有时会写错。',
    '多人对话中，我经常搞不清楚这句话是男的说的还是女的说的。',
    '我经常听不出来 can 和 can\'t 的区别，导致理解相反。',
    '当说话者自己纠正前面的话时（比如 I mean...），我会很混乱，不知道该记哪个。',
    '听写填空题时，我常因为思考某个单词的拼写而错过接下来的内容。',
    '听力语速稍微快一点（比如 Section 4），我就完全跟不上节奏了。',
  ],
  reading: [
    '雅思阅读文章里有很多我不认识的学术词汇，阻碍了我理解大意。',
    '即使找到了原文对应的句子，我也看不出它和题目的表述是同义替换。',
    '遇到包含多个从句的长句时，我需要反复读好几遍才能明白意思。',
    '读完一个段落后，我很难用一句话概括出这个段落的中心大意。',
    '我在文章中寻找定位词（人名、数字、术语）的速度非常慢。',
    '我是一个词一个词地在心里默读，没法像看中文一样扫视着看英文。',
    '我分不清 False 和 Not Given 之间到底有什么区别。',
    '我很难从文章中判断出作者本人对这件事是支持还是反对。',
    '文中出现的 it、this、these，我经常搞不清楚它们具体指代什么。',
    '我经常搞混文章中的因果关系，把原因当成结果。',
    '我觉得 some、many、most 这些词在意思上没太大区别。',
    '做不同题型时（如 Heading 题和判断题），我的阅读速度没有任何变化。',
  ],
  writing: [
    '我写句子时经常犯语法错误（如单复数、时态、冠词），并且自己发现不了。',
    '我写的句子结构都很简单，不会写复杂的长句。',
    '我区分不清口语词和书面词，经常在作文中使用过于口语化的词汇。',
    '我不确定动词后面该跟什么介词（如 depend on / to / with）。',
    '我完全搞不懂什么时候用 the，什么时候用 a，介词也经常乱用。',
    '我经常在写了一半或写完后，才发现自己理解错了题目的要求。',
    '看到一个作文题目后，我很难快速想出 2-3 个支持或反对的理由。',
    '我只能写出观点句，但没办法把观点展开成具体的解释或举例。',
    '我不知道如何在作文中处理与自己相反的观点。',
    '我写的段落句子之间连接不顺畅，感觉东一句西一句。',
    '写小作文时，我不知道该选择哪些数据来写，常常把全部数据罗列一遍。',
    '我不清楚静态图（对比）和动态图（趋势）在写法上有什么不同。',
  ],
  speaking: [
    '考官有时会露出困惑的表情，好像没听懂我说的某个单词。',
    '我读英语/说英语时像机器人，没有起伏和节奏，缺少"洋腔洋调"。',
    '我说英语时经常卡壳，需要停顿很久去想下一句说什么。',
    '讲述过去发生的事情时，我经常说着说着就变成了现在时态。',
    '在说话时，我经常来不及思考主语是单数还是复数，导致动词用错。',
    '我想在口语中使用复杂句，但一说出来就语法错误百出。',
    '我说英语时，即使说错了也意识不到，或者意识到了但改不过来。',
    '口语 Part 2 需要单独说 2 分钟，我说不到 1 分钟就没话了。',
    '我说观点时，很难立刻想到一个具体的例子来支撑它。',
    '我在口语中不怎么会用连接词（如 moreover, in contrast），翻来覆去只会用 and。',
    '遇到抽象话题（如幸福、成功、文化）时，我完全不知道从何说起。',
    '讨论问题时，我只能想到一个方面，没办法从正反两个角度去对比分析。',
  ],
};

const SKILL_NAMES = { listening: '听力', reading: '阅读', writing: '写作', speaking: '口语' };
const SKILL_KEYS = ['listening', 'reading', 'writing', 'speaking'];

// AI 模型配置（按优先级尝试，前一个失败则自动降级）
// 需在云开发控制台「AI → 生文模型」中开启对应模型
const AI_MODELS = ['hy3', 'deepseek-v4-flash', 'deepseek-v3.2'];

// ============ 事件归一化 ============
function normalizeEvent(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (e) { return {}; }
  }
  if (event.body && typeof event.body === 'object') return event.body;
  return event;
}

// ============ 鉴权 ============
async function authenticate(event) {
  const token = event && event._token;
  if (token) {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];
    if (session && session.expireAt && new Date(session.expireAt) > new Date()) return { ok: true };
    return { ok: false, authError: true };
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (openid) {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
    const user = res.data && res.data[0];
    if (user && user.isAdmin === true) return { ok: true };
    return { ok: false };
  }
  return { ok: false, authError: true };
}

// ============ 四维等级 → CEFR ============
function levelToCefr(avg) {
  if (avg >= 4.5) return 'C2';
  if (avg >= 3.5) return 'C1';
  if (avg >= 2.5) return 'B2';
  if (avg >= 1.5) return 'B1';
  if (avg >= 0.8) return 'A2';
  return 'A1';
}

/**
 * 计算单科能力图谱数据
 * @param {Array} ratings 12 条 0-5 自评分数（分数越高 = 该问题越严重）
 * @returns {{ score:number, problemIndex:number, mainProblems:string[] }}
 */
function buildSkillProfile(ratings) {
  if (!Array.isArray(ratings) || !ratings.length) {
    return { score: 0, problemIndex: 0, mainProblems: [] };
  }
  const score = Math.round((ratings.reduce((s, r) => s + (Number(r) || 0), 0) / ratings.length) * 10) / 10;
  // 问题指数：0-100，越高问题越多
  const problemIndex = Math.round((score / 5) * 100);

  // 主要问题：取评分最高的 3 条（评分 >= 3 才纳入，至少取 1 条）
  const indexed = ratings.map((r, i) => ({ r: Number(r) || 0, i }));
  indexed.sort((a, b) => b.r - a.r);
  const top = indexed.filter((x) => x.r >= 3).slice(0, 3);
  const picks = top.length ? top : indexed.slice(0, 1);
  const mainProblems = picks.map((x) => ASSESSMENT_ITEMS.currentItems[x.i] || '');

  return { score, problemIndex, mainProblems: mainProblems.filter(Boolean) };
}

/**
 * 从 AI 返回文本中提取 JSON
 * 兼容模型输出 ```json ... ``` 或直接返回 JSON 对象
 */
function extractJSON(text) {
  if (!text) return null;
  // 去掉 markdown 代码块标记
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // 尝试从文本中截取第一个 { ... }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e2) { /* ignore */ }
    }
    return null;
  }
}

/**
 * 调用大模型生成分析报告（Part 2）
 * 按 AI_MODELS 顺序尝试，失败则降级到下一个模型
 */
async function generateAnalysis(payload) {
  const prompt = buildPrompt(payload);
  let lastError = null;

  // 特性检测：cloud.ai() 需 wx-server-sdk >= 3.0.5-beta.1
  if (typeof cloud.ai !== 'function') {
    throw new Error('当前 wx-server-sdk 版本不支持 cloud.ai()，请升级至 3.0.5-beta.1 或更高版本');
  }

  for (const modelName of AI_MODELS) {
    try {
      const ai = cloud.ai();
      const model = ai.createModel('cloudbase');
      const res = await model.generateText({
        model: modelName,
        messages: [
          {
            role: 'system',
            content:
              '你是一位资深雅思学习规划师。请根据学生的测评数据，生成一份专业、具体、可执行的学习分析报告。报告语言为中文。请严格按照指定的 JSON 格式输出，不要输出 JSON 之外的任何内容。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      });

      const text = res && res.text;
      const parsed = extractJSON(text);
      if (parsed) return { data: parsed, model: modelName };
      // 解析失败，返回原始文本作为兜底
      return { data: { raw: text }, model: modelName };
    } catch (e) {
      console.warn(`[aiGenerateReport] 模型 ${modelName} 调用失败：`, e.message);
      lastError = e;
      // 继续尝试下一个模型
    }
  }

  // 所有模型都失败
  throw lastError || new Error('所有 AI 模型调用失败');
}

/**
 * 构建发送给大模型的 Prompt
 */
function buildPrompt(payload) {
  const { vocab, skills, writing, speaking } = payload;

  const vocabText = vocab
    ? `词汇量估算：约 ${vocab.estimate} 词，CEFR 等级：${vocab.cefrLevel || '未知'}`
    : '暂无词汇量测试数据';

  const skillLines = skills.map((s) => {
    const problems = s.mainProblems.map((p) => `  - ${p}`).join('\n');
    return `【${s.name}】分数(0-5)：${s.score}，问题指数(0-100)：${s.problemIndex}\n主要问题：\n${problems || '  - 暂无明显问题'}`;
  });

  const writingText = writing
    ? `写作产出：\n句式改写原文：${writing.task1?.prompt || ''}\n学生答案：\n  句式一：${writing.task1?.sentence1 || '未作答'}\n  句式二：${writing.task1?.sentence2 || '未作答'}\n  句式三：${writing.task1?.sentence3 || '未作答'}\n观点论证：\n  论点：${writing.task2?.claim || '未作答'}\n  论据：${writing.task2?.evidence || '未作答'}\n  论证：${writing.task2?.reasoning || '未作答'}`
    : '暂无写作产出数据';

  const speakingText =
    speaking && speaking.length
      ? speaking
          .map((item, idx) => `第${idx + 1}题：${item.question || ''}\n学生回答转写：${item.transcript || '无转写文本'}${item.duration != null ? `（时长 ${item.duration}秒）` : ''}`)
          .join('\n\n')
      : '暂无口语产出数据';

  return `
${vocabText}

【四维能力自评】（注：分数和问题指数越高，代表该科目问题越严重）
${skillLines.join('\n\n')}

【写作产出】
${writingText}

【口语产出】
${speakingText}

请基于以上数据，生成如下结构的 JSON 报告：
{
  "summary": "一段话概述学生当前英语基础（是否全面薄弱、基础是否具备但关键能力未自动化等），80-120字",
  "characteristics": "指出学生最大的特点和最需要重点关注的 2-3 个关键能力问题，60-100字",
  "improvementPath": "核心提分路径，用箭头连接输入端→输出端→考试端的关键提升点，例如：输入端：词汇/长难句/同义替换 → 输出端：语法自动化/Part2展开 → 考试端：限时训练/套题复盘",
  "learningPath": [
    { "title": "学习路径1标题", "desc": "这条路径解决什么问题" },
    { "title": "学习路径2标题", "desc": "这条路径解决什么问题" },
    { "title": "学习路径3标题", "desc": "这条路径解决什么问题" },
    { "title": "学习路径4标题", "desc": "这条路径解决什么问题" }
  ],
  "trainingLogic": "整体训练逻辑，例如：先补基础 → 再学方法 → 持续输出 → 阶段检测 → 针对性修正"
}

要求：
1. summary、characteristics 要基于真实数据，不要泛泛而谈
2. learningPath 给出 4 条具体可执行的学习路径，每条 20-40 字描述
3. 所有内容用中文
4. 只输出 JSON，不要其他文字
`;
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

    const { studentId } = event || {};
    if (!studentId) return { success: false, error: '缺少 studentId' };

    // 查询学生
    const userRes = await db.collection('users').doc(studentId).get();
    const user = userRes.data;
    const openid = user && user._openid;
    if (!openid) return { success: false, error: '用户无 openid' };

    // 查询测评数据
    const [assessRes, vocabRes, speakRes] = await Promise.all([
      db.collection('assessment_results').where({ _openid: openid, type: 'ability_model' }).orderBy('_createTime', 'desc').limit(1).get(),
      db.collection('vocab_test_sessions').where({ _openid: openid, status: 'completed' }).orderBy('completedAt', 'desc').limit(1).get(),
      db.collection('speaking_answers').where({ _openid: openid }).orderBy('lastUpdateTime', 'desc').limit(1).get(),
    ]);

    const record = assessRes.data && assessRes.data[0];
    const vocabSession = vocabRes.data && vocabRes.data[0];
    const speakingRecord = speakRes.data && speakRes.data[0];

    // 词汇量
    let vocab = record && record.vocab;
    if (!vocab || typeof vocab.estimate !== 'number') {
      vocab = vocabSession
        ? { estimate: vocabSession.vocabEstimate, cefrLevel: vocabSession.cefrLevel }
        : null;
    }

    // 四维自评
    const selfAssess = (record && record.selfAssess) || {};

    // ============ Part 1：能力图谱表格 ============
    const skills = SKILL_KEYS.map((key) => {
      const sa = selfAssess[key] || {};
      const ratings = sa.ratings || [];
      // 注入当前科目的题目列表供 buildSkillProfile 使用
      ASSESSMENT_ITEMS.currentItems = ASSESSMENT_ITEMS[key];
      const profile = buildSkillProfile(ratings);
      return { key, name: SKILL_NAMES[key], ...profile };
    });
    delete ASSESSMENT_ITEMS.currentItems;

    // 综合 CEFR（四维均值）
    const avgLevel = skills.reduce((s, x) => s + x.score, 0) / (skills.length || 1);
    const cefrLevel = Object.keys(selfAssess).length ? levelToCefr(avgLevel) : '';

    const part1 = {
      vocab,
      cefrLevel,
      skills,
      avgLevel: Math.round(avgLevel * 10) / 10,
    };

    // ============ Part 2：AI 生成分析报告 ============
    const writing = record && record.production && record.production.writing ? record.production.writing : null;
    const speaking = speakingRecord ? speakingRecord.answers || [] : [];

    const part2Result = await generateAnalysis({ vocab, skills, writing, speaking });

    return { success: true, part1, part2: part2Result.data, model: part2Result.model };
  } catch (e) {
    console.error('[aiGenerateReport] 失败', e);
    return { success: false, error: e.message || '生成报告失败' };
  }
};
