// 云函数：删除课程（管理员）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 验证是否为管理员
 */
async function verifyAdmin(openid) {
  try {
    const res = await db.collection('users').where({
      _openid: openid
    }).get();

    if (res.data && res.data.length > 0) {
      const user = res.data[0];
      return user.isAdmin === true;
    }
    return false;
  } catch (e) {
    console.error('验证管理员失败', e);
    return false;
  }
}

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
  const { id } = event;
  
  // 获取调用者的 openid（从云端获取）
  let openid = '';
  try {
    const wxContext = cloud.getWXContext();
    openid = wxContext.OPENID || '';
  } catch (e) {
    console.error('获取openid失败', e);
  }

  if (!id) {
    return {
      success: false,
      error: '缺少课程ID'
    };
  }

  // 验证管理员身份
  const isAdmin = await verifyAdmin(openid);
  if (!isAdmin) {
    return {
      success: false,
      error: '无权删除课程，仅管理员可操作'
    };
  }

  try {
    return await deleteCourseById(id);
  } catch (e) {
    console.error('云函数执行失败', e);
    return {
      success: false,
      error: e.message || '服务器错误'
    };
  }
};
