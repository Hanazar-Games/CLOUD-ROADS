import type { WorldOptions } from '../world/WorldOptions';

export const JUNCTION_INTERVAL = 20000;
export const junctionsEnabled = (options: Readonly<WorldOptions>): boolean => options.roadType === 'highway' ? options.interchanges : options.junctions;
export const junctionTarget = (distance: number): number => Math.max(1, Math.round(distance / JUNCTION_INTERVAL)) * JUNCTION_INTERVAL;
export const junctionLead = (options: Readonly<WorldOptions>): number => options.roadType === 'highway' && !options.oneWay ? 2800 : 1800;
export const junctionApproach = (distance: number, options: Readonly<WorldOptions>): boolean => {
  const delta = distance - junctionTarget(distance);
  return delta >= -junctionLead(options) && delta < 1200;
};
