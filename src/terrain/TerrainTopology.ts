import { CHUNK_SIZE, type TerrainCells } from '../world/ChunkPlanner';

export function createTerrainLayout(cells: TerrainCells): { coordinates: Float32Array; indices: Uint16Array } {
  const coordinates: number[] = [], indices: number[] = [];
  const step = CHUNK_SIZE / cells, grid = (row: number, col: number) => row * (cells + 1) + col;
  for (let row = 0; row <= cells; row++) {
    for (let col = 0; col <= cells; col++) coordinates.push(col * step, row * step);
  }
  const inset = cells === 64 ? 0 : 1;
  for (let row = inset; row < cells - inset; row++) {
    for (let col = inset; col < cells - inset; col++) {
      const a = grid(row, col), b = a + 1, c = a + cells + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  if (cells !== 64) {
    const outerStart = coordinates.length / 2;
    for (let i = 0; i < 64; i++) coordinates.push(i * 4, 0);
    for (let i = 0; i < 64; i++) coordinates.push(256, i * 4);
    for (let i = 0; i < 64; i++) coordinates.push(256 - i * 4, 256);
    for (let i = 0; i < 64; i++) coordinates.push(0, 256 - i * 4);
    const inner = [
      (i: number) => grid(1, i + 1), (i: number) => grid(i + 1, cells - 1),
      (i: number) => grid(cells - 1, cells - 1 - i), (i: number) => grid(cells - 1 - i, 1),
    ];
    for (let side = 0; side < 4; side++) {
      const outer = (i: number) => outerStart + (side * 64 + i) % 256;
      let a = 0, b = 0;
      while (a < 64 || b < cells - 2) {
        if (a < 64 && (b === cells - 2 || (a + 1) / 64 <= (b + 1) / (cells - 2))) {
          indices.push(outer(a), inner[side](b), outer(a + 1));
          a++;
        } else {
          indices.push(outer(a), inner[side](b), inner[side](b + 1));
          b++;
        }
      }
    }
  }
  return { coordinates: new Float32Array(coordinates), indices: new Uint16Array(indices) };
}
