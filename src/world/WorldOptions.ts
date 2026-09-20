export type TerrainKind = 'alpine' | 'forest' | 'desert' | 'dunes' | 'meadow' | 'badlands' | 'karst';
export const ROUTE_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type RouteStyle = typeof ROUTE_LEVELS[number];
export interface WorldOptions {
  terrain: TerrainKind;
  roadType: 'mountain' | 'highway';
  roadWidth: number;
  routeStyle: RouteStyle;
  maxGrade: number;
  elevationMode: 'natural' | 'cycles';
  climbMin: number;
  climbMax: number;
}

export const DEFAULT_OPTIONS: Readonly<WorldOptions> = { terrain: 'alpine', roadType: 'mountain', roadWidth: 8, routeStyle: 1, maxGrade: 0.06,
  elevationMode: 'natural', climbMin: 300, climbMax: 900 };
export const routeNames: Record<RouteStyle, string> = { 0: '全直道 · 零弯道', 1: '1 档 · 舒缓山路', 2: '2 档 · 蜿蜒山路', 3: '3 档 · 盘山折返', 4: '4 档 · 密集发卡弯', 5: '5 档 · 连续发卡弯' };
export const terrainNames: Record<TerrainKind, string> = { alpine: '高山雪岭', forest: '森林山谷', desert: '沙漠峡谷', dunes: '沙丘旷野',
  meadow: '草甸丘陵', badlands: '红岩荒原', karst: '喀斯特峰林' };
export const isAridTerrain = (terrain: TerrainKind): boolean => terrain === 'desert' || terrain === 'dunes' || terrain === 'badlands';
