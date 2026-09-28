import { hashSeed } from '../world/WorldSeed';
import { isAridTerrain, type TerrainKind } from '../world/WorldOptions';

export type ServiceFacility = 'garden' | 'track' | 'mall' | 'garage';
export function serviceFacility(seed: string, id: number): ServiceFacility {
  return (['garden', 'track', 'mall', 'garage'] as const)[(hashSeed(`${seed}:facility`) + id) % 4];
}

export type ServiceArchitecture = 'lodge' | 'modern' | 'courtyard';
export function serviceArchitecture(terrain: TerrainKind, id: number): ServiceArchitecture {
  const first = isAridTerrain(terrain) ? 2 : terrain === 'meadow' ? 1 : 0;
  return (['lodge', 'modern', 'courtyard'] as const)[((id - 1 + first) % 3 + 3) % 3];
}
