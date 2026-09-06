const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const WebSocket = require('ws');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ======================== 新版 SOE WebSocket 签名 ========================
// 签名算法：HMAC-SHA1 + Base64
// 签名原文：soe.cloud.tencent.com/soe/api/<appid>?key1=value1&key2=value2...
//          （参数按 key 字典序排序，value 不 urlencode）
// 实际请求 URL：key/value 都 urlencode，signature 也 urlencode

function hmacSha1Base64(key, data) {
  return crypto.createHmac('sha1', key).update(data).digest('base64');
}

/**
 * 生成新版 SOE WebSocket 的签名 URL
 */
function buildSoeUrl(appId, secretId, secretKey, refText, voiceId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const expired = timestamp + 60;
  const nonce = Math.floor(Math.random() * 1e10);

  // 所有参数（除 signature 外）
  const params = {
    secretid: secretId,
    timestamp: String(timestamp),
    expired: String(expired),
    nonce: String(nonce),
    server_engine_type: '16k_en', // 英文标准版
    voice_id: voiceId,
    ref_text: refText, // 参考文本
    eval_mode: '1', // 句子模式
    score_coeff: '3.5', // 成人评分苛刻度
    voice_format: '1', // 1:wav (新版取值: 0:pcm, 1:wav, 2:mp3, 4:speex)
    rec_mode: '0', // 0:实时流式模式
  };

  // 按 key 字典序排序
  const sortedKeys = Object.keys(params).sort();

  // 签名原文：value 不 urlencode
  const signQuery = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  const signStr = `soe.cloud.tencent.com/soe/api/${appId}?${signQuery}`;

  // HMAC-SHA1 + Base64
  const signature = hmacSha1Base64(secretKey, signStr);

  // 实际请求 URL：key/value 都 urlencode，signature 也 urlencode
  const reqQuery = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  const url = `wss://soe.cloud.tencent.com/soe/api/${appId}?${reqQuery}&signature=${encodeURIComponent(signature)}`;

  return url;
}

// ======================== WebSocket 调用 SOE ========================

/**
 * 调用新版 SOE WebSocket 接口进行发音评测
 * @param {Buffer} audioBuffer 音频二进制数据
 * @param {string} appId 腾讯云 AppID
 * @param {string} secretId
 * @param {string} secretKey
 * @param {string} refText 参考文本
 * @returns {Promise<object>} 评测结果
 */
function callSoeWebSocket(audioBuffer, appId, secretId, secretKey, refText) {
  return new Promise((resolve, reject) => {
    const voiceId = `soe_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const url = buildSoeUrl(appId, secretId, secretKey, refText, voiceId);

    const ws = new WebSocket(url);
    let finalResult = null;
    let timeoutHandle = null;

    // 超时保护
    timeoutHandle = setTimeout(() => {
      ws.terminate();
      reject(new Error('SOE 评测超时（30s）'));
    }, 30000);

    ws.on('open', async () => {
      console.log('[soeEvaluate] WebSocket 连接成功，音频大小:', audioBuffer.length, 'bytes');

      // 流式模式：控制发送速率，每 50ms 发送一片（16kHz 16bit 单声道 = 1600 字节/50ms）
      const chunkSize = 1600;
      for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        const chunk = audioBuffer.slice(i, i + chunkSize);
        ws.send(chunk, { binary: true });
        await new Promise((r) => setTimeout(r, 50));
      }
      // 发送结束信号：文本消息 {"type":"end"}
      ws.send(JSON.stringify({ type: 'end' }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.code !== 0) {
          ws.terminate();
          clearTimeout(timeoutHandle);
          reject(new Error(`SOE 错误 [${msg.code}]: ${msg.message}`));
          return;
        }

        // 保存最新结果
        if (msg.result) {
          finalResult = msg.result;
        }

        // final=1 表示评测结束
        if (msg.final === 1) {
          ws.close();
          clearTimeout(timeoutHandle);
          resolve(finalResult);
        }
      } catch (e) {
        // 非 JSON 消息忽略
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`WebSocket 错误: ${err.message}`));
    });

    ws.on('close', () => {
      clearTimeout(timeoutHandle);
      if (finalResult) {
        resolve(finalResult);
      } else {
        reject(new Error('连接关闭但未收到评测结果'));
      }
    });
  });
}

// ======================== 工具函数 ========================
function normalizeEvent(event) {
  if (event && typeof event === 'object' && event.body) {
    try {
      const parsed = JSON.parse(event.body);
      return { ...event, ...parsed };
    } catch (e) {
      return event;
    }
  }
  return event;
}

// ======================== 主入口 ========================
exports.main = async (event) => {
  const params = normalizeEvent(event);
  const { fileID, refText } = params;

  if (!fileID || !refText) {
    return { success: false, error: '缺少 fileID 或 refText 参数' };
  }

  // 从环境变量读取腾讯云密钥
  const appId = process.env.TENCENT_APP_ID;
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!appId || !secretId || !secretKey) {
    return {
      success: false,
      error:
        '未配置腾讯云密钥，请在云函数环境变量中设置 TENCENT_APP_ID、TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY',
    };
  }

  try {
    // 1. 从 CloudBase 存储下载音频
    const fileRes = await cloud.downloadFile({ fileID });
    const audioBuffer = fileRes.fileContent;
    console.log('[soeEvaluate] 音频下载成功，大小:', audioBuffer.length, 'bytes');

    // 2. 调用新版 SOE WebSocket 接口
    const result = await callSoeWebSocket(audioBuffer, appId, secretId, secretKey, refText);

    // 3. 提取评分结果并转为百分制
    // SOE 原始分：PronAccuracy 0-10，PronFluency 0-1，PronCompletion 0-1，SuggestedScore 0-10
    // 单词级 PronAccuracy 已经是 0-100 范围
    const words = (result.Words || []).map((w) => ({
      word: w.Word,
      pronAccuracy: Math.round(w.PronAccuracy ?? 0),
      matchTag: w.MatchTag,
    }));

    // 转为百分制并四舍五入
    const pronAccuracy = Math.round((result.PronAccuracy ?? 0) * 10);
    const pronFluency = Math.round((result.PronFluency ?? 0) * 100);
    const pronCompletion = Math.round((result.PronCompletion ?? 0) * 100);
    const suggestedScore = Math.round((result.SuggestedScore ?? 0) * 10);

    return {
      success: true,
      result: {
        pronAccuracy,
        pronFluency,
        pronCompletion,
        suggestedScore,
        wordCount: words.length,
        words,
        refText,
      },
    };
  } catch (err) {
    console.error('[soeEvaluate] error:', err);
    return { success: false, error: err.message || 'SOE 评测失败' };
  }
};
