import { createRng, hashSeed } from '../world/WorldSeed';

export interface AirportPlacement {
  id: string;
  x: number;
  z: number;
  elevation: number;
  length: number;
  width: number;
  halfWidth: number;
  halfLength: number;
}

export function createAirportPlacements(seed: string, height: (x: number, z: number) => number,
  center: (z: number) => number): readonly AirportPlacement[] {
  const rng = createRng(hashSeed(`${seed}:airports`));
  return ['coast', 'alpine', 'desert'].map((id, i) => {
    const z = -4200 - i * 19000 + Math.round(rng() * 512), x = center(z) + (i === 2 ? -1 : 1) * (5800 + Math.round(rng() * 512));
    const length = [4000, 3600, 4600][i], width = [60, 45, 60][i];
    let total = 0;
    for (const dx of [-1800, 0, 1800]) for (const dz of [-length / 2, 0, length / 2]) total += height(x + dx, z - 400 + dz);
    return { id, x, z, elevation: Math.round(total / 9), length, width, halfWidth: 2700, halfLength: length / 2 + 1600 };
  });
}

export function airportTerrainHeight(airports: readonly AirportPlacement[], x: number, z: number, natural: number): number {
  for (const site of airports) {
    const distance = Math.max(Math.abs(x - site.x) - site.halfWidth, Math.abs(z - site.z + 400) - site.halfLength);
    if (distance >= 1200) continue;
    const t = Math.max(0, distance / 1200), blend = t * t * (3 - 2 * t);
    return site.elevation + (natural - site.elevation) * blend;
  }
  return natural;
}

export function airportClearance(airports: readonly AirportPlacement[], x: number, z: number): boolean {
  return airports.some(site => Math.abs(x - site.x) < site.halfWidth && Math.abs(z - site.z + 400) < site.halfLength);
}
