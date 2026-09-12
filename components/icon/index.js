/**
 * icon 组件：内置 2px stroke 线条图标库
 * 设计规范：viewBox 24x24、stroke-width=2、round line-cap/join
 * 用法：<icon name="check" color="#12B7A8" size="32rpx" />
 */

// 图标路径数据（SVG inner content，不含外层 <svg>）
const ICONS = {
  // 方向类
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-up': '<path d="M6 15l6-6 6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',

  // 操作类
  'check': '<path d="M20 6L9 17l-5-5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  'close': '<path d="M18 6L6 18M6 6l12 12"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'minus': '<path d="M5 12h14"/>',
  'pen': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  'share': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  'trash': '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/>',

  // 媒体控制
  'play': '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  'pause': '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  'stop': '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  'reset': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',

  // 业务对象
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  'timer': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
  'calendar': '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  'chart': '<path d="M3 3v18h18"/><rect x="7" y="13" width="3" height="5"/><rect x="12" y="9" width="3" height="9"/><rect x="17" y="6" width="3" height="12"/>',
  'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  'headphones': '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-5z"/><path d="M20 14a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-5z"/>',
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z"/>',
  'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  'trophy': '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4"/>',
  'flame': '<path d="M12 22a7 7 0 0 0 5-12c-1-2-2-3-2-5 0-1-1-2-2-1-3 2-5 5-5 9a4 4 0 0 0 4 4z"/>',
  'heart': '<path d="M19 14c1.5-1.5 3-3.5 3-6a4 4 0 0 0-7-2.5A4 4 0 0 0 8 8c0 2.5 1.5 4.5 3 6l1 1z"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
};

// 纯 JS base64 编码（mini-program 无 btoa）
function base64Encode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // 转 UTF-8 字节
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[c & 0x3f] : '=';
  }
  return result;
}

Component({
  properties: {
    name: { type: String, value: '' },
    color: { type: String, value: '#12B7A8' },
    size: { type: String, value: '32rpx' }
  },
  data: {
    src: ''
  },
  observers: {
    'name, color': function () {
      this.updateSrc();
    }
  },
  lifetimes: {
    attached() {
      this.updateSrc();
    }
  },
  methods: {
    updateSrc() {
      const { name, color } = this.properties;
      const content = ICONS[name];
      if (!content) {
        this.setData({ src: '' });
        return;
      }
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">' + content + '</svg>';
      this.setData({ src: 'data:image/svg+xml;base64,' + base64Encode(svg) });
    }
  }
});
