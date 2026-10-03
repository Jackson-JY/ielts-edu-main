/**
 * 云函数：getCheckinQrcode
 * 生成打卡海报用的小程序码，全局只生成一次并缓存到云存储
 * 调用：wx.cloud.callFunction({ name: 'getCheckinQrcode' })
 * 返回：{ success, fileID }
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const QRCODE_PATH = 'poster/qrcode/checkin.png';
const SCENE = 'from=poster';
const PAGE = 'pages/home/home';

exports.main = async () => {
  try {
    // 1. 先检查云存储中是否已缓存
    try {
      const listRes = await cloud.getTempFileURL({
        fileList: [`cloud://${cloud.DYNAMIC_CURRENT_ENV}/${QRCODE_PATH}`],
      });
      const item = listRes.fileList && listRes.fileList[0];
      if (item && item.status === 0 && item.tempFileURL) {
        return {
          success: true,
          fileID: `cloud://${cloud.DYNAMIC_CURRENT_ENV}/${QRCODE_PATH}`,
          cached: true,
        };
      }
    } catch (e) {
      // 文件不存在，继续生成
    }

    // 2. 调用 wxacode.getUnlimited 生成小程序码
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: SCENE,
      page: PAGE,
      width: 280,
      autoColor: false,
      lineColor: { r: 0, g: 0, b: 0 },
      isHyaline: false,
    });

    if (!result.buffer) {
      return { success: false, error: '小程序码生成失败：无 buffer 返回' };
    }

    // 3. 上传到云存储缓存
    const uploadRes = await cloud.uploadFile({
      cloudPath: QRCODE_PATH,
      fileContent: result.buffer,
    });

    return {
      success: true,
      fileID: uploadRes.fileID,
      cached: false,
    };
  } catch (e) {
    console.error('[getCheckinQrcode] 失败', e);
    // 41003 等场景值错误时返回明确信息
    return { success: false, error: e.message || '生成小程序码失败' };
  }
};
