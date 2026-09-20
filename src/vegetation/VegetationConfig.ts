import { CHUNK_SIZE } from '../world/ChunkPlanner';

export const PLANT_GRID = 20;
export const PLANT_SPACING = CHUNK_SIZE / PLANT_GRID;
export const TREE_DETAIL_RADIUS = 4;
export const GROUND_DETAIL_RADIUS = 3;
export const MEADOW_GRID = 64;
export const MEADOW_DETAIL_RADIUS = 1;

// One persistent tree candidate per 2×2 cell keeps distant silhouettes bounded.
export function distantPlant(x: number, z: number): boolean {
  const gx = Math.floor(x / PLANT_SPACING), gz = Math.floor(z / PLANT_SPACING);
  let hash = Math.imul(Math.floor(gx / 2), 374761393) ^ Math.imul(Math.floor(gz / 2), 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((gx & 1) + (gz & 1) * 2) === ((hash ^ (hash >>> 16)) & 3);
}
