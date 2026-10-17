/**
 * 云函数部署脚本（绕过 tcb CLI 3.8.1 打包 bug）
 * 流程：sync-shared 同步共享层 → 系统 zip 打包 → TC3 签名直调 SCF UpdateFunctionCode → 轮询至 Active
 * 用法：node cloudfunctions/deploy-fn.js <函数名1> [函数名2 ...]
 * 依赖：~/.config/.cloudbase/auth.json 的临时凭证（tcb login 后自动生成）
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');

const ENV_ID = 'cloud1-d7g66xvli7bb6bcc6';
const REGION = 'ap-shanghai';
const ROOT = __dirname;

function readCredential() {
  const authPath = path.join(os.homedir(), '.config', '.cloudbase', 'auth.json');
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  const c = auth.credential || auth;
  const secretId = c.tmpSecretId || c.secretId;
  const secretKey = c.tmpSecretKey || c.secretKey;
  const token = c.tmpToken || c.token || '';
  if (!secretId || !secretKey) throw new Error('auth.json 中无有效凭证，请先 tcb login');
  return { secretId, secretKey, token };
}

function tc3Sign(cred, action, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json\nhost:scf.tencentcloudapi.com\nx-tc-action:${action.toLowerCase()}\n`,
    'content-type;host;x-tc-action',
    hashedPayload,
  ].join('\n');
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    `${date}/scf/tc3_request`,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const kDate = crypto.createHmac('sha256', `TC3${cred.secretKey}`).update(date).digest();
  const kService = crypto.createHmac('sha256', kDate).update('scf').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    timestamp,
    authorization: `TC3-HMAC-SHA256 Credential=${cred.secretId}/${date}/scf/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`,
  };
}

function callApi(cred, action, params) {
  const payload = JSON.stringify(params);
  const { timestamp, authorization } = tc3Sign(cred, action, payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'scf.tencentcloudapi.com',
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'application/json',
          'X-TC-Action': action,
          'X-TC-Version': '2018-04-16',
          'X-TC-Region': REGION,
          'X-TC-Timestamp': timestamp,
          'X-TC-Token': cred.token,
          'Content-Length': Buffer.byteLength(payload),
          Authorization: authorization,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.Response && j.Response.Error) reject(new Error(`${j.Response.Error.Code}: ${j.Response.Error.Message}`));
            else if (j.Response) resolve(j.Response);
            else reject(new Error(data));
          } catch (e) {
            reject(new Error(`响应解析失败: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function deployOne(cred, name) {
  const fnDir = path.join(ROOT, name);
  if (!fs.existsSync(path.join(fnDir, 'index.js'))) throw new Error(`${name}: 目录不存在或缺 index.js`);

  const zipPath = `/tmp/scf_deploy_${name}.zip`;
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`cd "${fnDir}" && zip -qr "${zipPath}" . -x "node_modules/*" -x "*.zip"`, { stdio: 'pipe' });
  const sizeKB = Math.round(fs.statSync(zipPath).size / 1024);
  if (sizeKB > 1500) throw new Error(`${name}: zip ${sizeKB}KB 超过 ZipFile 1.5MB 上限，需改用 COS 方式`);

  await callApi(cred, 'UpdateFunctionCode', {
    FunctionName: name,
    Namespace: ENV_ID,
    ZipFile: fs.readFileSync(zipPath).toString('base64'),
    InstallDependency: 'TRUE',
  });
  process.stdout.write(`${name}: 已提交 (${sizeKB}KB)，等待 Active `);

  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    try {
      const detail = await callApi(cred, 'GetFunction', { FunctionName: name, Namespace: ENV_ID, ShowCode: false });
      if (detail.Status === 'Active') {
        console.log(`✓ Active`);
        return;
      }
      if (detail.Status === 'UpdateFailed' || detail.Status === 'CreateFailed') {
        const reason = (detail.StatusReasons || []).map((s) => s.ErrorMsg).join('; ');
        throw new Error(`${name}: ${detail.Status} — ${reason}`);
      }
      process.stdout.write('.');
    } catch (e) {
      if (e.message.includes(name)) throw e;
      // GetFunction 偶发 404/限流，继续轮询
    }
  }
  throw new Error(`${name}: 60s 内未到达 Active 状态`);
}

async function main() {
  const names = process.argv.slice(2);
  if (!names.length) {
    console.error('用法: node deploy-fn.js <函数名1> [函数名2 ...]');
    process.exit(1);
  }
  console.log('[1/2] 同步共享层');
  execSync('node "' + path.join(ROOT, 'sync-shared.js') + '"', { stdio: 'inherit' });
  console.log(`[2/2] 部署 ${names.length} 个函数`);
  const cred = readCredential();
  const failed = [];
  for (const name of names) {
    try {
      await deployOne(cred, name);
    } catch (e) {
      console.error(`✗ ${e.message}`);
      failed.push(name);
    }
  }
  if (failed.length) {
    console.error(`失败: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log('全部部署成功');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
