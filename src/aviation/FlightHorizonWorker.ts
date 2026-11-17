import { HeightFunction } from '../terrain/HeightFunction';
import { buildFlightHorizon } from './FlightHorizonData';
import type { WorldOptions } from '../world/WorldOptions';

export interface HorizonRequest { seed: string; options: Readonly<WorldOptions>; x: number; z: number; inner: number; far: number }
let height: HeightFunction, key: string;
self.onmessage = ({ data }: MessageEvent<HorizonRequest>) => {
  try {
    const next = JSON.stringify([data.seed, data.options]);
    if (next !== key) { height = new HeightFunction(data.seed, data.options.terrain, data.options.roadType, data.options); key = next; }
    const result = buildFlightHorizon(height, data.options.terrain, data.x, data.z, data.inner, data.far);
    self.postMessage({ ...data, result }, { transfer: [result.positions.buffer, result.normals.buffer, result.colors.buffer, result.indices.buffer] });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
