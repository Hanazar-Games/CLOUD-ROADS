import { DataTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

export const signLabels = ['SERVICE\n500 M', 'SERVICE\nEXIT', 'P', 'FUEL', 'WC', 'TUNNEL', '40', '80', 'KM', '<', '>', 'EXIT >', ...'0123456789'];
const glyphs: Record<string, number[]> = {
  A: [14,17,17,31,17,17,17], C: [14,17,16,16,16,17,14], E: [31,16,16,30,16,16,31], F: [31,16,16,30,16,16,16],
  I: [14,4,4,4,4,4,14], K: [17,18,20,24,20,18,17], L: [16,16,16,16,16,16,31], M: [17,27,21,21,17,17,17],
  N: [17,25,25,21,19,19,17], P: [30,17,17,30,16,16,16], R: [30,17,17,30,20,18,17], S: [15,16,16,14,1,1,30],
  T: [31,4,4,4,4,4,4], U: [17,17,17,17,17,17,14], V: [17,17,17,17,17,10,4], W: [17,17,17,21,21,27,17],
  X: [17,17,10,4,10,17,17], '0': [14,17,19,21,25,17,14], '1': [4,12,4,4,4,4,14], '2': [14,17,1,2,4,8,31],
  '3': [30,1,1,14,1,1,30], '4': [2,6,10,18,31,2,2], '5': [31,16,16,30,1,1,30], '6': [14,16,16,30,17,17,14],
  '7': [31,1,2,4,8,8,8], '8': [14,17,17,14,17,17,14], '9': [14,17,17,15,1,1,14],
  '>': [16,8,4,2,4,8,16], '<': [1,2,4,8,4,2,1],
};

export function createSignAtlas(): DataTexture {
  const width = 1024, height = 768, data = new Uint8Array(width * height * 4);
  signLabels.forEach((label, tile) => {
    const tx = tile % 4 * 256, ty = Math.floor(tile / 4) * 128;
    const speed = tile === 6 || tile === 7, warning = tile === 9 || tile === 10;
    const background = speed ? [242, 240, 224] : warning ? [239, 199, 73] : [30, 95, 81];
    const ink = speed || warning ? [28, 40, 40] : [243, 245, 229];
    const pixel = (x: number, y: number, color: number[]) => {
      const i = ((ty + 127 - y) * width + tx + x) * 4;
      data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
    };
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
      const border = x < 5 || x > 250 || y < 5 || y > 122;
      pixel(x, y, border ? speed ? [188, 46, 39] : ink : background);
    }
    const aspect = [4 / 2.2, 2, 1, 7, 2 / 0.6, 6 / 0.55, 1.2 / 1.1, 1.2 / 1.1, 1.35 / 0.6, 1.6 / 0.85, 1.6 / 0.85, 2][tile] ?? 0.43 / 0.52;
    const lines = label.split('\n'), scaleY = Math.min(100 / (lines.length * 9), 224 * aspect / (Math.max(...lines.map(line => line.length)) * 12));
    const scaleX = scaleY * 2 / aspect;
    lines.forEach((line, row) => {
      const startX = (256 - (line.length * 6 - 1) * scaleX) / 2, startY = (128 - lines.length * 9 * scaleY) / 2 + row * 9 * scaleY;
      [...line].forEach((letter, column) => (glyphs[letter] ?? []).forEach((bits, y) => {
        for (let x = 0; x < 5; x++) if (bits & (1 << (4 - x))) {
          for (let py = Math.floor(startY + y * scaleY); py < Math.floor(startY + (y + 1) * scaleY); py++)
            for (let px = Math.floor(startX + (column * 6 + x) * scaleX); px < Math.floor(startX + (column * 6 + x + 1) * scaleX); px++) pixel(px, py, ink);
        }
      }));
    });
  });
  const texture = new DataTexture(data, width, height);
  texture.colorSpace = SRGBColorSpace; texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
