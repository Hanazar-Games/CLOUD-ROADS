export type TerrainKind = 'alpine' | 'forest' | 'desert' | 'dunes';
export type RouteStyle = 'natural' | 'winding' | 'cliff';
export interface WorldOptions {
  terrain: TerrainKind;
  roadType: 'mountain' | 'highway';
  roadWidth: number;
  routeStyle: RouteStyle;
}

export const DEFAULT_OPTIONS: Readonly<WorldOptions> = { terrain: 'alpine', roadType: 'mountain', roadWidth: 8, routeStyle: 'natural' };
export const routeNames: Record<RouteStyle, string> = { natural: '自然山路', winding: '蜿蜒盘山路', cliff: '峡谷挂壁公路' };
export const terrainNames: Record<TerrainKind, string> = { alpine: '高山雪岭', forest: '森林山谷', desert: '沙漠峡谷', dunes: '沙丘旷野' };
