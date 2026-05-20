/**
 * 云函数：发送打卡提醒订阅消息
 * 定时任务：每天每分钟执行一次，检查是否有需要发送的提醒
 * 
 * 触发方式：
 * 1. 定时触发器：每分钟执行（由 cloudbaserc.json 配置）
 * 2. 手动调用：wx.cloud.callFunction({ name: 'sendCheckinReminder' })
 */
const cloud = require('wx-server-sdk');
const cloudDB = require('./cloudDB'); // 复用云数据库工具

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 获取今天是星期几
 * @returns {string} monday, tuesday, wednesday, thursday, friday, saturday, sunday
 */
function getWeekday() {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return weekdays[new Date().getDay()];
}

/**
 * 检查当前时间是否匹配提醒时间（精确到分钟）
 * @param {string} reminderTime - 提醒时间，格式 HH:mm
 * @returns {boolean}
 */
function shouldSendReminder(reminderTime) {
  if (!reminderTime) return false;
  
  const now = new Date();
  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMinute = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;
  
  return currentTime === reminderTime;
}

/**
 * 检查今天是佛应该发送提醒（根据频次设置）
 * @param {string[]} frequency - 提醒频次数组，如 ['monday', 'wednesday', 'friday']
 * @returns {boolean}
 */
function shouldSendToday(frequency) {
  if (!frequency || frequency.length === 0) return true; // 空数组表示每天
  
  const today = getWeekday();
  return frequency.includes(today);
}

/**
 * 发送订阅消息
 * @param {string} openid - 用户openid
 * @param {string} templateId - 模板消息ID
 * @param {object} data - 模板数据
 */
async function sendSubscribeMessage(openid, templateId, data) {
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: templateId,
      page: 'pages/profile/profile',
      data: data,
    });
    return { success: true, result };
  } catch (error) {
    console.error('[发送订阅消息失败]', error);
    return { success: false, error: error.message || error };
  }
}

/**
 * 获取用户的 openid
 */
function getOpenId() {
  return cloud.getWXContext().OPENID;
}

exports.main = async (event, context) => {
  const openid = getOpenId();
  const currentTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  
  console.log(`[打卡提醒] 开始执行，当前时间: ${currentTime}`);
  console.log(`[打卡提醒] 调用者openid: ${openid}`);
  
  // 如果是手动调用且传入了参数，可以直接发送给指定用户
  if (event.targetOpenid) {
    return await sendReminderToUser(event.targetOpenid);
  }
  
  // 定时任务：查询所有需要发送提醒的用户
  return await processAllUsers();
};

/**
 * 处理所有用户，检查是否需要发送提醒
 */
