/**
 * 云函数：迁移 homework 集合数据到新格式
 * 调用方式：
 * wx.cloud.callFunction({
 *   name: 'migrateHomework',
 *   data: { dryRun: true } // dryRun: true 只预览不执行
 * })
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { dryRun = true } = event;
  
  try {
    // 获取所有 homework 记录
    const { data: homeworkList } = await db.collection('homework').get();
    
    const updates = [];
    const errors = [];
    
    for (const hw of homeworkList) {
      const updateData = {};
      let needsUpdate = false;
      
      // 1. type -> subject 映射
      if (hw.type && !hw.subject) {
        const typeMap = {
          'listening': '听力',
          'reading': '阅读',
          'writing': '写作',
          'speaking': '口语',
        };
        updateData.subject = typeMap[hw.type] || hw.type;
        needsUpdate = true;
      }
      
      // 2. submitted -> status 映射
      if (hw.submitted !== undefined && !hw.status) {
        updateData.status = hw.submitted ? 'completed' : 'pending';
        needsUpdate = true;
      }
      
      // 3. date -> assignedAt 映射
      if (hw.date && !hw.assignedAt) {
        updateData.assignedAt = new Date(hw.date);
        needsUpdate = true;
      }
      
      // 4. content -> description 映射（如果 description 为空）
      if (hw.content && !hw.description) {
        updateData.description = hw.content;
        needsUpdate = true;
      }
      
      // 5. 确保有 status 字段
      if (!hw.status && hw.submitted === undefined) {
        updateData.status = 'pending';
        needsUpdate = true;
      }
      
      // 6. 确保有 subject 字段
      if (!hw.subject && !hw.type) {
        updateData.subject = '综合';
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        updates.push({
          id: hw._id,
          title: hw.title,
          updates: updateData
        });
        
        if (!dryRun) {
          try {
            await db.collection('homework').doc(hw._id).update({
              data: updateData
            });
          } catch (e) {
            errors.push({ id: hw._id, error: e.message });
          }
        }
      }
    }
    
    return {
      success: true,
      dryRun,
      total: homeworkList.length,
      toUpdate: updates.length,
      updates: updates.slice(0, 20), // 只返回前20条预览
      errors: errors.slice(0, 10),
      message: dryRun 
        ? `预览模式：共 ${homeworkList.length} 条记录，${updates.length} 条需要更新`
        : `迁移完成：共 ${homeworkList.length} 条记录，${updates.length} 条已更新，${errors.length} 条失败`
    };
    
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
};
