'use strict';
// Generates assets/icon-16.png, icon-32.png, icon-256.png. Run: node tools/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// A rounded blue square with a white "<>" mark, supersampled for smooth edges.
function renderIcon(size) {
  const SS = 4;
  const W = size * SS;
  const buf = new Float32Array(W * W * 4);

  const over = (i, r, g, b, a) => {
    const ia = 1 - a;
    buf[i] = r * a + buf[i] * ia;
    buf[i + 1] = g * a + buf[i + 1] * ia;
    buf[i + 2] = b * a + buf[i + 2] * ia;
    buf[i + 3] = a + buf[i + 3] * ia;
  };
  const sdRR = (px, py, cx, cy, hw, hh, rad) => {
    const qx = Math.abs(px - cx) - (hw - rad);
    const qy = Math.abs(py - cy) - (hh - rad);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
  };
  const segD = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay;
    const c2 = vx * vx + vy * vy;
    let t = c2 ? ((px - ax) * vx + (py - ay) * vy) / c2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  };

  const k = W / 32;
  const cx = W / 2, cy = W / 2;
  const hw = 14 * k, hh = 14 * k, rad = 8.5 * k;
  const segs = [
    [15, 9.5, 9.5, 16], [9.5, 16, 15, 22.5],
    [17, 9.5, 22.5, 16], [22.5, 16, 17, 22.5]
  ].map((s) => s.map((v) => v * k));
  const half = 1.9 * k;

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const fx = x + 0.5, fy = y + 0.5, i = (y * W + x) * 4;
      if (sdRR(fx, fy, cx, cy, hw, hh, rad) <= 0) over(i, 0.231, 0.62, 1, 1);
      let d = Infinity;
      for (const s of segs) d = Math.min(d, segD(fx, fy, s[0], s[1], s[2], s[3]));
      if (d <= half) over(i, 1, 1, 1, 1);
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
      }
      r /= n; g /= n; b /= n; a /= n;
      const o = (y * size + x) * 4;
      out[o] = a > 0 ? Math.round(Math.min(1, r / a) * 255) : 0;
      out[o + 1] = a > 0 ? Math.round(Math.min(1, g / a) * 255) : 0;
      out[o + 2] = a > 0 ? Math.round(Math.min(1, b / a) * 255) : 0;
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 256]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), encodePNG(size, renderIcon(size)));
}
console.log('icons written to', outDir);
