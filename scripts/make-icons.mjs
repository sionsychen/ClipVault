import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// 纯 Node 手绘扩展图标:蓝底圆角 + 白色书签形(ClipVault = 收藏/保管)。
// 无第三方依赖;用 4x 超采样抗锯齿;输出带 alpha 的 RGBA PNG。

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6 = RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- 形状(全部用 [0,1] 归一化坐标定义,便于任意尺寸复用) ----

const BG = [45, 108, 223];     // #2d6cdf 主色
const BG2 = [30, 80, 190];     // 底部略深,做一点纵向渐变
const FG = [255, 255, 255];    // 书签白

function insideRoundRect(u, v, m, r) {
  const x0 = m, y0 = m, x1 = 1 - m, y1 = 1 - m;
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = Math.min(Math.max(u, x0 + r), x1 - r);
  const cy = Math.min(Math.max(v, y0 + r), y1 - r);
  const dx = u - cx, dy = v - cy;
  return dx * dx + dy * dy <= r * r;
}

// 书签:上部矩形 + 底部 V 形缺口,五个顶点的多边形。
const BM = (() => {
  const bx0 = 0.34, bx1 = 0.66, by0 = 0.26, shoulder = 0.74, notch = 0.60, cx = 0.5;
  return [
    [bx0, by0], [bx1, by0], [bx1, shoulder], [cx, notch], [bx0, shoulder],
  ];
})();

function pointInPoly(u, v, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const hit = (yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function sampleColor(u, v) {
  // 先判背景圆角区域;区域外 = 透明
  if (!insideRoundRect(u, v, 0.06, 0.22)) return null;
  if (pointInPoly(u, v, BM)) return FG;
  // 纵向渐变
  const t = (v - 0.06) / 0.88;
  return [
    Math.round(BG[0] + (BG2[0] - BG[0]) * t),
    Math.round(BG[1] + (BG2[1] - BG[1]) * t),
    Math.round(BG[2] + (BG2[2] - BG[2]) * t),
  ];
}

function renderIcon(size) {
  const SS = 4; // 超采样倍数
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const c = sampleColor(u, v);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const idx = (y * size + x) * 4;
      const cov = a / (255 * n); // 覆盖率 0..1
      if (cov > 0) {
        // 已累加的 rgb 只在被覆盖的样本上加过,除以覆盖样本数
        const covered = a / 255;
        rgba[idx] = Math.round(r / covered);
        rgba[idx + 1] = Math.round(g / covered);
        rgba[idx + 2] = Math.round(b / covered);
        rgba[idx + 3] = Math.round(cov * 255);
      } else {
        rgba[idx + 3] = 0;
      }
    }
  }
  return encodePng(size, rgba);
}

mkdirSync('icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, renderIcon(size));
  console.log(`icons/icon${size}.png written`);
}
