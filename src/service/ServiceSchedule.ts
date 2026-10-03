import { hashSeed } from '../world/WorldSeed';
import { INTERCHANGE_EXTENT, JUNCTION_INTERVAL } from '../road/JunctionSchedule';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';

export const SERVICE_SEARCH_RADIUS = 1100;
export const serviceTarget = (seed: string, id: number, options: Readonly<WorldOptions> = DEFAULT_OPTIONS): number => {
  const target = id * 15000 + (hashSeed(`${seed}:services:${id}`) % 3601) - 1800;
  const junction = Math.round(target / JUNCTION_INTERVAL) * JUNCTION_INTERVAL;
  const clearance = options.roadType === 'highway' && !options.oneWay && options.interchanges ? INTERCHANGE_EXTENT + 1400 : 2400;
  return Math.abs(target - junction) < clearance ? junction - clearance - 200 : target;
};
