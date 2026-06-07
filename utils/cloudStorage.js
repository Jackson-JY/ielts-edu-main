const TEMP_URL_CACHE_KEY = 'cloudTempUrlCache';
const TEMP_URL_TTL = 50 * 60 * 1000;
let memoryCache = null;

const canUseStorage = () => typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync;

const loadCache = () => {
  if (memoryCache) return memoryCache;

  try {
    memoryCache = canUseStorage() ? (wx.getStorageSync(TEMP_URL_CACHE_KEY) || {}) : {};
  } catch (e) {
    memoryCache = {};
  }

  return memoryCache;
};

const saveCache = (cache) => {
  memoryCache = cache;

  try {
    if (canUseStorage()) {
      wx.setStorageSync(TEMP_URL_CACHE_KEY, cache);
    }
  } catch (e) {
    // 缓存失败不影响图片加载
  }
};

const getCachedUrl = (fileID) => {
  const cached = loadCache()[fileID];
  if (!cached || !cached.url || !cached.expiresAt) return '';
  if (cached.expiresAt <= Date.now()) return '';
  return cached.url;
};

const cacheUrl = (fileID, url) => {
  if (!fileID || !url) return;

  const cache = loadCache();
  cache[fileID] = {
    url,
    expiresAt: Date.now() + TEMP_URL_TTL,
  };
  saveCache(cache);
};

const resolveUrl = (urlMap, id) => {
  if (Object.prototype.hasOwnProperty.call(urlMap, id)) {
    return urlMap[id];
  }
  return id;
};

/**
 * 云存储工具函数
 * @param {string} fileID - 云存储文件 ID (cloud://...)
 * @returns {Promise<string>} 临时 URL
 */
const getTempUrl = async (fileID) => {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return fileID;
  }

  const cachedUrl = getCachedUrl(fileID);
  if (cachedUrl) return cachedUrl;
  
  try {
    const res = await wx.cloud.getTempFileURL({
      fileList: [fileID],
    });
    if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
      const tempUrl = res.fileList[0].tempFileURL;
      cacheUrl(fileID, tempUrl);
      return tempUrl;
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

  const urlMap = {};
  
  const cloudFileIDs = fileIDs.filter(id => id && id.startsWith('cloud://'));
  if (cloudFileIDs.length === 0) {
    return fileIDs.reduce((acc, id) => {
      acc[id] = id;
      return acc;
    }, {});
  }

  const uniqueCloudFileIDs = [...new Set(cloudFileIDs)];
  const missingFileIDs = uniqueCloudFileIDs.filter(fileID => {
    const cachedUrl = getCachedUrl(fileID);
    if (cachedUrl) {
      urlMap[fileID] = cachedUrl;
      return false;
    }
    return true;
  });

  if (missingFileIDs.length === 0) {
    return fileIDs.reduce((acc, id) => {
      acc[id] = resolveUrl(urlMap, id);
      return acc;
    }, {});
  }
  
  try {
    const res = await wx.cloud.getTempFileURL({
      fileList: missingFileIDs,
    });

    res.fileList.forEach(item => {
      if (item.tempFileURL) {
        urlMap[item.fileID] = item.tempFileURL;
        cacheUrl(item.fileID, item.tempFileURL);
      } else {
        // 获取失败，使用空字符串避免渲染错误
        urlMap[item.fileID] = '';
        console.error('[getTempUrls] 获取临时链接失败:', item.fileID, item.errMsg);
      }
    });
    
    return fileIDs.reduce((acc, id) => {
      acc[id] = resolveUrl(urlMap, id);
      return acc;
    }, {});
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
