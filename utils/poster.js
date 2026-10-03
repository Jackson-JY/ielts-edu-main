/**
 * utils/poster.js —— 打卡海报绘制工具（Canvas 2D）
 *
 * 画布尺寸：750 × 1330（适配 1080×1920 等比缩放，宽高比 9:16）
 * 版式：风景全幅 + 底部暗色渐变
 *   - 顶部：Deer Edu 品牌字
 *   - 主标题：两行（单科「这是我打卡{科目} / 第 {n} 天」，全科「这是我坚持打卡的 / 第 {n} 天」）
 *   - 日期：YYYY.MM.DD
 *   - 右下角：小程序码 +「长按识别 · 一起打卡」
 *   无感想、无昵称
 *
 * 使用：
 *   import { generatePoster } from '../../utils/poster';
 *   const res = await generatePoster({
 *     subject: 'listening',   // listening|speaking|reading|writing|all
 *     streakDays: 12,
 *     date: '2026-09-23',
 *     canvasId: 'posterCanvas',
 *     componentContext: this, // 组件内调用时传 this
 *   });
 *   // res.tempFilePath 可用于 previewImage / saveImageToPhotosAlbum
 */

const CANVAS_W = 750;
const CANVAS_H = 1330;

// 科目中文名
const SUBJECT_NAME = {
  listening: '听力',
  speaking: '口语',
  reading: '阅读',
  writing: '写作',
  all: '',
};

// 科目背景色（网络图片下载失败时的降级纯色底）
const SUBJECT_FALLBACK = {
  listening: '#8FA8B8',
  speaking: '#D4956A',
  reading: '#5A7A5A',
  writing: '#A07850',
  all: '#3A4A6B',
};

// 云存储环境 ID（完整 fileID 需带 bucket 段）
const CLOUD_ENV_ID = 'cloud1-d7g66xvli7bb6bcc6';
const CLOUD_BUCKET = '636c-cloud1-d7g66xvli7bb6bcc6-1428001663';
// 背景图随包本地发布，零网络依赖（见 images/poster/*.jpg）
const BG_LOCAL = (subject) => `/images/poster/${subject}.jpg`;
const QRCODE_FILEID = `cloud://${CLOUD_ENV_ID}.${CLOUD_BUCKET}/poster/qrcode/checkin.png`;

/**
 * 获取小程序码（优先 data URI，零下载环节；失败降级 fileID 下载）
 * 返回可直接喂给 canvas createImage 的 src，失败返回 null
 */
async function fetchQrcodeSrc() {
  // 主链路：云函数直接返回 base64（码已缓存在云端，管理端身份读，无 ACL/时效问题）
  try {
    const res = await withTimeout(
      wx.cloud.callFunction({ name: 'getCheckinQrcode', data: {} }),
      10000,
      '小程序码获取'
    );
    const result = res && res.result;
    if (result && result.success && result.base64) {
      return `data:image/png;base64,${result.base64}`;
    }
    console.warn('[poster] 云函数返回异常', result && result.error);
  } catch (e) {
    console.warn('[poster] 调用 getCheckinQrcode 失败，降级 fileID 下载', e);
  }
  // 降级：直接用完整 fileID 下载
  return downloadImage(QRCODE_FILEID);
}

/**
 * 带超时的 Promise 包装（任何阶段卡住都能抛出，避免永久 loading）
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}超时`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/**
 * 下载云存储图片到本地临时路径
 * 使用 wx.cloud.downloadFile（原生支持 cloud://，不受 downloadFile 域名白名单限制）
 */
async function downloadImage(fileID) {
  if (!fileID) return null;
  try {
    let tempFilePath;
    if (fileID.startsWith('cloud://')) {
      const res = await withTimeout(
        wx.cloud.downloadFile({ fileID }),
        10000,
        '云存储下载'
      );
      tempFilePath = res.tempFilePath;
    } else {
      const res = await withTimeout(wx.downloadFile({ url: fileID }), 10000, '图片下载');
      if (res.statusCode !== 200) return null;
      tempFilePath = res.tempFilePath;
    }
    return tempFilePath || null;
  } catch (e) {
    console.warn('[poster] 下载图片失败', fileID, e);
    return null;
  }
}

/**
 * 在 canvas 上绘制圆角矩形
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * 核心绘制函数（Canvas 2D，即时绘制，无 ctx.draw）
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts
 *   subject, streakDays, date, bgImage(Image|null), qrImage(Image|null)
 */
