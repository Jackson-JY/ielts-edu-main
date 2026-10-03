/**
 * ASR 语音转文字云函数 - 腾讯云一句话识别 / 录音文件识别
 *
 * 同步执行：在本次函数调用内完成「取临时链接 → 提交识别 → 拿到文本 → 回写数据库」并返回结果，
 * 不能在 main 返回后再跑异步任务（SCF 返回响应后实例会被冻结，后台任务会被中断）。
 *
 * 短音频（≤55s）走 SentenceRecognition；长音频（>55s，最长 120s）走
 * CreateRecTask + DescribeTaskStatus 轮询。
 * 音频统一用云存储临时 HTTPS URL 传给腾讯云，避免 base64 体积超限。
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
  region: 'ap-guangzhou',
  // 一句话识别引擎：16kHz 英文
  engSerViceType: '16k_en',
  // 录音文件识别引擎：16kHz 英文（注意两个接口字段名不同）
  engineModelType: '16k_en',
  voiceFormat: 'wav',
  // 一句话识别最长支持 60s，预留余量
  sentenceMaxSeconds: 55,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 生成腾讯云 TC3-HMAC-SHA256 签名
function generateSignature(payload, secretId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];

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
    payloadHash,
  ].join('\n');

  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${ASR_CONFIG.service}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
  const secretService = crypto.createHmac('sha256', secretDate).update(ASR_CONFIG.service).digest();
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, timestamp };
}

// 调用腾讯云 ASR API（JSON 签名 v3，动作通过 X-TC-Action 指定）
function callTencentApi(action, params, secretId, secretKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const { authorization, timestamp } = generateSignature(params, secretId, secretKey);

    const options = {
      hostname: ASR_CONFIG.host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: ASR_CONFIG.host,
        'X-TC-Action': action,
        'X-TC-Version': ASR_CONFIG.version,
        'X-TC-Timestamp': timestamp,
        'X-TC-Region': ASR_CONFIG.region,
        Authorization: authorization,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let result;
        try {
          result = JSON.parse(data);
        } catch (e) {
          reject(new Error(`ASR 接口返回非 JSON：${data.slice(0, 200)}`));
          return;
        }
        if (result.Response && result.Response.Error) {
          reject(new Error(`${result.Response.Error.Code}: ${result.Response.Error.Message}`));
          return;
        }
        resolve(result.Response);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 取云存储文件的临时 HTTPS URL
async function getTempUrl(fileID) {
  const res = await cloud.getTempFileURL({ fileList: [fileID] });
  const item = res.fileList && res.fileList[0];
  if (!item || item.status !== 0 || !item.tempFileURL) {
    throw new Error(`获取云存储临时链接失败：${(item && item.errMsg) || 'unknown'}`);
  }
  return item.tempFileURL;
}

// 短音频：一句话识别（≤60s）
async function recognizeSentence(url, secretId, secretKey) {
  const resp = await callTencentApi(
    'SentenceRecognition',
    {
      EngSerViceType: ASR_CONFIG.engSerViceType,
      SourceType: 0, // 0=音频 URL
      VoiceFormat: ASR_CONFIG.voiceFormat,
      Url: url,
      DataLen: 0, // URL 方式无需传长度
    },
    secretId,
    secretKey
  );
  return resp.Result || '';
}

// 长音频：提交录音文件识别任务
async function createRecognitionTask(url, secretId, secretKey) {
  const resp = await callTencentApi(
    'CreateRecTask',
    {
      EngineModelType: ASR_CONFIG.engineModelType,
      ChannelNum: 1,
      SpeakerDiarization: 0,
      SourceType: 0, // 0=音频 URL
      VoiceFormat: ASR_CONFIG.voiceFormat,
      Url: url,
      DataLen: 0,
    },
    secretId,
    secretKey
  );
  if (!resp.Data || !resp.Data.TaskId) {
    throw new Error('CreateRecTask 未返回 TaskId');
  }
  return resp.Data.TaskId;
}

// 长音频：轮询任务结果，Status 1=等待/进行 2=成功 3=失败
async function pollRecognitionTask(taskId, secretId, secretKey) {
  const MAX_WAIT_MS = 45000;
  const INTERVAL_MS = 2000;
  const startedAt = Date.now();

  for (;;) {
    const resp = await callTencentApi(
      'DescribeTaskStatus',
      { TaskId: taskId },
      secretId,
      secretKey
    );
    const data = resp.Data || {};
    if (data.Status === 2) {
      const slices = Array.isArray(data.Result) ? data.Result : [];
      return slices
        .map((item) => item.Text || item.SliceText || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (data.Status === 3) {
      throw new Error(data.ErrorMsg || '录音文件识别失败');
    }
    if (Date.now() - startedAt >= MAX_WAIT_MS) {
      throw new Error('语音识别超时，请稍后重试');
    }
    await sleep(INTERVAL_MS);
  }
}

// 回写识别结果到 speaking_answers（记录/答案不存在时静默跳过，不影响识别结果返回）
async function writeAnswerResult(recordId, answerId, patch) {
  let record;
  try {
    record = await db.collection('speaking_answers').doc(recordId).get();
  } catch (e) {
    console.warn(`[ASR] 记录 ${recordId} 不存在，跳过回写`);
    return;
  }
  if (!record.data) return;
  const answers = record.data.answers || [];
  const answerIndex = answers.findIndex((a) => a.id === answerId);
  if (answerIndex < 0) return;
  Object.assign(answers[answerIndex], patch);
  await db.collection('speaking_answers').doc(recordId).update({
    data: {
      answers,
      lastUpdateTime: db.serverDate(),
    },
  });
}

exports.main = async (event) => {
  const { fileID, duration = 15, recordId, answerId } = event;

  if (!fileID) {
    return { success: false, error: '缺少文件ID参数' };
  }
  if (!recordId || !answerId) {
    return { success: false, error: '缺少 recordId 或 answerId 参数' };
  }

  // 与 soeEvaluate 复用同一套已配置的密钥，同时兼容旧命名
  const secretId = process.env.TENCENT_SECRET_ID || process.env.ASR_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY || process.env.ASR_SECRET_KEY;
  if (!secretId || !secretKey) {
    const error = '未配置腾讯云密钥，请在云函数环境变量中设置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY';
    await writeAnswerResult(recordId, answerId, {
      asrStatus: 'failed',
      asrError: error,
    }).catch(() => {});
    return { success: false, error };
  }

  const startTime = Date.now();
  try {
    console.log(`[ASR] 开始识别 recordId=${recordId}, answerId=${answerId}, duration=${duration}s`);
    const audioUrl = await getTempUrl(fileID);

    let recognizedText = '';
    if (duration && duration > ASR_CONFIG.sentenceMaxSeconds) {
      console.log('[ASR] 长音频，走 CreateRecTask');
      const taskId = await createRecognitionTask(audioUrl, secretId, secretKey);
      await sleep(2000);
      recognizedText = await pollRecognitionTask(taskId, secretId, secretKey);
    } else {
      console.log('[ASR] 短音频，走 SentenceRecognition');
      recognizedText = await recognizeSentence(audioUrl, secretId, secretKey);
    }

    const processTime = Date.now() - startTime;
    await writeAnswerResult(recordId, answerId, {
      transcribedText: recognizedText,
      asrStatus: 'completed',
      asrCompletedTime: new Date(),
      asrProcessTime: processTime,
    });

    console.log(`[ASR] 识别完成，耗时=${processTime}ms，文本长度=${recognizedText.length}`);
    return {
      success: true,
      status: 'completed',
      text: recognizedText,
      processTime,
      recordId,
      answerId,
    };
  } catch (error) {
    console.error('[ASR] 识别失败:', error);
    await writeAnswerResult(recordId, answerId, {
      asrStatus: 'failed',
      asrError: error.message,
    }).catch((e) => console.error('[ASR] 回写失败状态出错:', e));
    return { success: false, error: error.message };
  }
};
