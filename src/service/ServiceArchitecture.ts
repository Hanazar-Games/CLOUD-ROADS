import { isAridTerrain, type TerrainKind } from '../world/WorldOptions';

export type ServiceArchitecture = 'lodge' | 'modern' | 'courtyard';
export function serviceArchitecture(terrain: TerrainKind, id: number): ServiceArchitecture {
  const first = isAridTerrain(terrain) ? 2 : terrain === 'meadow' ? 1 : 0;
  return (['lodge', 'modern', 'courtyard'] as const)[((id - 1 + first) % 3 + 3) % 3];
}
