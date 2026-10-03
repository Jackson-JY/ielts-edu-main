/**
 * 测评授权工具
 * - checkAccess(): 校验当前用户测评授权（走云函数，服务端为准）
 * - reasonText(): 把未授权原因转成友好文案
 * 所有测评入口（intro 页 / 词汇测试开始前）统一走这里。
 */

function callCloud(data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'assessmentAccess',
      data,
      success: (r) => resolve(r.result || {}),
      fail: (err) => reject(err),
    });
  });
}

/**
 * 校验测评授权
 * @returns {Promise<{authorized: boolean, reason: string, remaining: number, totalQuota: number, usedCount: number, expireAt: string|null}>}
 * 云函数不可用时 fail-closed：按未授权处理（避免授权体系失效时被绕过）
 */
async function checkAccess() {
  try {
    const res = await callCloud({ action: 'check' });
    if (res && res.success) {
      return {
        authorized: !!res.authorized,
        reason: res.reason || '',
        remaining: res.remaining || 0,
        totalQuota: res.totalQuota || 0,
        usedCount: res.usedCount || 0,
        expireAt: res.expireAt || null,
      };
    }
    return { authorized: false, reason: 'CHECK_FAILED', remaining: 0, totalQuota: 0, usedCount: 0, expireAt: null };
  } catch (e) {
    console.error('[assessmentAccess] 校验失败', e);
    return { authorized: false, reason: 'CHECK_FAILED', remaining: 0, totalQuota: 0, usedCount: 0, expireAt: null };
  }
}

/** 完成扣次（完整测评最后一步，由 assessmentStore.finalize 调用） */
async function complete(recordId) {
  try {
    const res = await callCloud({ action: 'complete', recordId });
    return res && res.success
      ? { ok: true, charged: !!res.charged, reason: res.reason || '', remaining: res.remaining }
      : { ok: false, charged: false, reason: 'CHECK_FAILED' };
  } catch (e) {
    console.error('[assessmentAccess] 完成扣次失败', e);
    return { ok: false, charged: false, reason: 'CHECK_FAILED' };
  }
}

/** 未授权原因 → 提示文案 */
function reasonText(reason) {
  switch (reason) {
    case 'REVOKED':
      return '你的测评授权已被暂停，请联系管理员';
    case 'EXPIRED':
      return '测评授权已过期，请联系老师续期';
    case 'NO_QUOTA':
      return '测评次数已用完，请联系老师增加次数';
    default:
      return '测评功能需老师授权后使用，请联系管理员开通';
  }
}

/** 格式化有效期展示 */
function expireText(expireAt) {
  if (!expireAt) return '长期有效';
  const d = new Date(expireAt);
  if (isNaN(d.getTime())) return '长期有效';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 前有效`;
}

module.exports = { checkAccess, complete, reasonText, expireText };
