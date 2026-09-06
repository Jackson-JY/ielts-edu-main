/**
 * 入学测评数据（基于《入学测评（全）》测试文档）
 *
 * 结构对应文档三步：
 * - 第一步 词汇测试：由词汇量页（vocab）的 CAT 自适应词汇测评承担（云函数 vocabCatTest）
 * - 第二步 听说读写 48 个能力模型：每项 12 条描述，按 0-5 自评
 * - 第三步 产出题：写作 2 题 + 口语 2 题
 */

// 自评分数档位说明（0-5）
const SCORE_LABELS = [
  '完全不符合',
  '比较不符合',
  '不太符合',
  '比较符合',
  '很符合',
  '完全符合',
];

// ============ 第二步：48 个能力模型自评 ============

// 听力 Listening L-01 ~ L-12
const LISTENING_ITEMS = [
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
];

// 阅读 Reading R-01 ~ R-12
const READING_ITEMS = [
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
];

// 写作 Writing W-01 ~ W-12
const WRITING_ITEMS = [
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
];

// 口语 Speaking S-01 ~ S-12
const SPEAKING_ITEMS = [
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
];

// ============ 第三步：产出题 ============

const WRITING_PRODUCTION = {
  task1: {
    id: 'sentences',
    title: '句式改写',
    prompt: '由于科技的快速发展，人们的生活方式发生了巨大的变化',
    promptEn: 'Due to the rapid development of technology, people\'s lifestyles have changed dramatically.',
    requirement: '用三种不同的句式把这句话写出英文',
    slots: [
      { key: 'sentence1', label: '句式一', hint: '如：简单句 / there be 句型' },
      { key: 'sentence2', label: '句式二', hint: '如：with 复合结构 / 定语从句' },
      { key: 'sentence3', label: '句式三', hint: '如：强调句 / 倒装句 / 形式主语' },
    ],
  },
  task2: {
    id: 'cer',
    title: '观点论证',
    prompt: '大学教育是否应该免费？',
    requirement: '不要求写全文，用中文或英文写出论点、论据和论证过程（Claim, Evidence, Reasoning）',
    slots: [
      { key: 'claim', label: '论点 Claim', hint: '你的立场是什么' },
      { key: 'evidence', label: '论据 Evidence', hint: '用事实、数据或例子支撑' },
      { key: 'reasoning', label: '论证 Reasoning', hint: '解释论据如何推出论点' },
    ],
  },
};

const SPEAKING_PRODUCTION = {
  task1: {
    id: 'picture',
    title: '图片描述',
    prompt: 'Describe what is happening in this picture.',
    requirement: '1 分钟准备，2 分钟作答',
    prepareSeconds: 60,
    answerSeconds: 120,
    image: '/images/assessment-speaking-picture.jpg',
    hints: ['good environment', 'pet-friendly park', 'enjoyable and relaxing', 'for social'],
  },
  task2: {
    id: 'opinion',
    title: '观点表达',
    prompt: 'Give me two reasons why you agree or disagree in 30 seconds.',
    requirement: '30 秒内给出两个理由',
    answerSeconds: 30,
    prompts: [
      'Schools should cancel PE classes.',
      'Everyone should work from home.',
      'People should stop using private cars in cities.',
      'Academic success mainly depends on natural intelligence.',
      'Governments should prioritize economic growth over environmental protection.',
    ],
  },
};

// 跟读评测题（用于发音准确度检测，配合 SOE 口语评测）
const SPEAKING_SHADOWING = {
  id: 'shadowing',
  title: '跟读评测',
  requirement: '请大声朗读下面这句话，系统将评估你的发音',
  answerSeconds: 30,
  // 随机抽取一句，覆盖常见发音难点（th, r/l, 连读, 重音）
  sentences: [
    'The government should invest more in renewable energy to protect the environment.',
    'I believe that education plays a crucial role in shaping one\'s future career.',
    'Technology has significantly changed the way people communicate with each other.',
    'Students should be encouraged to think critically rather than memorize facts.',
    'The number of international tourists has increased dramatically over the past decade.',
  ],
};

// ============ 结果展示文案 ============

// 词汇测试 CEFR 描述（阅读页词汇结果视图用）
const VOCAB_CEFR_DESCS = {
  A1: '入门级：掌握最基础的日常词汇',
  A2: '基础级：能应对简单的日常交流场景',
  B1: '中级：具备日常生活和工作所需的词汇量',
  B2: '中高级：能进行较复杂的学术与话题讨论',
  C1: '高级：词汇运用流畅准确，接近雅思 7 分水平',
  C2: '精通级：词汇量接近英语母语者水平',
};

// 综合 CEFR 描述（结果页用）
const CEFR_DESCS = {
  A1: '入门级英语水平，能够理解和使用简单的日常用语',
  A2: '基础级英语水平，能够进行简单的日常交流',
  B1: '中级英语水平，能够应对日常生活和工作场景',
  B2: '中高级英语水平，能够进行复杂的学术交流',
  C1: '高级英语水平，语言运用流畅且准确',
  C2: '精通级英语水平，语言能力接近母语水平',
};

// 四科分档评语（结果页用；按 level ≥4 / ≥2.5 / 其他 三档取 high/mid/low）
const SKILL_COMMENTS = {
  listening: {
    high: '听力理解能力强，能够理解复杂对话和讲座内容',
    mid: '听力基本理解能力良好，需加强细节捕捉',
    low: '听力理解需要加强，建议多听不同口音的素材',
  },
  speaking: {
    high: '口语表达流利，词汇和语法使用准确',
    mid: '口语表达基本流利，需提升词汇多样性和语法准确性',
    low: '口语表达需要大量练习，建议跟读和模仿',
  },
  reading: {
    high: '阅读理解能力强，能够快速抓取文章主旨和细节',
    mid: '阅读理解能力良好，需提升长难句分析能力',
    low: '阅读理解需要加强，建议扩大词汇量和阅读量',
  },
  writing: {
    high: '写作结构清晰，词汇多样性和语法准确性优秀',
    mid: '写作基本结构清晰，需提升词汇多样性和论证深度',
    low: '写作需要系统学习，建议加强句型和词汇积累',
  },
};

module.exports = {
  SCORE_LABELS,
  LISTENING_ITEMS,
  READING_ITEMS,
  WRITING_ITEMS,
  SPEAKING_ITEMS,
  WRITING_PRODUCTION,
  SPEAKING_PRODUCTION,
  SPEAKING_SHADOWING,
  VOCAB_CEFR_DESCS,
  CEFR_DESCS,
  SKILL_COMMENTS,
};
