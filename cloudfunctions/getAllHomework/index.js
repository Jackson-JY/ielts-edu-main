const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

/**
 * 获取所有作业列表（管理员使用）
 * @param {Object} event - 传入参数
 *   - skip: 跳过的记录数（可选，默认0）
 *   - limit: 每页数量（可选，默认100）
 * @returns {Object} 作业列表和总数
 */
exports.main = async (event, context) => {
  const { skip = 0, limit = 100 } = event;

  try {
    // 获取总数
    const countResult = await db.collection('homework').count();

    // 获取数据列表（按更新时间倒序）
    const listResult = await db.collection('homework')
      .orderBy('_updateTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();

    return {
      success: true,
      data: listResult.data || [],
      total: countResult.total,
      skip,
      limit,
    };
  } catch (e) {
    console.error('[getAllHomework] 获取作业列表失败', e);
    return {
      success: false,
      error: e.message,
      data: [],
      total: 0,
    };
  }
};
