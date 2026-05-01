const fs = require('fs');
const path = require('path');

// 生成最小化的 PNG 图标 (81x81 像素)
// 使用纯色图标，文件极小
// 图标类型: home, course, homework, profile
// 状态: normal (灰色 #9A97AA), active (深灰 #4A4A4A)

const ICONS = {
  home: { normal: '#9A97AA', active: '#4A4A4A' },
  course: { normal: '#9A97AA', active: '#4A4A4A' },
  homework: { normal: '#9A97AA', active: '#4A4A4A' },
  profile: { normal: '#9A97AA', active: '#4A4A4A' },
};

const SIZE = 81;
const outDir = process.argv[2] || __dirname;

// 创建一个简单的 PNG (最小可能的合法 PNG)
// 图标内容：纯色圆形 + 简单形状
function createMinimalPNG(shape, color, filepath) {
  // 为简化，我们生成一个带形状标注的最小 PNG
  // 实际用一个 1x1 的纯色 PNG 作为占位，微信开发者工具支持
  // 更完整的方案：用 base64 编码的小 PNG
  
  // 81x81 像素，但只放一个极简形状，文件可以 <5KB
  // 这里生成一个带形状的 PNG Buffer
  
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
  
  // IDAT chunk - 图像数据
  // 创建像素数据 (RGBA)
  const rawData = [];
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      // 判断是否在形状内部
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isShape = isInShape(shape, x, y, width, height);
      
      if (isShape) {
        rawData.push(r, g, b, 255); // 形状内：纯色不透明
      } else {
        rawData.push(0, 0, 0, 0); // 形状外：透明
      }
    }
  }
  
  const rawBuffer = Buffer.from(rawData);
  
  // 用 zlib 压缩
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawBuffer);
  const idat = makeChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));
  
  const png = Buffer.concat([signature, ihdr, idat, iend]);
  fs.writeFileSync(filepath, png);
  console.log(`Created: ${filepath} (${png.length} bytes)`);
}

function isInShape(shape, x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const size = w * 0.35;
  
  if (shape === 'home') {
    // 房屋形状：三角形屋顶 + 方形底座
    const roofY = h * 0.2;
    const bodyTop = h * 0.5;
    const bodyBot = h * 0.8;
    const roofLeft = w * 0.15;
    const roofRight = w * 0.85;
    const bodyLeft = w * 0.22;
    const bodyRight = w * 0.78;
    
    // 屋顶三角形
    const inRoof = y >= roofY && y <= bodyTop &&
      x >= cx - (roofRight - roofLeft) * (cy - y) / (cy - roofY) / 2 &&
      x <= cx + (roofRight - roofLeft) * (cy - y) / (cy - roofY) / 2;
    
    // 身体方形
    const inBody = y > bodyTop && y <= bodyBot && x >= bodyLeft && x <= bodyRight;
    
    return inRoof || inBody;
  }
  
  if (shape === 'course') {
    // 书本形状：两个矩形 + 中间线
    const left = w * 0.2;
    const right = w * 0.8;
    const top = h * 0.2;
    const bot = h * 0.8;
    const mid = w * 0.48;
    
    return x >= left && x <= right && y >= top && y <= bot;
  }
  
  if (shape === 'homework') {
    // 铅笔形状：细长椭圆 + 尖头
    const ex = w * 0.35;
    const ey = h * 0.2;
    const cx2 = w / 2;
    const cy2 = h / 2;
    const dx2 = x - cx2;
    const dy2 = y - cy2;
    return (dx2 * dx2) / (ex * ex) + (dy2 * dy2) / (ey * ey) <= 1;
  }
  
  if (shape === 'profile') {
    // 人头形状：圆形头 + 身体弧线
    const headR = w * 0.18;
    const headCy = h * 0.35;
    const dx3 = x - cx;
    const dy3 = y - headCy;
    const inHead = (dx3 * dx3 + dy3 * dy3) <= (headR * headR);
    
    const bodyR = w * 0.3;
    const bodyCy = h * 0.85;
    const dx4 = x - cx;
    const dy4 = y - bodyCy;
    const inBody = (dx4 * dx4 + dy4 * dy4) <= (bodyR * bodyR) && y >= h * 0.55 && y <= h * 0.85;
    
    return inHead || inBody;
  }
  
  return false;
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

// 生成所有图标
const files = [
  ['home', 'normal', 'tab-home.png'],
  ['home', 'active', 'tab-home-active.png'],
  ['course', 'normal', 'tab-course.png'],
  ['course', 'active', 'tab-course-active.png'],
  ['homework', 'normal', 'tab-homework.png'],
  ['homework', 'active', 'tab-homework-active.png'],
  ['profile', 'normal', 'tab-profile.png'],
  ['profile', 'active', 'tab-profile-active.png'],
];

files.forEach(([shape, state, filename]) => {
  const color = state === 'active' ? '#4A4A4A' : '#9A97AA';
  const filepath = path.join(outDir, filename);
  createMinimalPNG(shape, color, filepath);
});

console.log('\n✅ All tab icons generated successfully!');
