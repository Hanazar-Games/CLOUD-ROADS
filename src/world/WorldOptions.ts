export type TerrainKind = 'alpine' | 'forest' | 'desert' | 'dunes';
export interface WorldOptions {
  terrain: TerrainKind;
  roadType: 'mountain' | 'highway';
  roadWidth: number;
}

export const DEFAULT_OPTIONS: Readonly<WorldOptions> = { terrain: 'alpine', roadType: 'mountain', roadWidth: 8 };
export const terrainNames: Record<TerrainKind, string> = { alpine: '高山雪岭', forest: '森林山谷', desert: '沙漠峡谷', dunes: '沙丘旷野' };
