import { BiomeSystem, createBiomeSample } from '../biome/BiomeSystem';
import type { HeightFunction } from '../terrain/HeightFunction';
import type { TerrainKind } from '../world/WorldOptions';

export interface FlightHorizonData { positions: Float32Array; colors: Float32Array; normals: Float32Array; indices: Uint32Array }

export function buildFlightHorizon(height: HeightFunction, terrain: TerrainKind, x: number, z: number, inner: number, far: number): FlightHorizonData {
  const positions: number[] = [], colors: number[] = [], normals: number[] = [], indices: number[] = [];
  const biomes = new BiomeSystem(height.seed, terrain), biome = createBiomeSample();
  const radii = [inner], sides = 32, perimeter = sides * 4;
  for (let radius = inner; radius < far;) { radius = Math.min(far, radius * 1.2); radii.push(radius); }
  for (const [ring, radius] of radii.entries()) {
    for (let side = 0; side < 4; side++) for (let step = 0; step < sides; step++) {
      const along = radius * (step * 2 / sides - 1);
      const dx = Math.fround(side === 0 ? along : side === 1 ? radius : side === 2 ? -along : -radius);
      const dz = Math.fround(side === 0 ? -radius : side === 1 ? along : side === 2 ? radius : -along);
      positions.push(dx, height.sample(x + dx, z + dz) - 3, dz); normals.push(0, 0, 0);
    }
    if (ring === 0) continue;
    for (let i = 0; i < perimeter; i++) {
      const a = (ring - 1) * perimeter + i, b = (ring - 1) * perimeter + (i + 1) % perimeter;
      const c = ring * perimeter + i, d = ring * perimeter + (i + 1) % perimeter;
      indices.push(a, b, c, b, d, c);
    }
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const vertex of [a, b, c]) { normals[vertex] += nx; normals[vertex + 1] += ny; normals[vertex + 2] += nz; }
  }
  for (let i = 0; i < positions.length; i += 3) {
    const magnitude = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (magnitude) { normals[i] /= magnitude; normals[i + 1] /= magnitude; normals[i + 2] /= magnitude; }
    else normals[i + 1] = 1;
    colors.push(...biomes.sample(x + positions[i], z + positions[i + 2], positions[i + 1] + 3, normals[i + 1], biome).color);
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}
