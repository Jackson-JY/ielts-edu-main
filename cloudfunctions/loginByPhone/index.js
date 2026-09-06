// 云函数：loginByPhone
// 手机号一键登录：
//   前端通过 <button open-type="getPhoneNumber"> 拿到动态令牌 code，
//   传给本云函数，由服务端调用微信 openapi 换取用户手机号，
//   然后按 openid / 手机号查找或创建用户，一次性完成登录。
//
//   - 服务端黑名单校验（users.blocked === true 时拒绝登录）
//   - 老用户返回用户信息，新用户自动创建（默认昵称，后续可在"我的"页完善）
//   - 全程用户无感知，实现真正的"一键登录"
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const phoneCode = event && event.phoneCode; // getPhoneNumber 回调里的动态 code

  if (!openid) {
    return { success: false, error: '无法获取用户身份' };
  }

  // ---------- 第一步：用 code 换取手机号 ----------
  let phoneNumber = '';
  if (phoneCode) {
    try {
      const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({
        code: phoneCode,
      });
      // 返回结构: { phoneInfo: { phoneNumber, purePhoneNumber, countryCode, watermark } }
      phoneNumber = (phoneRes.phoneInfo && phoneRes.phoneInfo.purePhoneNumber) || '';
    } catch (e) {
      // 常见原因：小程序未开通"手机号快速验证组件" / code 已过期
      console.error('[loginByPhone] 换取手机号失败', e);
      return {
        success: false,
        error: 'PHONE_UNAVAILABLE',
        message: '手机号授权不可用，请使用微信登录',
      };
    }
  }

  // ---------- 第二步：查找已有用户（优先 openid，其次手机号） ----------
  let user = null;
  try {
    let res = await db.collection('users').where({ _openid: openid }).limit(1).get();
    if (!res.data.length && phoneNumber) {
      // 老用户换了微信（openid 变了）但手机号没变的场景
      res = await db.collection('users').where({ phone: phoneNumber }).limit(1).get();
    }
    user = res.data && res.data[0];
  } catch (e) {
    console.error('[loginByPhone] 查询用户失败', e);
    return { success: false, error: 'DB_ERROR', message: '登录失败，请重试' };
  }

  // ---------- 第三步：黑名单校验（服务端，客户端无法绕过） ----------
  if (user && user.blocked === true) {
    return { success: false, error: 'BLOCKED', message: '该账号已被禁用' };
  }

  // ---------- 第四步：老用户 → 更新登录统计并返回 ----------
  if (user) {
    try {
      await db.collection('users').doc(user._id).update({
        data: {
          loginCount: _.inc(1),
          loginAttempts: _.inc(1),
          lastLoginAt: new Date(),
          lastAttemptAt: new Date(),
          // 手机号可能比已有记录更"新"（换绑场景），以最近一次授权为准
          ...(phoneNumber && !user.phone ? { phone: phoneNumber } : {}),
          // 补写 unionid（用于管理端微信扫码登录的身份关联）
          ...(wxContext.UNIONID && !user.unionid ? { unionid: wxContext.UNIONID } : {}),
        },
      });
    } catch (e) {
      console.error('[loginByPhone] 更新登录统计失败', e);
    }

    return {
      success: true,
      isNewUser: false,
      user: {
        userId: user._id,
        openId: openid,
        nickName: user.nickName || '微信用户',
        avatarUrl: user.avatarUrl || '',
        phone: user.phone || phoneNumber,
        isAdmin: user.isAdmin === true,
        // 是否还没完善过资料（引导去"我的"页设置头像昵称）
        profileIncomplete: !user.nickName || user.nickName === '微信用户' || !user.avatarUrl,
      },
    };
  }

  // ---------- 第五步：新用户 → 创建账号 ----------
  try {
    const now = new Date();
    const addRes = await db.collection('users').add({
      data: {
        nickName: '微信用户', // 默认昵称，登录后可在"我的"页修改
        avatarUrl: '',        // 默认头像由前端兜底展示
        phone: phoneNumber,
        studyDays: 0,
        vocabulary: 0,
        listeningScore: 0,
        speakingScore: 0,
        readingScore: 0,
        writingScore: 0,
        loginCount: 1,
        loginAttempts: 1,
        lastLoginAt: now,
        lastAttemptAt: now,
        _createTime: now,
        ...(wxContext.UNIONID ? { unionid: wxContext.UNIONID } : {}),
      },
    });

    return {
      success: true,
      isNewUser: true,
      user: {
        userId: addRes._id,
        openId: openid,
        nickName: '微信用户',
        avatarUrl: '',
        phone: phoneNumber,
        isAdmin: false,
        profileIncomplete: true,
      },
    };
  } catch (e) {
    console.error('[loginByPhone] 创建用户失败', e);
    return { success: false, error: 'DB_ERROR', message: '注册失败，请重试' };
  }
};
