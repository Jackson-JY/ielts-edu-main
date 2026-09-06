// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

// 云函数入口函数
// 返回当前用户的 openid，并在服务端判定其是否被拉黑（users.blocked === true）
//   - 服务端判定，客户端无法绕过
//   - event.countAttempt === true 时，额外记录一次"登录尝试"（含被拒绝的尝试），
//     用 loginAttempts 原子自增 + lastAttemptAt。仅登录流程传该参数，
//     app 启动时的黑名单校验不传，避免误计数。
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const countAttempt = !!(event && event.countAttempt);

  let blocked = false;
  try {
    const res = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();
    const user = res.data && res.data[0];

    if (user) {
      blocked = user.blocked === true;

      // 补写 unionid（用于管理端微信扫码登录的身份关联）
      if (!user.unionid && wxContext.UNIONID) {
        try {
          await db.collection('users').doc(user._id).update({
            data: { unionid: wxContext.UNIONID },
          });
        } catch (e) {
          console.error('[getOpenId] 补写 unionid 失败', e);
        }
      }

      // 记录登录尝试（无论是否被拒）
      if (countAttempt) {
        try {
          await db.collection('users').doc(user._id).update({
            data: {
              loginAttempts: _.inc(1),
              lastAttemptAt: new Date(),
            },
          });
        } catch (e) {
          console.error('[getOpenId] 记录登录尝试失败', e);
        }
      }
    }
  } catch (e) {
    console.error('[getOpenId] 查询用户状态失败', e);
  }

  return {
    openid,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    blocked,
  };
};
