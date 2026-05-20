const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

/**
 * 获取课程列表（支持日期范围和分页）
 * @param {Object} event - 传入参数
 *   - startDate: 开始日期 YYYY-MM-DD
 *   - endDate: 结束日期 YYYY-MM-DD
 *   - skip: 跳过的记录数（可选，默认0）
 *   - limit: 每页数量（可选，默认100）
 * @returns {Object} 课程列表和总数
 */
exports.main = async (event, context) => {
  const { startDate, endDate, skip = 0, limit = 100 } = event;

  try {
    // 构建查询条件
    const whereCondition = {
      date: db.command.gte(startDate).and(db.command.lte(endDate))
    };

    // 获取总数
    const countResult = await db.collection('courses')
      .where(whereCondition)
      .count();

    // 获取数据列表（按日期和时间排序）
    const listResult = await db.collection('courses')
      .where(whereCondition)
      .orderBy('date', 'asc')
      .orderBy('startTime', 'asc')
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
    console.error('[getCourses] 获取课程列表失败', e);
    return {
      success: false,
      error: e.message,
      data: [],
      total: 0,
    };
  }
};
