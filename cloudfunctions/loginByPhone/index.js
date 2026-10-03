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

// 按 _openid 隔离存储的用户数据集合：换绑 openid 时需把旧 openid 的历史数据迁移到新 openid
const USER_DATA_COLLECTIONS = [
  'homework',
  'checkins',
  'exam_scores',
  'speaking_answers',
  'assessment_results',
  'vocab_test_sessions',
  'pomodoro_sessions',
  'assessment_grants', // 测评授权按 _openid 校验，换绑时需迁移，否则授权失联
];

/**
 * 把旧 openid 名下的历史数据迁移到新 openid
 * 场景：手机号命中老用户但 openid 已变更（如换了微信号）。
 * 不迁移则该用户所有按 _openid 隔离的历史数据会"失联"。
 * 服务端 where().update() 为批量更新，循环直到无剩余记录，防止单次更新条数上限导致遗漏。
 */
async function migrateUserData(oldOpenid, newOpenid) {
  const migrated = {};
  for (const col of USER_DATA_COLLECTIONS) {
    let total = 0;
    try {
      for (let i = 0; i < 50; i++) { // 安全上限，避免异常数据导致死循环
        const res = await db.collection(col)
          .where({ _openid: oldOpenid })
          .update({ data: { _openid: newOpenid } });
        const updated = (res.stats && res.stats.updated) || 0;
        total += updated;
        if (updated === 0) break;
      }
    } catch (e) {
      console.error(`[loginByPhone] 迁移 ${col} 失败`, e);
      migrated[col] = -1;
      continue;
    }
    migrated[col] = total;
  }
  console.log('[loginByPhone] 历史数据迁移完成', JSON.stringify(migrated));
  return migrated;
}

/** 用户访问日志（按 openid+type+天 去重） */
async function logAccess(openid, type, detail) {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const exist = await db.collection('access_logs').where({ openid, type, day }).limit(1).get();
    if (exist.data && exist.data.length) return;
    await db.collection('access_logs').add({
      data: { openid, type, day, detail: detail || '', createdAt: now },
    });
  } catch (e) {
    console.error('[loginByPhone] 写访问日志失败', e);
  }
}

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

  // ---------- 第四步：老用户 → 换绑 openid、迁移历史数据、更新登录统计并返回 ----------
  if (user) {
    // 换绑场景：手机号命中老用户但 openid 已变更（或历史记录缺失 _openid）。
    // 不回写 openid 的话，该用户此后所有按 _openid 隔离的读写都会指向新 openid，
    // 而历史数据仍挂在旧 openid 下，造成数据"失联"。
    const needsRebind = !user._openid || user._openid !== openid;
    if (needsRebind && user._openid) {
      try {
        await migrateUserData(user._openid, openid);
      } catch (e) {
        // 迁移失败不阻断登录，仅记录日志，下次登录会重试
        console.error('[loginByPhone] 历史数据迁移失败', e);
      }
    }

    try {
      await db.collection('users').doc(user._id).update({
        data: {
          ...(needsRebind ? { _openid: openid } : {}),
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

    await logAccess(openid, 'login', '老用户登录');

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
        // 服务端创建的记录不会自动注入 _openid，必须显式写入：
        // 黑名单校验（getOpenId 按 _openid 查 users）和客户端隔离查询都依赖该字段
        _openid: openid,
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

    await logAccess(openid, 'login', '新用户注册');

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
