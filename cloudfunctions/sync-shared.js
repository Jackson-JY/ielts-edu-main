/**
 * 云函数共享层同步脚本
 * 把 _shared/common.js 拷贝为所有引用它的函数目录下的 _common.js。
 * 用法：node cloudfunctions/sync-shared.js
 * 修改 _shared/common.js 后、部署任何云函数前必须先运行本脚本。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, '_shared', 'common.js');
const code = fs.readFileSync(SRC, 'utf8');

const dirs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared' && !d.name.startsWith('.'))
  .map((d) => d.name);

let count = 0;
const missing = [];
for (const name of dirs) {
  const idx = path.join(ROOT, name, 'index.js');
  if (!fs.existsSync(idx)) continue;
  const content = fs.readFileSync(idx, 'utf8');
  if (content.includes("require('./_common')") || content.includes('require("./_common")')) {
    fs.writeFileSync(path.join(ROOT, name, '_common.js'), code);
    count++;
  } else if (fs.existsSync(path.join(ROOT, name, '_common.js'))) {
    missing.push(name);
  }
}

for (const name of missing) {
  console.warn(`[warn] ${name}/_common.js 存在但 index.js 未引用，请确认是否残留`);
}
console.log(`synced ${count} function(s) from _shared/common.js`);
