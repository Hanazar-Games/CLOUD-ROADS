import { BiomeSystem, createBiomeSample } from '../biome/BiomeSystem';
import type { HeightFunction } from '../terrain/HeightFunction';
import type { TerrainKind } from '../world/WorldOptions';

export interface FlightHorizonData { positions: Float32Array; colors: Float32Array; normals: Float32Array; indices: Uint32Array }

export function buildFlightHorizon(height: HeightFunction, terrain: TerrainKind, x: number, z: number, inner: number, far: number): FlightHorizonData {
  const positions: number[] = [], colors: number[] = [], normals: number[] = [], indices: number[] = [];
  const biomes = new BiomeSystem(height.seed, terrain), biome = createBiomeSample();
  const positive = Array.from({ length: 8 }, (_, i) => inner * (i + 1) / 8);
  for (let radius = inner; radius < far;) { radius = Math.min(far, radius * 1.18); positive.push(radius); }
  const axis = [...positive.map(v => -v).reverse(), 0, ...positive], width = axis.length;
  const vertices = new Int32Array(width * width).fill(-1);
  for (let row = 0; row < width; row++) for (let col = 0; col < width; col++) {
    const dx = Math.fround(axis[col]), dz = Math.fround(axis[row]);
    if (Math.abs(dx) < inner && Math.abs(dz) < inner) continue;
    const ax = x + dx, az = z + dz, y = height.sample(ax, az);
    const nx = height.sample(ax - 8, az) - height.sample(ax + 8, az), nz = height.sample(ax, az - 8) - height.sample(ax, az + 8);
    const magnitude = Math.hypot(nx, 16, nz);
    vertices[row * width + col] = positions.length / 3;
    positions.push(dx, y - 3, dz); normals.push(nx / magnitude, 16 / magnitude, nz / magnitude);
    colors.push(...biomes.sample(ax, az, y, 16 / magnitude, biome).color);
  }
  for (let row = 0; row < width - 1; row++) for (let col = 0; col < width - 1; col++) {
    const a = vertices[row * width + col], b = vertices[row * width + col + 1];
    const c = vertices[(row + 1) * width + col], d = vertices[(row + 1) * width + col + 1];
    if (Math.min(a, b, c, d) < 0) continue;
    indices.push(a, c, b, b, c, d);
  }
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}
