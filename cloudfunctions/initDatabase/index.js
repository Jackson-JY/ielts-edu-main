const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

async function verifyAdmin() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return false;

  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  return !!(res.data && res.data[0] && res.data[0].isAdmin === true);
}

// 需要创建的集合列表
const collections = [
  'courses',
  'homework',
  'checkins',
  'users',
  'trial_bookings',
  'coupons',
  'time_slots',
  'exam_scores',
  'assessment_results',
  'speaking_answers',    // 口语测评答题记录
  'pomodoro_sessions',   // 番茄时钟专注会话记录
];

exports.main = async (event, context) => {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return {
      success: false,
      error: '无权初始化数据库，仅管理员可操作',
      data: [],
      summary: {
        total: collections.length,
        created: 0,
        exists: 0,
        errors: 0,
      },
    };
  }

  const results = [];

  for (const collName of collections) {
    try {
      // 尝试获取集合信息，如果不存在会报错
      await db.collection(collName).limit(1).get();
      results.push({
        name: collName,
        status: 'exists',
        message: '集合已存在',
      });
    } catch (err) {
      // 集合不存在，尝试创建
      try {
        // 使用 createCollection 直接创建集合
        await db.createCollection(collName);
        
        results.push({
          name: collName,
          status: 'created',
          message: '集合创建成功',
        });
      } catch (createErr) {
        results.push({
          name: collName,
          status: 'error',
          message: `创建失败: ${createErr.message}`,
          errCode: createErr.errCode,
        });
      }
    }
  }

  return {
    success: true,
    data: results,
    summary: {
      total: collections.length,
      created: results.filter(r => r.status === 'created').length,
      exists: results.filter(r => r.status === 'exists').length,
      errors: results.filter(r => r.status === 'error').length,
    },
  };
};
