const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 获取所有用户，排除敏感信息
    const res = await db.collection('users')
      .field({
        nickName: true,
        avatarUrl: true,
        _id: true,
        isAdmin: true,
        _createTime: true,
      })
      .orderBy('_createTime', 'desc')
      .get();

    return {
      success: true,
      data: res.data || [],
    };
  } catch (e) {
    console.error('[getAllUsers] 获取用户列表失败', e);
    return {
      success: false,
      error: e.message,
      data: [],
    };
  }
};
