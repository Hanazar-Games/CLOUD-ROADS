export type TerrainKind = 'alpine' | 'forest' | 'desert' | 'dunes' | 'meadow' | 'badlands' | 'karst' | 'volcanic' | 'tundra' | 'autumn';
export const ROUTE_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type RouteStyle = typeof ROUTE_LEVELS[number];
export interface WorldOptions {
  terrain: TerrainKind;
  roadType: 'mountain' | 'highway';
  roadWidth: number;
  highwayRadius: number;
  routeStyle: RouteStyle;
  maxGrade: number;
  elevationMode: 'natural' | 'cycles' | 'fixed' | 'random';
  climbMin: number;
  climbMax: number;
  altitudeMin: number;
  altitudeMax: number;
  elevationDirection: 'up' | 'down' | 'random';
  mountainHeight: 'natural' | 'range';
  mountainMin: number;
  mountainMax: number;
  mountainDensity: number;
  vegetationDensity: number;
  junctions: boolean;
  interchanges: boolean;
}

export const DEFAULT_OPTIONS: Readonly<WorldOptions> = { terrain: 'alpine', roadType: 'mountain', roadWidth: 8, highwayRadius: 200, routeStyle: 1, maxGrade: 0.06,
  elevationMode: 'natural', climbMin: 300, climbMax: 900, altitudeMin: 300, altitudeMax: 1500, elevationDirection: 'up',
  mountainHeight: 'natural', mountainMin: 0, mountainMax: 3500, mountainDensity: 1, vegetationDensity: 1, junctions: true, interchanges: true };
export const absoluteElevation = (options: Readonly<WorldOptions>): boolean => options.elevationMode === 'fixed' || options.elevationMode === 'random';
export const routeNames: Record<RouteStyle, string> = { 0: '全直道 · 零弯道', 1: '1 档 · 舒缓山路', 2: '2 档 · 蜿蜒山路', 3: '3 档 · 盘山折返', 4: '4 档 · 密集发卡弯', 5: '5 档 · 连续发卡弯' };
export const terrainNames: Record<TerrainKind, string> = { alpine: '高山雪岭', forest: '森林山谷', desert: '沙漠峡谷', dunes: '沙丘旷野',
  meadow: '草甸丘陵', badlands: '红岩荒原', karst: '喀斯特峰林', volcanic: '火山高地', tundra: '冰蚀苔原', autumn: '阔叶丘陵' };
export const isAridTerrain = (terrain: TerrainKind): boolean => terrain === 'desert' || terrain === 'dunes' || terrain === 'badlands';

export function validWorldOptions(value: unknown): value is WorldOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== Object.keys(DEFAULT_OPTIONS).length || Object.keys(DEFAULT_OPTIONS).some(key => !Object.hasOwn(v, key))) return false;
  const ranges = { highwayRadius: [50, 2000], maxGrade: [0, 0.4], climbMin: [50, 2000], climbMax: [50, 2000],
    altitudeMin: [0, 6000], altitudeMax: [0, 6000], mountainMin: [0, 6000], mountainMax: [0, 6000], mountainDensity: [0.25, 2], vegetationDensity: [0, 2] };
  for (const [key, [min, max]] of Object.entries(ranges)) if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < min || v[key] > max) return false;
  const steps = { highwayRadius: 10, maxGrade: 0.01, climbMin: 50, climbMax: 50, altitudeMin: 1, altitudeMax: 1,
    mountainMin: 1, mountainMax: 1, mountainDensity: 0.05, vegetationDensity: 0.05 };
  for (const [key, step] of Object.entries(steps)) if (Math.abs((v[key] as number) / step - Math.round((v[key] as number) / step)) > 1e-7) return false;
  const o = value as WorldOptions;
  return Object.hasOwn(terrainNames, o.terrain) && ['mountain', 'highway'].includes(o.roadType) && [6, 8, 10].includes(o.roadWidth)
    && ROUTE_LEVELS.includes(o.routeStyle) && ['natural', 'cycles', 'fixed', 'random'].includes(o.elevationMode)
    && ['up', 'down', 'random'].includes(o.elevationDirection) && ['natural', 'range'].includes(o.mountainHeight)
    && o.climbMin <= o.climbMax && o.altitudeMin <= o.altitudeMax && o.mountainMin <= o.mountainMax
    && typeof o.junctions === 'boolean' && typeof o.interchanges === 'boolean';
}
