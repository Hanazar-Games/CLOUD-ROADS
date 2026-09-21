import { Vector2, Vector4 } from 'three';
import { isAridTerrain, type TerrainKind } from '../world/WorldOptions';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const seasonNames: Record<Season, string> = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' };
const profiles: Record<Season, readonly [number, number, number, number]> = {
  spring: [1, 0, 0.22, -8], summer: [0, 0, 0, 0], autumn: [0, 1, 0.06, -10], winter: [0, 0, 1, -26],
};

export class SeasonState {
  kind: Season = 'summer';
  readonly phase = { value: new Vector4(...profiles.summer) };
  readonly climate;
  readonly origin = { value: new Vector2() };

  constructor(terrain: TerrainKind) {
    const arid = isAridTerrain(terrain);
    this.climate = { value: new Vector2(arid ? 32 : terrain === 'tundra' ? 6 : terrain === 'autumn' ? 15 : 18, arid ? 0.32 : 1) };
  }

  set(kind: Season): void { this.kind = kind; this.phase.value.set(...profiles[kind]); }
  temperature(height: number): number { return this.climate.value.x + this.phase.value.w - height * 0.006; }
  snow(height: number): number {
    const cold = Math.max(0, Math.min(1, (2 - this.temperature(height)) / 8));
    return cold * cold * (3 - 2 * cold) * this.phase.value.z * this.climate.value.y;
  }
  grip(height: number, sheltered = false): number { return sheltered ? 1 : 1 - this.snow(height) * 0.48; }
  setOrigin(x: number, z: number): void { this.origin.value.set(x % 4096, z % 4096); }
}
