const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

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
];

exports.main = async (event, context) => {
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
      if (err.errCode === -1 || err.message.includes('not found')) {
        // 集合不存在，尝试创建
        try {
          // 通过添加一个空文档再删除来创建集合
          const tempRes = await db.collection(collName).add({
            data: {
              _temp: true,
              createTime: new Date(),
            },
          });
          // 删除临时文档
          await db.collection(collName).doc(tempRes._id).remove();
          
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
          });
        }
      } else {
        results.push({
          name: collName,
          status: 'error',
          message: `检查失败: ${err.message}`,
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
