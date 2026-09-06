/**
 * ASR 语音转文字云函数 - 使用腾讯云 ASR API
 * 后台异步处理，将识别结果保存到数据库
 */

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

// 腾讯云 ASR 配置
const ASR_CONFIG = {
  host: 'asr.tencentcloudapi.com',
  service: 'asr',
  version: '2019-06-14',
  action: 'SentenceRecognition',
  region: 'ap-guangzhou',
  engSerViceType: '16k_en', // 引擎服务类型（注意：SentenceRecognition 接口使用 EngSerViceType，不是 EngineModelType）
  voiceFormat: 'wav',
};

// 生成腾讯云 API 签名
function generateSignature(payload, secretId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  
  // 构建规范请求
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const contentType = 'application/json';
  
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  
  const canonicalHeaders = `content-type:${contentType}\nhost:${ASR_CONFIG.host}\n`;
  const signedHeaders = 'content-type;host';
  
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  // 构建待签名字符串
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${ASR_CONFIG.service}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');
  
  // 计算签名
  const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
  const secretService = crypto.createHmac('sha256', secretDate).update(ASR_CONFIG.service).digest();
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  
  // 构建 Authorization
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return { authorization, timestamp, payloadHash };
}

// 调用腾讯云 ASR API
async function callTencentASR(audioBase64, secretId, secretKey) {
  return new Promise((resolve, reject) => {
    const payload = {
      VoiceFormat: ASR_CONFIG.voiceFormat,
      Data: audioBase64,
      DataLen: Buffer.from(audioBase64, 'base64').length,
      EngSerViceType: ASR_CONFIG.engSerViceType,  // 引擎服务类型
      SourceType: 1,  // 音频数据来源，1 表示直接上传音频数据
    };
    
    const { authorization, timestamp } = generateSignature(payload, secretId, secretKey);
    
    const options = {
      hostname: ASR_CONFIG.host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': ASR_CONFIG.host,
        'X-TC-Action': ASR_CONFIG.action,
        'X-TC-Version': ASR_CONFIG.version,
        'X-TC-Timestamp': timestamp,
        'X-TC-Region': ASR_CONFIG.region,
        'Authorization': authorization,
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.Response && result.Response.Result) {
            resolve(result.Response.Result);
          } else if (result.Response && result.Response.Error) {
            reject(new Error(result.Response.Error.Message));
          } else {
            reject(new Error('ASR API 返回异常'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

// 下载云存储文件并转为 Base64
async function downloadFileToBase64(fileID) {
  const res = await cloud.downloadFile({
    fileID: fileID,
  });
  return res.fileContent.toString('base64');
}

// 执行 ASR 识别（异步）
async function performASR(fileID, recordId, answerId) {
  const startTime = Date.now();
  
  try {
    // 从环境变量获取腾讯云密钥（注意：不能使用 TENCENTCLOUD_ 前缀）
    const secretId = process.env.ASR_SECRET_ID;
    const secretKey = process.env.ASR_SECRET_KEY;
    
    let recognizedText = '';
    
    if (secretId && secretKey) {
      // 使用真实 ASR API
      console.log(`[ASR] 开始识别 recordId=${recordId}, answerId=${answerId}`);
      
      // 下载音频文件
      const audioBase64 = await downloadFileToBase64(fileID);
      console.log(`[ASR] 音频下载完成，大小: ${audioBase64.length} bytes`);
      
      // 调用腾讯云 ASR
      recognizedText = await callTencentASR(audioBase64, secretId, secretKey);
      console.log(`[ASR] 识别结果: ${recognizedText}`);
    } else {
      // 未配置密钥，使用模拟数据
      console.log(`[ASR] 未配置腾讯云密钥，使用模拟数据 recordId=${recordId}`);
      
      const mockTexts = [
        "I really enjoy reading books because they allow me to explore different worlds and perspectives.",
        "My favorite type of books are mystery novels and science fiction.",
        "I prefer reading books over watching movies because books provide more detailed descriptions.",
        "Traveling is important because it broadens our horizons and helps us understand different cultures.",
      ];
      
      // 模拟处理时间
      await new Promise(resolve => setTimeout(resolve, 2000));
      recognizedText = mockTexts[Math.floor(Math.random() * mockTexts.length)];
    }

    const processTime = Date.now() - startTime;
    
    // 更新数据库中的识别结果
    const record = await db.collection('speaking_answers').doc(recordId).get();
    if (record.data) {
      const answers = record.data.answers || [];
      const answerIndex = answers.findIndex(a => a.id === answerId);
      
      if (answerIndex >= 0) {
        answers[answerIndex].transcribedText = recognizedText;
        answers[answerIndex].asrStatus = 'completed';
        answers[answerIndex].asrCompletedTime = new Date();
        answers[answerIndex].asrProcessTime = processTime;
        
        await db.collection('speaking_answers').doc(recordId).update({
          data: {
            answers: answers,
            lastUpdateTime: db.serverDate()
          }
        });
        
        console.log(`[ASR] 识别完成 recordId=${recordId}, answerId=${answerId}, 耗时=${processTime}ms`);
      }
    }
    
  } catch (error) {
    console.error('[ASR] 异步识别失败:', error);
    
    // 更新失败状态
    try {
      const record = await db.collection('speaking_answers').doc(recordId).get();
      if (record.data) {
        const answers = record.data.answers || [];
        const answerIndex = answers.findIndex(a => a.id === answerId);
        
        if (answerIndex >= 0) {
          answers[answerIndex].asrStatus = 'failed';
          answers[answerIndex].asrError = error.message;
          
          await db.collection('speaking_answers').doc(recordId).update({
            data: {
              answers: answers,
              lastUpdateTime: db.serverDate()
            }
          });
        }
      }
    } catch (dbError) {
      console.error('[ASR] 更新失败状态出错:', dbError);
    }
  }
}

exports.main = async (event, context) => {
  const { fileID, duration = 15, recordId, answerId } = event;
  
  if (!fileID) {
    return {
      success: false,
      error: '缺少文件ID参数'
    };
  }

  if (!recordId || !answerId) {
    return {
      success: false,
      error: '缺少 recordId 或 answerId 参数'
    };
  }

  try {
    // 立即返回，不等待识别完成
    // 启动异步识别任务
    performASR(fileID, recordId, answerId);
    
    return {
      success: true,
      message: '语音识别任务已启动',
      status: 'processing',
      recordId,
      answerId
    };

  } catch (error) {
    console.error('[ASR] 启动识别任务失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};