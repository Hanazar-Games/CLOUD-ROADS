import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

// Deterministic, periodic 2 m surfaces. RGB is sRGB albedo; alpha is linear micro-height.
const size = 2048, root = new URL('../src/road/textures/', import.meta.url);
mkdirSync(root, { recursive: true });
const hash = (x, y, seed = 0) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
const noise = (u, v, cells, seed) => {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
  const h = (dx, dy) => hash((ix + dx) % cells, (iy + dy) % cells, seed);
  return (h(0, 0) * (1 - tx) + h(1, 0) * tx) * (1 - ty) + (h(0, 1) * (1 - tx) + h(1, 1) * tx) * ty;
};
const srgb = value => Math.round(255 * (1.055 * Math.max(0, Math.min(1, value)) ** (1 / 2.4) - 0.055));
const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c; });
function chunk(type, data) {
  const name = Buffer.from(type), body = Buffer.concat([name, data]), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); body.copy(result, 4);
  let crc = -1; for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  result.writeUInt32BE((crc ^ -1) >>> 0, result.length - 4); return result;
}
function png(data, width) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(width, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(width * (width * 4 + 1));
  for (let y = 0; y < width; y++) {
    const row = y * (width * 4 + 1); rows[row] = 1;
    for (let x = 0; x < width * 4; x++) rows[row + x + 1] = (data[y * width * 4 + x] - (x >= 4 ? data[y * width * 4 + x - 4] : 0)) & 255;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const browser = await chromium.launch({ headless: true });
try {
const page = await browser.newPage();
async function save(data, width, kind) {
  const encoded = await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = image.width;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.88).split(',')[1];
  }, `data:image/png;base64,${png(data, width).toString('base64')}`);
  writeFileSync(new URL(`${kind}-${width}.webp`, root), Buffer.from(encoded, 'base64'));
  const intermediate = new URL(`${kind}-${width}.png`, root);
  if (existsSync(intermediate)) unlinkSync(intermediate);
}
for (const kind of ['asphalt', 'concrete']) {
  const data = new Uint8Array(size * size * 4), cells = kind === 'asphalt' ? 192 : 256;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, px = u * cells, py = v * cells, ix = Math.floor(px), iy = Math.floor(py);
    let first = Infinity, second = Infinity, tint = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = (ix + i + cells) % cells, gy = (iy + j + cells) % cells;
      const dx = px - (ix + i + 0.15 + hash(gx, gy, 11) * 0.7), dy = py - (iy + j + 0.15 + hash(gx, gy, 37) * 0.7);
      const distance = dx * dx + dy * dy;
      if (distance < first) { second = first; first = distance; tint = hash(gx, gy, 91); } else second = Math.min(second, distance);
    }
    const edge = Math.min(1, (Math.sqrt(second) - Math.sqrt(first)) * 9);
    const fine = noise(u, v, 768, 83), patch = noise(u, v, 8, 81), mottling = noise(u, v, 48, 27);
    let luminance, height;
    if (kind === 'asphalt') {
      const stone = edge * (0.035 + tint * 0.075);
      luminance = 0.029 + stone + (patch - 0.5) * 0.022 + (fine - 0.5) * 0.024;
      height = 0.3 + edge * (0.28 + tint * 0.16) + (fine - 0.5) * 0.1;
    } else {
      const pore = tint > 0.82 ? Math.max(0, 1 - first * 24) : 0;
      const brush = (noise(u, v, 512, 68) - 0.5) * 0.012;
      luminance = 0.25 + (patch - 0.5) * 0.065 + (mottling - 0.5) * 0.038 + (fine - 0.5) * 0.035 - pore * 0.115 + brush;
      height = 0.58 + (fine - 0.5) * 0.17 - pore * 0.4 + brush;
    }
    const offset = (y * size + x) * 4, warm = (tint - 0.5) * 0.018;
    data[offset] = srgb(luminance * (1 + warm)); data[offset + 1] = srgb(luminance * 1.012); data[offset + 2] = srgb(luminance * 1.018);
    data[offset + 3] = Math.round(Math.max(0, Math.min(1, height)) * 63) * 4;
  }
  await save(data, size, kind);
  const low = new Uint8Array(256 * 256 * 4), scale = size / 256;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) sum += data[((y * scale + j) * size + x * scale + i) * 4 + c];
    low[(y * 256 + x) * 4 + c] = Math.round(sum / (scale * scale));
  }
  await save(low, 256, kind);
  console.log(`Baked ${kind}: 2048 and 256 px`);
}
} finally { await browser.close(); }
