/**
 * utils/poster.js —— 打卡海报绘制工具（Canvas 2D）
 *
 * 画布尺寸：750 × 1330（适配 1080×1920 等比缩放，宽高比 9:16）
 * 版式：风景全幅（云端 poster/bg/ 共 10 张，每次随机一张）+ 底部暗色渐变
 *   - 顶部：Deer Edu 品牌字
 *   - 主标题：「这是我坚持打卡的 / 第 N 天」
 *   - 日期时间：YYYY.MM.DD HH:mm
 *   - 底部：随机一句积极向上的话（50 句文案池）
 *   - 右下角：小程序码 +「长按识别 · 一起打卡」
 *   无感想、无昵称、不分科目
 *
 * 使用：
 *   import { generatePoster } from '../../utils/poster';
 *   const res = await generatePoster({
 *     streakDays: 12,
 *     date: '2026-10-05',   // YYYY-MM-DD
 *     time: '14:30',        // HH:mm
 *     canvasId: 'posterCanvas',
 *     componentContext: this, // 组件内调用时传 this
 *   });
 *   // res.tempFilePath 可用于 previewImage / saveImageToPhotosAlbum
 */

const CANVAS_W = 750;
const CANVAS_H = 1330;

// 云存储环境
const CLOUD_ENV_ID = 'cloud1-d7g66xvli7bb6bcc6';
const CLOUD_BUCKET = '636c-cloud1-d7g66xvli7bb6bcc6-1428001663';

// 云端背景图（10 张，每次随机，已压缩为 JPEG）；下载失败时降级本地包
const BG_NAMES = ['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2', '2-3', '2-4', '2-5'];
const BG_FILE_IDS = BG_NAMES.map(
  (name) => `cloud://${CLOUD_ENV_ID}.${CLOUD_BUCKET}/poster/bg/${name}.jpg`
);
const BG_FALLBACK_LOCAL = '/images/poster/all.jpg';
const BG_FALLBACK_COLOR = '#3A4A6B';
const QRCODE_FILEID = `cloud://${CLOUD_ENV_ID}.${CLOUD_BUCKET}/poster/qrcode/checkin.png`;

// 小程序码 base64 持久缓存 key（码内容固定，成功一次后永久本地复用）
const QR_BASE64_CACHE_KEY = 'posterQrcodeBase64';

const cloudStorage = require('./cloudStorage');

// 积极向上文案池（50 句，每次随机一句）
const QUOTES = [
  '每一次坚持，都在悄悄拉近你与目标的距离。',
  '星光不问赶路人，时光不负有心人。',
  '今天的努力，是明天上岸的底气。',
  '慢慢来，比较快；稳扎稳打，自会抵达。',
  '你读过的每一个词，都会在考场上给你力量。',
  '不必羡慕别人的光芒，你也有自己的星河。',
  '把自律活成习惯，把优秀交给时间。',
  '所有的毫不费力，背后都是不为人知的努力。',
  '日拱一卒无有尽，功不唐捐终入海。',
  '与其焦虑未来，不如把握现在的每一分钟。',
  '坚持很难，但山顶的风景值得。',
  '你只管努力，剩下的交给时间。',
  '微小的进步，也是在向梦想靠近。',
  '今天比昨天好，就是最好的状态。',
  '熬过无人问津的日子，才有诗和远方。',
  '每一份打卡记录，都是给未来的底气。',
  '心中有光，脚下有路，目标终会抵达。',
  '不怕慢，就怕站；只要走，就有路。',
  '学习没有白走的路，每一步都算数。',
  '越努力，越幸运；越自律，越自由。',
  '把平凡的日子，过成向上的轨迹。',
  '你的坚持，终将成就无可替代的自己。',
  '以梦为马，不负韶华；打卡为证，不负今日。',
  '种一棵树最好的时间是十年前，其次是现在。',
  '现在流下的汗水，都是成绩单上的惊喜。',
  '保持热爱，奔赴山海，每天进步一点点。',
  '真正的优秀，是持续做难而正确的事。',
  '你多学一项本领，就少说一句求人的话。',
  '行动是治愈焦虑的良药，打卡是最好的证明。',
  '日积月累，水滴石穿，你比想象中更强大。',
  '半山腰总是最挤的，我们山顶见。',
  '今天的小小坚持，会照亮未来的一大段路。',
  '别在最该奋斗的年纪，选择了安逸。',
  '所有的坚持和孤独，都会发光。',
  '踏实走过的每一步，时间都会记得。',
  '让努力成为习惯，让进步看得见。',
  '你期待的未来，藏在现在的每一份努力里。',
  '不是因为有希望才坚持，而是坚持才有希望。',
  '打卡一天不难，难的是一直打卡——而你做到了。',
  '把目标拆成每一天，未来自然水到渠成。',
  '勇敢的人，不是不落泪，而是愿意带着泪奔跑。',
  '光阴可惜，譬诸逝水，今日打卡，不负朝夕。',
  '人生没有白读的书，每一本都算数。',
  '向上的路，每一步都不会被辜负。',
  '专注当下，静待花开，时间会给你答案。',
  '你的词汇量里，藏着你看过的世界。',
  '今天也是认真又闪亮的一天。',
  '用打卡丈量梦想，用坚持书写答案。',
  '路虽远，行则将至；事虽难，做则必成。',
  '持续努力的人，运气都不会太差。',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 获取小程序码 data URI
 * 链路：本地 Storage 永久缓存 → 云函数返回 base64 → fileID 下载
 * 码内容固定不变，成功一次后后续零网络
 */
async function fetchQrcodeSrc() {
  // 1. 本地持久缓存
  try {
    const cached = wx.getStorageSync(QR_BASE64_CACHE_KEY);
    if (cached) return `data:image/png;base64,${cached}`;
  } catch (e) { /* ignore */ }

  // 2. 云函数直接返回 base64（码已缓存在云端，无 ACL/时效问题）
  try {
    const res = await withTimeout(
      wx.cloud.callFunction({ name: 'getCheckinQrcode', data: {} }),
      10000,
      '小程序码获取'
    );
    const result = res && res.result;
    if (result && result.success && result.base64) {
      try { wx.setStorageSync(QR_BASE64_CACHE_KEY, result.base64); } catch (e) { /* ignore */ }
      return `data:image/png;base64,${result.base64}`;
    }
    console.warn('[poster] 云函数返回异常', result && result.error);
  } catch (e) {
    console.warn('[poster] 调用 getCheckinQrcode 失败，降级 fileID 下载', e);
  }
  // 3. 降级：完整 fileID 下载
  return downloadImage(QRCODE_FILEID);
}

// ==================== 预热缓存（点击生成前把资源准备好，实现秒出图） ====================

let _canvasNode = null;   // 常驻 canvas 节点（页面中唯一）
let _bgPromise = null;    // 随机背景解码 Promise
let _qrPromise = null;    // 小程序码解码 Promise

/**
 * 查询 Canvas 2D 节点（带一次“未布局完成”重试）
 */
function queryCanvasNode(canvasId, componentContext) {
  const run = () => new Promise((resolve) => {
    const query = componentContext
      ? wx.createSelectorQuery().in(componentContext)
      : wx.createSelectorQuery();
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => resolve(res && res[0] ? res[0] : null));
  });
  return run().then((r) => {
    if (r && r.node) return r.node;
    return new Promise((resolve) => setTimeout(() => run().then((r2) => resolve(r2 && r2.node)), 100));
  });
}