function draw(ctx, opts) {
  const { subject, streakDays, date, bgImage, qrImage } = opts;

  // 1. 背景图（全幅）
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = SUBJECT_FALLBACK[subject] || '#888';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // 2. 底部暗色渐变（保证文字和二维码可读）
  const grad = ctx.createLinearGradient(0, CANVAS_H * 0.5, 0, CANVAS_H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 3. y 游标布局（从上往下）
  let y = 80;

  // 顶部品牌字「Deer Edu」
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 28px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Deer Edu', 56, y);
  y += 56;

  // 主标题第一行
  const subjectName = SUBJECT_NAME[subject] || '';
  const line1 = subject === 'all' ? '这是我坚持打卡的' : `这是我打卡${subjectName}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 52px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(line1, 56, y);
  y += 76;

  // 主标题第二行「第 N 天」
  const line2 = `第 ${streakDays} 天`;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 52px sans-serif';
  ctx.fillText(line2, 56, y);
  y += 80;

  // 日期
  const dateStr = (date || '').replace(/-/g, '.');
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '400 26px sans-serif';
  ctx.fillText(dateStr, 56, y);
  y += 60;

  // 4. 右下角小程序码 + 提示文字
  const qrSize = 168;
  const qrX = CANVAS_W - qrSize - 48;
  const qrY = CANVAS_H - qrSize - 60;

  // 二维码白底圆角容器
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 16);
  ctx.fill();

  if (qrImage) {
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  } else {
    // 二维码缺失/加载失败，画占位
    ctx.fillStyle = '#E5E5EA';
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
  }

  // 「长按识别 · 一起打卡」
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '400 22px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('长按识别 · 一起打卡', CANVAS_W - 48, qrY + qrSize + 44);

  // Canvas 2D 为即时绘制，无需 ctx.draw()
}

/**
 * 通过 canvas.createImage 加载图片（Canvas 2D 专用）
 * @returns {Promise<Image|null>}
 */
function loadCanvasImage(canvas, src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (val) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(val); }
    };
    const timer = setTimeout(() => {
      console.warn('[poster] 图片解码超时', src);
      finish(null);
    }, 8000);
    try {
      const img = canvas.createImage();
      img.onload = () => finish(img);
      img.onerror = (e) => {
        console.warn('[poster] 图片解码失败', src, e);
        finish(null);
      };
      img.src = src;
    } catch (e) {
      console.warn('[poster] createImage 失败', src, e);
      finish(null);
    }
  });
}

/**
 * 绘制海报并导出临时文件
 * @param {Object} opts
 *   subject, streakDays, date, canvasId, componentContext
 * @returns {Promise<{tempFilePath:string}>}
 */
async function generatePoster(opts) {
  const { subject, streakDays, date, canvasId, componentContext } = opts;
  console.log('[poster] 开始生成', { subject, streakDays, date, canvasId });

  // 1. 背景图走本地包（无需下载）；小程序码走云函数 base64 与节点查询并行（失败返回 null）
  const bgSrc = BG_LOCAL(subject);
  const qrPromise = fetchQrcodeSrc();

  // 2. 获取 Canvas 2D 节点（带一次“未布局完成”重试）
  const queryNode = () => new Promise((resolve) => {
    const query = componentContext
      ? wx.createSelectorQuery().in(componentContext)
      : wx.createSelectorQuery();
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => resolve(res && res[0] ? res[0] : null));
  });

  let nodeRes = await queryNode();
  // 部分基础库 fields 不回传 size；只要 node 存在即可（节点为页面常驻）
  if (!nodeRes || !nodeRes.node || (nodeRes.size && nodeRes.size.width === 0)) {
    await new Promise((r) => setTimeout(r, 100));
    nodeRes = await queryNode();
  }
  if (!nodeRes || !nodeRes.node) {
    throw new Error('未找到 canvas 节点');
  }
  const canvasNode = nodeRes.node;
  console.log('[poster] canvas 节点已获取');

  const qrcodePath = await qrPromise;
  console.log('[poster] 小程序码下载结果', qrcodePath);

  const ctx = canvasNode.getContext('2d');
  const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;

  // 3. 设置 canvas 实际像素尺寸（CSS 尺寸由 wxss 固定为 750×1330）
  canvasNode.width = CANVAS_W * dpr;
  canvasNode.height = CANVAS_H * dpr;
  ctx.scale(dpr, dpr);

  // 4. 用 createImage 加载图片：背景为本地包路径，二维码为本地临时路径
  const [bgImage, qrImage] = await Promise.all([
    loadCanvasImage(canvasNode, bgSrc),
    loadCanvasImage(canvasNode, qrcodePath),
  ]);
  console.log('[poster] 图片解码完成', { hasBg: !!bgImage, hasQr: !!qrImage });

  // 5. 即时绘制（每步兜底，防止个别 API 异常中断整条链路）
  try {
    draw(ctx, { subject, streakDays, date, bgImage, qrImage });
  } catch (e) {
    console.error('[poster] 绘制异常', e);
    throw new Error('海报绘制失败');
  }
  console.log('[poster] 绘制完成，开始导出', { backing: [canvasNode.width, canvasNode.height] });

  // 6. 导出图片（2x）。success/fail/complete 全打日志，避免黑盒卡住。
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('导出图片超时（请保持小程序在前台）'));
    }, 10000);

    wx.canvasToTempFilePath({
      canvas: canvasNode,
      x: 0,
      y: 0,
      width: CANVAS_W,
      height: CANVAS_H,
      destWidth: CANVAS_W * 2,
      destHeight: CANVAS_H * 2,
      success: (r) => {
        console.log('[poster] 导出成功', r.tempFilePath);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ tempFilePath: r.tempFilePath });
      },
      fail: (e) => {
        console.error('[poster] 导出失败', e);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      },
    });
  });
}

module.exports = {
  generatePoster,
  CANVAS_W,
  CANVAS_H,
};
