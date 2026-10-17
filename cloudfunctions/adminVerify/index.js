// 云函数：adminVerify —— 校验管理端 token，返回管理员信息
// 前端启动时调用，用于刷新/校验登录态
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const normalizeEvent = require('./_common').normalizeEvent;

exports.main = async (event) => {
  event = normalizeEvent(event);
  const token = event && event._token;
  if (!token) {
    return { success: false, authError: true, error: '未登录' };
  }

  try {
    const res = await db.collection('admin_sessions').where({ token }).limit(1).get();
    const session = res.data && res.data[0];

    if (!session || !session.expireAt || new Date(session.expireAt) <= new Date()) {
      return { success: false, authError: true, error: '登录已过期' };
    }

    return {
      success: true,
      admin: {
        _id: session.userId,
        nickName: session.nickName,
        openid: session.openid,
      },
    };
  } catch (e) {
    console.error('[adminVerify] 失败', e);
    return { success: false, error: e.message };
  }
};
