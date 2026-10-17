const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const common = require('./_common');
const normalizeEvent = common.normalizeEvent;
const authenticate = (event) => common.authenticate(event, db, cloud);

// 云函数入口函数
exports.main = async (event, context) => {
  event = normalizeEvent(event);
  try {
    const auth = await authenticate(event);
    if (!auth.ok) {
      return auth.authError
        ? { success: false, authError: true, error: '登录已过期', data: [] }
        : { success: false, error: '无权获取用户列表，仅管理员可操作', data: [] };
    }

    // 获取所有用户，排除敏感信息
    // 注：_openid 是作业等私有集合按用户隔离的关联键，
    // 教师端需要据此把作业记录映射回学员姓名，因此必须返回。
    const res = await db.collection('users')
      .field({
        nickName: true,
        avatarUrl: true,
        _id: true,
        _openid: true,
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
