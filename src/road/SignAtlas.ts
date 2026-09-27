import { DataTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { drawSignLetter } from './SignFont';

export const signLabels = ['SERVICE\n500 M', 'SERVICE\nEXIT', 'P', 'FUEL', 'WC', 'TUNNEL', '40', '80', 'KM', '<', '>', 'EXIT >', ...'0123456789', 'PASS', 'REST', 'STEEP', 'SLOW', '20', '< ROUTE', 'ROUTE >', 'LOOP >', 'MAIN', 'EXIT >\n500 M', 'EXIT >\n200 M', 'CARS', 'BUS', 'TRUCK', 'SEMI', 'BIKE', 'MALL', 'CAFE', 'MARKET', 'WC\nMEN', 'WC\nWOMEN', 'WC\nACCESS', 'LEFT\nLOOP >', 'RIGHT >', 'RETURN >', 'JUNCTION\n500 M', 'EV', 'INFO', 'LEFT LOOP >\n200 M', 'RIGHT >\n200 M', 'RETURN >\n200 M'];
export const SIGN_ROWS = Math.ceil(signLabels.length / 4);
export const SIGN_TILE_WIDTH = 512, SIGN_TILE_HEIGHT = 256, SIGN_GUTTER = 16;
let pixels: Uint8Array | undefined;

export function createSignAtlas(): DataTexture {
  const width = SIGN_TILE_WIDTH * 4, height = SIGN_ROWS * SIGN_TILE_HEIGHT;
  if (!pixels) {
    const data = pixels = new Uint8Array(width * height * 4);
    signLabels.forEach((label, tile) => {
      const tx = tile % 4 * SIGN_TILE_WIDTH, ty = Math.floor(tile / 4) * SIGN_TILE_HEIGHT;
      const speed = tile === 6 || tile === 7 || tile === 26, warning = tile === 9 || tile === 10 || tile === 24 || tile === 25;
      const background = speed ? [242, 240, 224] : warning ? [239, 199, 73] : [22, 83, 68];
      const ink = speed || warning ? [28, 40, 40] : [248, 249, 240], border = speed ? [188, 46, 39] : ink;
      const pixel = (x: number, y: number, color: number[]) => {
        if (x < 0 || x >= SIGN_TILE_WIDTH || y < 0 || y >= SIGN_TILE_HEIGHT) return;
        const i = ((ty + SIGN_TILE_HEIGHT - 1 - y) * width + tx + x) * 4;
        data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
      };
      for (let y = 0; y < SIGN_TILE_HEIGHT; y++) for (let x = 0; x < SIGN_TILE_WIDTH; x++) {
        const edge = Math.min(x, SIGN_TILE_WIDTH - 1 - x, y, SIGN_TILE_HEIGHT - 1 - y);
        pixel(x, y, edge >= SIGN_GUTTER + 3 && edge < SIGN_GUTTER + 8 ? border : background);
      }
      const aspect = tile >= 44 ? 2.5 : tile >= 38 ? 3.2 / 0.9 : tile >= 33 ? 3.8 / 1.1 : tile === 26 ? 1.2 / 1.1 : tile >= 24 ? 2.4 / 1.1 : tile === 22 ? 2.5 / 1.1 : tile === 23 ? 5 / 0.65 : [4 / 2.2, 2, 1, 7, 2 / 0.6, 6 / 0.55, 1.2 / 1.1, 1.2 / 1.1, 1.35 / 0.6, 1.6 / 0.85, 1.6 / 0.85, 3][tile] ?? 0.43 / 0.52;
      const lines = label.split('\n'), sy = Math.min(174 / (lines.length * 10), 440 * aspect / (Math.max(...lines.map(line => line.length)) * 13));
      const sx = sy * 2 / aspect;
      lines.forEach((line, row) => {
        const x = (SIGN_TILE_WIDTH - (line.length * 6.7 - 1.7) * sx) / 2;
        const y = (SIGN_TILE_HEIGHT - ((lines.length - 1) * 10 + 7) * sy) / 2 + row * 10 * sy;
        [...line].forEach((letter, column) => drawSignLetter(letter, x + column * 6.7 * sx, y, sx, sy, (px, py, alpha) =>
          pixel(px, py, ink.map((channel, i) => Math.round(background[i] + (channel - background[i]) * alpha)))));
      });
    });
  }
  const texture = new DataTexture(pixels, width, height);
  texture.colorSpace = SRGBColorSpace; texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
