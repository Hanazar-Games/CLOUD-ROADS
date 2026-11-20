export const CHUNK_SIZE = 256;
export const VIEW_RADIUS = 8;
export const VIEW_RADII = [3, 4, 6, 8, 12, 16] as const;
export type TerrainCells = 8 | 16 | 64;
export interface ChunkRequest {
  key: string;
  x: number;
  z: number;
  cells: TerrainCells;
  vegetation?: boolean;
}

export function planChunks(x: number, z: number, forward: { x: number; z: number }, radius = VIEW_RADIUS, maxCells: TerrainCells = 64, fineRadius = 2): ChunkRequest[] {
  const centerX = Math.floor(x / CHUNK_SIZE), centerZ = Math.floor(z / CHUNK_SIZE);
  const requests: (ChunkRequest & { priority: number })[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      const cx = centerX + dx, cz = centerZ + dz;
      requests.push({
        key: `${cx},${cz}`, x: cx, z: cz,
        cells: Math.min(maxCells, ring <= fineRadius ? 64 : ring <= 4 ? 16 : 8) as TerrainCells,
        priority: Math.hypot(dx, dz) * 10 - (dx * forward.x + dz * forward.z) * 3,
      });
    }
  }
  requests.sort((a, b) => a.priority - b.priority);
  return requests;
}
