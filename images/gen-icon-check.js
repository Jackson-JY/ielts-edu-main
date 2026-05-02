const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 生成勾选图标 (81x81 像素)
// 绿色勾选标记

const SIZE = 81;
const COLOR = '#4CAF50'; // 绿色
const outDir = process.argv[2] || __dirname;

// 创建 PNG 文件
function createCheckIcon(filepath) {
  const width = SIZE;
  const height = SIZE;
  
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdr = makeChunk('IHDR', ihdrData);
  
  // 解析颜色
  const r = parseInt(COLOR.slice(1, 3), 16);
  const g = parseInt(COLOR.slice(3, 5), 16);
  const b = parseInt(COLOR.slice(5, 7), 16);
  
  // 创建像素数据 (RGBA)
  const rawData = [];
  
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      // 绘制勾选形状
      const isCheck = isInCheckShape(x, y, width, height);
      
      if (isCheck) {
        rawData.push(r, g, b, 255); // 形状内：纯色不透明
      } else {
        rawData.push(0, 0, 0, 0); // 形状外：透明
      }
    }
  }
  
  const rawBuffer = Buffer.from(rawData);
  
  // 用 zlib 压缩
  const compressed = zlib.deflateSync(rawBuffer);
  const idat = makeChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));
  
  const png = Buffer.concat([signature, ihdr, idat, iend]);
  fs.writeFileSync(filepath, png);
  console.log(`Created: ${filepath} (${png.length} bytes)`);
}

function isInCheckShape(x, y, w, h) {
  // 勾选形状：从左下到右上的斜线
  // 调整坐标系，让 (0,0) 在左下角
  const cx = w / 2;
  const cy = h / 2;
  
  // 勾选的两个线段
  // 第一段：从左下到中间（约 30° 向上）
  // 第二段：从中间到右上（约 -30° 向下）
  
  const lineWidth = w * 0.12; // 线宽
  
  // 第一段：从左下 (20%, 70%) 到中间 (45%, 55%)
  const x1 = w * 0.25;
  const y1 = h * 0.60;
  const x2 = w * 0.45;
  const y2 = h * 0.45;
  
  // 第二段：从中间 (45%, 55%) 到右上 (80%, 30%)
  const x3 = w * 0.75;
  const y3 = h * 0.30;
  
  // 检查点是否在第一条线段附近
  const dist1 = pointToLineDistance(x, y, x1, y1, x2, y2);
  const onLine1 = dist1 < lineWidth && x >= x1 - lineWidth && x <= x2 + lineWidth && y >= y2 - lineWidth && y <= y1 + lineWidth;
  
  // 检查点是否在第二条线段附近
  const dist2 = pointToLineDistance(x, y, x2, y2, x3, y3);
  const onLine2 = dist2 < lineWidth && x >= x2 - lineWidth && x <= x3 + lineWidth && y >= y3 - lineWidth && y <= y2 + lineWidth;
  
  return onLine1 || onLine2;
}

function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  
  // Simple CRC32
  let crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

// 生成勾选图标
const filepath = path.join(outDir, 'icon-check.png');
createCheckIcon(filepath);

console.log('\n✅ Check icon generated successfully!');
