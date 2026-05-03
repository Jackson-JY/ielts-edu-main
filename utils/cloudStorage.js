/**
 * 云存储工具函数
 * 用于获取云存储文件的临时 URL
 */

const app = getApp();

/**
 * 获取云存储文件临时 URL
 * @param {string} fileID - 云存储文件 ID (cloud://...)
 * @returns {Promise<string>} 临时 URL
 */
const getTempUrl = async (fileID) => {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return fileID;
  }
  
  try {
    const res = await wx.cloud.getTempFileURL({
      fileList: [fileID],
    });
    if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
      return res.fileList[0].tempFileURL;
    }
    return fileID;
  } catch (e) {
    console.error('[getTempUrl] 获取临时链接失败', e);
    return fileID;
  }
};

/**
 * 批量获取云存储文件临时 URL
 * @param {string[]} fileIDs - 云存储文件 ID 数组
 * @returns {Promise<Object>} 文件 ID 到临时 URL 的映射
 */
const getTempUrls = async (fileIDs) => {
  if (!fileIDs || fileIDs.length === 0) {
    return {};
  }
  
  const cloudFileIDs = fileIDs.filter(id => id && id.startsWith('cloud://'));
  if (cloudFileIDs.length === 0) {
    return fileIDs.reduce((acc, id) => {
      acc[id] = id;
      return acc;
    }, {});
  }
  
  try {
    const res = await wx.cloud.getTempFileURL({
      fileList: cloudFileIDs,
    });
    
    console.log('[getTempUrls] getTempFileURL response:', res);
    
    const urlMap = {};
    res.fileList.forEach(item => {
      console.log('[getTempUrls] fileItem:', item.fileID, '->', item.tempFileURL, 'status:', item.status, 'errMsg:', item.errMsg);
      if (item.tempFileURL) {
        urlMap[item.fileID] = item.tempFileURL;
      } else {
        // 获取失败，使用空字符串避免渲染错误
        urlMap[item.fileID] = '';
        console.error('[getTempUrls] 获取临时链接失败:', item.fileID, item.errMsg);
      }
    });
    
    return urlMap;
  } catch (e) {
    console.error('[getTempUrls] 获取临时链接失败', e);
    return fileIDs.reduce((acc, id) => {
      acc[id] = id;
      return acc;
    }, {});
  }
};

/**
 * 上传文件到云存储
 * @param {string} filePath - 本地文件路径
 * @param {string} cloudPath - 云存储路径
 * @returns {Promise<string>} 云存储文件 ID
 */
const uploadFile = async (filePath, cloudPath) => {
  try {
    const res = await wx.cloud.uploadFile({
      cloudPath,
      filePath,
    });
    return res.fileID;
  } catch (e) {
    throw e;
  }
};

module.exports = {
  getTempUrl,
  getTempUrls,
  uploadFile,
};
