/**
 * 上传图片到云存储脚本
 * 
 * 使用方式：
 * 1. 在微信开发者工具控制台运行
 * 2. 或作为云函数调用
 * 
 * 需要上传的大图片列表：
 * - default-avatar.png (875K)
 * - icon-calendar.png (395K)
 * - icon-chart.png (237K)
 * - icon-check.png (259K)
 * - icon-document.png (307K)
 * - icon-fire.png (255K)
 * - icon-settings.png (341K)
 * - icon-target.png (362K)
 * - icon-user.png (314K)
 */

const fs = wx.getFileSystemManager();
const IMAGES_TO_UPLOAD = [
  { local: 'images/default-avatar.png', cloud: 'images/default-avatar.png' },
  { local: 'images/icon-calendar.png', cloud: 'images/icon-calendar.png' },
  { local: 'images/icon-chart.png', cloud: 'images/icon-chart.png' },
  { local: 'images/icon-check.png', cloud: 'images/icon-check.png' },
  { local: 'images/icon-document.png', cloud: 'images/icon-document.png' },
  { local: 'images/icon-fire.png', cloud: 'images/icon-fire.png' },
  { local: 'images/icon-settings.png', cloud: 'images/icon-settings.png' },
  { local: 'images/icon-target.png', cloud: 'images/icon-target.png' },
  { local: 'images/icon-user.png', cloud: 'images/icon-user.png' },
];

async function uploadImages() {
  console.log('开始上传图片到云存储...');
  
  const results = [];
  
  for (const item of IMAGES_TO_UPLOAD) {
    try {
      // 读取本地文件
      const fileData = fs.readFileSync(item.local);
      
      // 上传到云存储
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: item.cloud,
        filePath: `${wx.env.USER_DATA_PATH}/${item.local}`,
      });
      
      console.log(`✅ 上传成功: ${item.local} -> ${uploadRes.fileID}`);
      results.push({ success: true, local: item.local, fileID: uploadRes.fileID });
    } catch (e) {
      console.error(`❌ 上传失败: ${item.local}`, e);
      results.push({ success: false, local: item.local, error: e.message });
    }
  }
  
  console.log('\n上传完成！');
  console.log('成功:', results.filter(r => r.success).length);
  console.log('失败:', results.filter(r => !r.success).length);
  
  return results;
}

// 导出供外部调用
module.exports = { uploadImages };

// 如果在控制台直接运行
if (typeof window !== 'undefined') {
  uploadImages();
}
