import { DataTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { drawSignLetter } from '../road/SignFont';

export const garageColors = [0x4cb6c5, 0x70c5b0, 0xebc063, 0xb29bdb, 0xe4876e];
const cache = new Map<number, Uint8Array>();

export function garageAtlas(levels = 5): DataTexture {
  const width = 2048, height = 1024;
  let pixels = cache.get(levels);
  if (!pixels) {
    const data = pixels = new Uint8Array(width * height * 4); cache.set(levels, data);
    const pixel = (x: number, y: number, hex: number, alpha = 1) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = ((height - 1 - y) * width + x) * 4;
      const channels = [hex >> 16 & 255, hex >> 8 & 255, hex & 255];
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - alpha) + channels[c] * alpha);
      data[i + 3] = Math.max(data[i + 3], Math.round(alpha * 255));
    };
    const label = (text: string, x: number, y: number, w: number, background?: number) => {
      if (background !== undefined) for (let py = y; py < y + 128; py++) for (let px = x; px < x + w; px++) pixel(px, py, background);
      const scale = Math.min(10, (w - 30) / (text.length * 6.7)), start = x + (w - (text.length * 6.7 - 1.7) * scale) / 2;
      [...text].forEach((letter, i) => drawSignLetter(letter, start + i * 6.7 * scale, y + (128 - 7 * scale) / 2, scale, scale,
        (px, py, coverage) => pixel(px, py, 0xf0f6ed, coverage)));
    };
    for (let floor = 0; floor <= 5; floor++) label(floor ? `B${floor}   PARKING` : 'P   UNDERGROUND', 0, floor * 128, 1024, floor ? garageColors[floor - 1] : 0x315066);
    for (let i = 0; i < 33; i++) label(String(i + 1).padStart(2, '0'), 1024 + i % 8 * 128, Math.floor(i / 8) * 128, 128);
    label(`EXIT >   B1 B${levels} <`, 0, 768, 1024, 0x153b46);
  }
  const atlas = new DataTexture(pixels, width, height); atlas.colorSpace = SRGBColorSpace;
  atlas.magFilter = LinearFilter; atlas.minFilter = LinearMipmapLinearFilter; atlas.generateMipmaps = true;
  atlas.anisotropy = 4; atlas.needsUpdate = true; return atlas;
}
