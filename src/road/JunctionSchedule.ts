import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';

export const JUNCTION_INTERVAL = 20000;
export const INTERCHANGE_EXTENT = 3100;
export const crossroadsEnabled = (options: Readonly<WorldOptions>): boolean => options.crossroads && options.roadType !== 'highway' && !options.oneWay;
export const junctionInterval = (options: Readonly<WorldOptions>): number => crossroadsEnabled(options) ? options.crossroadInterval : JUNCTION_INTERVAL;
export const junctionTail = (options: Readonly<WorldOptions>): number => crossroadsEnabled(options) ? 300 : options.roadType === 'highway' && !options.oneWay ? INTERCHANGE_EXTENT : 1200;
export const junctionsEnabled = (options: Readonly<WorldOptions>): boolean => crossroadsEnabled(options) || (options.roadType === 'highway' ? options.interchanges : options.junctions);
export const junctionTarget = (distance: number, options: Readonly<WorldOptions> = DEFAULT_OPTIONS): number => Math.max(1, Math.round(distance / junctionInterval(options))) * junctionInterval(options);
export const junctionLead = (options: Readonly<WorldOptions>): number => crossroadsEnabled(options) ? Math.min(1800, options.crossroadInterval * 0.4) : options.roadType === 'highway' && !options.oneWay ? INTERCHANGE_EXTENT + 1800 : 1800;
export const junctionApproach = (distance: number, options: Readonly<WorldOptions>): boolean => {
  const delta = distance - junctionTarget(distance, options);
  return delta >= -junctionLead(options) && delta < junctionTail(options);
};
