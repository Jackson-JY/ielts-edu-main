/**
 * 云存储图片加载工具
 * 统一管理云存储图片的临时 URL 获取
 */

const cloudStorage = require('./cloudStorage');

/**
 * 加载云存储图片临时 URL 并设置到页面 data
 * @param {Object} page - Page 实例
 * @param {string[]} fileIDs - 云存储文件 ID 数组
 * @param {Object} mapping - 文件ID到data字段的映射 { fileID: 'fieldName' }
 * @param {Function} setData - 页面 setData 方法
 */
async function loadCloudImages(page, fileIDs, mapping, setData) {
  try {
    const urlMap = await cloudStorage.getTempUrls(fileIDs);
    const data = {};
    
    for (const [fileID, fieldName] of Object.entries(mapping)) {
      data[fieldName] = urlMap[fileID] || '';
    }
    
    setData(data);
  } catch (e) {
    console.error(`[${page}] 加载图片 URL 失败`, e);
  }
}

/**
 * 创建页面图片加载器
 * @param {string} pageName - 页面名称（用于日志）
 * @param {Object} CLOUD_IMAGES - 云图片配置对象
 * @returns {Function} 图片加载函数
 */
function createImageLoader(pageName, CLOUD_IMAGES) {
  return async function(imageKeys, setData) {
    const fileIDs = imageKeys.map(key => CLOUD_IMAGES[key]).filter(Boolean);
    if (fileIDs.length === 0) return;
    
    try {
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      const data = {};
      
      for (const key of imageKeys) {
        const fileID = CLOUD_IMAGES[key];
        if (fileID) {
          // 将 'iconBook' 转换为 'iconBook' (保持原样)
          data[key] = urlMap[fileID] || '';
        }
      }
      
      setData(data);
    } catch (e) {
      console.error(`[${pageName}] 加载图片 URL 失败`, e);
    }
  };
}

module.exports = {
  loadCloudImages,
  createImageLoader,
};
