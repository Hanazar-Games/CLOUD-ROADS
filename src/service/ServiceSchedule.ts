import { hashSeed } from '../world/WorldSeed';
import { JUNCTION_INTERVAL } from '../road/JunctionSchedule';

export const SERVICE_SEARCH_RADIUS = 840;
export const serviceTarget = (seed: string, id: number): number => {
  const target = id * 15000 + (hashSeed(`${seed}:services:${id}`) % 3601) - 1800;
  const junction = Math.round(target / JUNCTION_INTERVAL) * JUNCTION_INTERVAL;
  return Math.abs(target - junction) < 2400 ? junction - 2600 : target;
};