/**
 * 准备一张随机背景（fileID → getTempFileURL 换 https 链接 → canvas 直接解码）
 * 换链走 cloudStorage 的 50 分钟缓存；解码失败再降级 fileID 下载 / 本地包
 * @returns {Promise<Image|null>}
 */
async function prepareBgImage(node) {
  const fileID = pickRandom(BG_FILE_IDS);
  console.log('[poster] 本次背景图', fileID);

  // 主链路：getTempFileURL（规避 downloadFile -403003 empty download url）
  try {
    const url = await withTimeout(cloudStorage.getTempUrl(fileID), 8000, '背景换链');
    if (url && !url.startsWith('cloud://')) {
      const img = await loadCanvasImage(node, url);
      if (img) return img;
    }
  } catch (e) {
    console.warn('[poster] 背景换链失败', e);
  }

  // 降级 1：fileID 下载
  const tempPath = await downloadImage(fileID, 10000);
  if (tempPath) {
    const img = await loadCanvasImage(node, tempPath);
    if (img) return img;
  }

  // 降级 2：本地包
  console.warn('[poster] 云端背景不可用，降级本地包');
  return loadCanvasImage(node, BG_FALLBACK_LOCAL);
}

async function prepareQrImage(node) {
  const src = await fetchQrcodeSrc();
  if (!src) return null;
  return loadCanvasImage(node, src);
}

/**
 * 预热：在页面 onReady 后静默调用。准备好 canvas 节点、一张随机背景和小程序码。
 * 多次调用安全（只执行一次）
 */
async function preload({ canvasId, componentContext } = {}) {
  try {
    if (!_canvasNode) {
      _canvasNode = await queryCanvasNode(canvasId || 'posterCanvas', componentContext);
    }
    if (!_canvasNode) return;
    if (!_bgPromise) _bgPromise = prepareBgImage(_canvasNode);
    if (!_qrPromise) _qrPromise = prepareQrImage(_canvasNode);
    await Promise.all([_bgPromise, _qrPromise]);
    console.log('[poster] 预热完成');
  } catch (e) {
    console.warn('[poster] 预热失败（不影响生成）', e);
  }
}

/**
 * 取已预热/即时准备的图片；消费后立即补充下一张背景供下次使用
 */
