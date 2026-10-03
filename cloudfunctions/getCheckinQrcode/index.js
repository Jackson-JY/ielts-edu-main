/**
 * 云函数：getCheckinQrcode
 * 生成打卡海报用的小程序码，全局只生成一次并缓存到云存储
 * 调用：wx.cloud.callFunction({ name: 'getCheckinQrcode' })
 * 返回：{ success, fileID, cached }
 *
 * 出码链路（两级）：
 * 1. 云调用 cloud.openapi.wxacode.getUnlimited（免 AppSecret，需环境云调用授权）
 * 2. 降级：HTTPS 直调 getwxacodeunlimit（需环境变量 WX_APPSECRET，AppID 取 WX_APPID 或默认值）
 */
const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const QRCODE_PATH = 'poster/qrcode/checkin.png';
const SCENE = 'from=poster';
const PAGE = 'pages/home/home';
const APPID = process.env.WX_APPID || 'wxe6cdf8cc52f31608';

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request(new URL(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 用 stable_token + getwxacodeunlimit 直调微信接口出码
async function fetchQrcodeByHttps() {
  const secret = process.env.WX_APPSECRET;
  if (!secret) {
    throw new Error('缺少环境变量 WX_APPSECRET，无法使用 HTTPS 降级链路');
  }
  const tokenRes = await httpsPost('https://api.weixin.qq.com/cgi-bin/stable_token', {
    grant_type: 'client_credential',
    appid: APPID,
    secret,
  });
  const tokenData = JSON.parse(tokenRes.toString());
  if (!tokenData.access_token) {
    throw new Error(`获取 access_token 失败: ${tokenRes.toString().slice(0, 200)}`);
  }

  // check_path=false：不校验页面在线上版本是否存在（小程序未发布正式版也能出码）
  const img = await httpsPost(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${tokenData.access_token}`,
    { scene: SCENE, page: PAGE, width: 280, check_path: false, env_version: 'release' }
  );

  // 失败时微信返回 JSON（含 errcode），成功时返回图片二进制
  const head = img.slice(0, 1).toString();
  if (head === '{') {
    const err = JSON.parse(img.toString());
    throw new Error(`getwxacodeunlimit 失败: errcode=${err.errcode} ${err.errmsg || ''}`);
  }
  return img;
}

// 完整 fileID（含 bucket 段）——简写格式 cloud://ENV/path 在 downloadFile 中不可用
const CACHED_FILEID =
  'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/poster/qrcode/checkin.png';

exports.main = async () => {
  try {
    // 1. 先检查云存储中是否已缓存（管理端身份读，返回 base64 供前端直接出图）
    try {
      const buf = await cloud.downloadFile({ fileID: CACHED_FILEID });
      if (buf.fileContent && buf.fileContent.length) {
        return {
          success: true,
          fileID: CACHED_FILEID,
          cached: true,
          base64: buf.fileContent.toString('base64'),
        };
      }
    } catch (e) {
      // 文件不存在，继续生成
    }

    // 2. 云调用出码；失败降级 HTTPS
    let buffer = null;
    try {
      const result = await cloud.openapi.wxacode.getUnlimited({
        scene: SCENE,
        page: PAGE,
        width: 280,
        checkPath: false,
        autoColor: false,
        lineColor: { r: 0, g: 0, b: 0 },
        isHyaline: false,
      });
      buffer = result.buffer;
      console.log('[getCheckinQrcode] 云调用出码成功');
    } catch (openApiErr) {
      console.warn('[getCheckinQrcode] 云调用失败，降级 HTTPS:', openApiErr.errMsg || openApiErr.message);
      buffer = await fetchQrcodeByHttps();
      console.log('[getCheckinQrcode] HTTPS 出码成功');
    }

    if (!buffer || !buffer.length) {
      return { success: false, error: '小程序码生成失败：无有效 buffer' };
    }

    // 3. 上传到云存储缓存
    const uploadRes = await cloud.uploadFile({
      cloudPath: QRCODE_PATH,
      fileContent: buffer,
    });

    return {
      success: true,
      fileID: uploadRes.fileID,
      cached: false,
      base64: buffer.toString('base64'),
    };
  } catch (e) {
    console.error('[getCheckinQrcode] 失败', e);
    return { success: false, error: e.message || '生成小程序码失败' };
  }
};
