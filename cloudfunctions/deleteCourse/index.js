// 云函数：删除课程（管理员）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const common = require('./_common');
const normalizeEvent = common.normalizeEvent;
const authenticate = (event) => common.authenticate(event, db, cloud);
const logAudit = (auth, action, detail) => common.logAudit(db, auth, 'course', action, detail);

/**
 * 删除课程（管理员）
 */
async function deleteCourseById(id) {
  try {
    // 直接删除课程记录（云函数拥有管理员权限）
    const res = await db.collection('courses').doc(id).remove();

    if (res.stats && res.stats.removed > 0) {
      return {
        success: true,
        message: '课程已删除'
      };
    } else {
      return {
        success: false,
        error: '课程不存在或已被删除'
      };
    }
  } catch (e) {
    console.error('删除课程失败', e);
    return {
      success: false,
      error: e.message || '删除失败'
    };
  }
}

exports.main = async (event, context) => {
  event = normalizeEvent(event);
  const { id } = event;

  if (!id) {
    return {
      success: false,
      error: '缺少课程ID'
    };
  }

  // 验证管理员身份
  const auth = await authenticate(event);
  if (!auth.ok) {
    return auth.authError
      ? { success: false, authError: true, error: '登录已过期' }
      : { success: false, error: '无权删除课程，仅管理员可操作' };
  }

  try {
    const result = await deleteCourseById(id);
    if (result && result.success) {
      await logAudit(auth, 'course.delete', `删除课程：${id}`);
    }
    return result;
  } catch (e) {
    console.error('云函数执行失败', e);
    return {
      success: false,
      error: e.message || '服务器错误'
    };
  }
};