async function consumeImages(node) {
  const bgP = _bgPromise || prepareBgImage(node);
  const qrP = _qrPromise || prepareQrImage(node);
  const [bgImage, qrImage] = await Promise.all([bgP.catch(() => null), qrP.catch(() => null)]);

  // 背景每次都要换随机图：消费后立刻准备下一张（小程序码不变，无需刷新）
  _bgPromise = prepareBgImage(node);
  _bgPromise.catch(() => {});
  return { bgImage, qrImage };
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
async function downloadImage(fileID, timeoutMs = 10000) {
  if (!fileID) return null;
  try {
    let tempFilePath;
    if (fileID.startsWith('cloud://')) {
      const res = await withTimeout(
        wx.cloud.downloadFile({ fileID }),
        timeoutMs,
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
 * 按最大宽度将文本折成多行（中文按字符测量）
 * @returns {string[]} 行数组
 */
function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (let i = 0; i < text.length; i++) {
    const test = line + text[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = text[i];
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  // 未遍历完说明超行：剩余全部并入末行，超宽则截断加省略号
  const consumed = lines.join('').length + line.length;
  let rest = line;
  if (consumed < text.length) {
    rest += text.slice(consumed);
    while (rest.length > 1 && ctx.measureText(`${rest}…`).width > maxWidth) {
      rest = rest.slice(0, -1);
    }
    rest += '…';
  }
  if (rest) lines.push(rest);
  return lines.slice(0, maxLines);
}

/**
 * 以 cover 模式绘制图片：按目标比例居中裁切，不留白、不变形（适配任意图片比例）
 */
function drawCover(ctx, img, dx, dy, dw, dh) {
  const targetRatio = dw / dh;
  const imgRatio = img.width / img.height;
  let sw, sh, sx, sy;
  if (imgRatio > targetRatio) {
    // 图片更宽：裁切左右
    sh = img.height;
    sw = sh * targetRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    // 图片更高（如 569×1337）：裁切上下
    sw = img.width;
    sh = sw / targetRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * 核心绘制函数（Canvas 2D，即时绘制，无 ctx.draw）
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts
 *   streakDays, date, time, quote, bgImage(Image|null), qrImage(Image|null)
 */
function draw(ctx, opts) {
  const { streakDays, date, time, quote, bgImage, qrImage } = opts;

  // 1. 背景图（全幅 cover 裁切）
  if (bgImage) {
    drawCover(ctx, bgImage, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = BG_FALLBACK_COLOR;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // 2. 底部暗色渐变（保证文字和二维码可读）
  const grad = ctx.createLinearGradient(0, CANVAS_H * 0.45, 0, CANVAS_H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0.78)');
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
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 52px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('这是我坚持打卡的', 56, y);
  y += 76;

  // 主标题第二行「第 N 天」
  ctx.fillText(`第 ${streakDays} 天`, 56, y);
  y += 80;

  // 日期 + 打卡时间
  const dateStr = (date || '').replace(/-/g, '.');
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '400 26px sans-serif';
  ctx.fillText(time ? `${dateStr}  ${time}` : dateStr, 56, y);

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

  // 5. 底部励志语（二维码上方，最多两行，避开右侧二维码区）
  if (quote) {
    ctx.font = '400 27px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const maxWidth = CANVAS_W - 56 * 2;
    const lines = wrapText(ctx, quote, maxWidth, 2);
    const lineHeight = 40;
    // 底部留白基准：与二维码顶边对齐，两行向上排
    let quoteY = qrY - 20 - (lines.length - 1) * lineHeight;
    lines.forEach((ln) => {
      ctx.fillText(ln, 56, quoteY);
      quoteY += lineHeight;
    });
  }

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
 *   streakDays, date(YYYY-MM-DD), time(HH:mm), canvasId, componentContext
 * @returns {Promise<{tempFilePath:string}>}
 */
async function generatePoster(opts) {
  const { streakDays, date, time, canvasId, componentContext } = opts;
  const quote = pickRandom(QUOTES);
  console.log('[poster] 开始生成', { streakDays, date, time, quote, canvasId });

  // 1. Canvas 节点：优先复用预热时获取的常驻节点，否则当场查询
  if (!_canvasNode) {
    _canvasNode = await queryCanvasNode(canvasId || 'posterCanvas', componentContext);
  }
  if (!_canvasNode) throw new Error('未找到 canvas 节点');
  const canvasNode = _canvasNode;
  console.log('[poster] canvas 节点已获取');

  const ctx = canvasNode.getContext('2d');
  const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;

  // 2. 设置 canvas 实际像素尺寸（CSS 尺寸由 wxss 固定为 750×1330）
  canvasNode.width = CANVAS_W * dpr;
  canvasNode.height = CANVAS_H * dpr;
  ctx.scale(dpr, dpr);

  // 3. 取图片：预热已完成则零等待；未完成则等待在途请求，不会重复下载
  const { bgImage, qrImage } = await consumeImages(canvasNode);
  console.log('[poster] 图片就绪', { hasBg: !!bgImage, hasQr: !!qrImage });

  // 5. 即时绘制（每步兜底，防止个别 API 异常中断整条链路）
  try {
    draw(ctx, { streakDays, date, time, quote, bgImage, qrImage });
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
  preload,
  CANVAS_W,
  CANVAS_H,
};