async function processAllUsers() {
  try {
    // 1. 查询所有启用了提醒的用户
    const { data: reminderSettings } = await db.collection('reminder_settings')
      .where({
        enabled: true,
      })
      .get();
    
    if (!reminderSettings || reminderSettings.length === 0) {
      console.log('[打卡提醒] 没有启用提醒的用户');
      return { success: true, message: '没有需要发送的提醒' };
    }
    
    const today = getWeekday();
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    
    console.log(`[打卡提醒] 今天是 ${today}，当前时间 ${currentTimeStr}，共 ${reminderSettings.length} 个用户开启了提醒`);
    
    const results = [];
    const sendResults = [];
    
    // 2. 遍历每个用户的提醒设置
    for (const setting of reminderSettings) {
      const { _id, frequency, time, subjects, frequencyLabel, subjectLabels } = setting;
      
      // 检查今天是否应该发送
      if (!shouldSendToday(frequency)) {
        console.log(`[打卡提醒] 用户 ${_id} 今天(${today})不需要提醒`);
        continue;
      }
      
      // 检查时间是否匹配
      if (!shouldSendReminder(time)) {
        console.log(`[打卡提醒] 用户 ${_id} 的提醒时间 ${time} 不匹配当前时间 ${currentTimeStr}`);
        continue;
      }
      
      // 3. 获取该用户的 openid
      let userOpenid = setting.openid;
      if (!userOpenid) {
        // 尝试从 users 表获取
        try {
          const userRes = await db.collection('users').where({ _id: setting.userId || setting._id }).get();
          if (userRes.data && userRes.data.length > 0) {
            userOpenid = userRes.data[0].openid;
          }
        } catch (e) {
          console.error(`[打卡提醒] 获取用户openid失败`, e);
        }
      }
      
      if (!userOpenid) {
        console.log(`[打卡提醒] 用户 ${_id} 没有openid，跳过`);
        continue;
      }
      
      // 4. 构建提醒内容
      const subjectText = subjectLabels?.join('、') || '学习任务';
      const reminderContent = `今天记得完成${subjectText}打卡哦！`;
      
      // 5. 发送订阅消息
      // 注意：需要在小程序后台配置订阅消息模板
      // 模板ID需要替换为实际的模板ID
      const templateId = 'YOUR_TEMPLATE_ID'; // TODO: 替换为实际的模板ID
      
      const messageData = {
        phrase1: { value: subjectText }, // 提醒科目
        date2: { value: new Date().toLocaleDateString('zh-CN') }, // 日期
        thing3: { value: reminderContent }, // 提醒内容
        time4: { value: time }, // 提醒时间
      };
      
      const sendResult = await sendSubscribeMessage(userOpenid, templateId, messageData);
      
      sendResults.push({
        userId: _id,
        openid: userOpenid,
        time: time,
        result: sendResult,
      });
      
      // 记录发送日志
      await logReminderSent(_id, userOpenid, setting);
      
      console.log(`[打卡提醒] 已发送给用户 ${_id}, 结果:`, JSON.stringify(sendResult));
    }
    
    return {
      success: true,
      today,
      currentTime: `${currentHour}:${currentMinute}`,
      totalUsers: reminderSettings.length,
      sentCount: sendResults.length,
      results: sendResults,
    };
    
  } catch (error) {
    console.error('[打卡提醒] 执行失败', error);
    return {
      success: false,
      error: error.message || error,
    };
  }
}

/**
 * 向指定用户发送提醒
 */
async function sendReminderToUser(targetOpenid) {
  try {
    // 查询该用户的提醒设置
    const { data: settings } = await db.collection('reminder_settings')
      .where({
        enabled: true,
        openid: targetOpenid,
      })
      .get();
    
    if (!settings || settings.length === 0) {
      return { success: false, message: '该用户未启用提醒或设置不存在' };
    }
    
    const setting = settings[0];
    const { frequency, time, subjects, subjectLabels } = setting;
    
    // 检查今天是否应该发送
    if (!shouldSendToday(frequency)) {
      return { success: false, message: '今天不在提醒频次内' };
    }
    
    const subjectText = subjectLabels?.join('、') || '学习任务';
    const reminderContent = `今天记得完成${subjectText}打卡哦！`;
    
    const templateId = 'YOUR_TEMPLATE_ID'; // TODO: 替换为实际的模板ID
    
    const messageData = {
      phrase1: { value: subjectText },
      date2: { value: new Date().toLocaleDateString('zh-CN') },
      thing3: { value: reminderContent },
      time4: { value: time },
    };
    
    const result = await sendSubscribeMessage(targetOpenid, templateId, messageData);
    
    return {
      success: result.success,
      message: result.success ? '发送成功' : '发送失败',
      result,
    };
    
  } catch (error) {
    console.error('[打卡提醒] 发送给指定用户失败', error);
    return {
      success: false,
      error: error.message || error,
    };
  }
}

/**
 * 记录提醒发送日志
 */
async function logReminderSent(userId, openid, setting) {
  try {
    await db.collection('reminder_logs').add({
      data: {
        userId: userId,
        openid: openid,
        subjects: setting.subjects || [],
        subjectLabels: setting.subjectLabels || [],
        frequency: setting.frequency || [],
        frequencyLabel: setting.frequencyLabel || '',
        time: setting.time,
        sentAt: new Date(),
        createdAt: db.serverDate(),
      }
    });
  } catch (e) {
    console.error('[打卡提醒] 记录日志失败', e);
  }
}
