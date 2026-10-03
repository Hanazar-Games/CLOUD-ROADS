import type { Raycaster } from 'three';
import { DisplaySurface } from './DisplaySurface';
import type { VehiclePhysics } from './VehiclePhysics';
import type { VehicleSystems } from './VehicleSystems';

const controls = [['Ignition', 'PWR'], ['KeyH', 'HAZ'], ['Fridge', 'ICE'], ['DrinkWater', 'H2O'], ['KeyU', 'LED'], ['KeyN', 'FAN']];

export class CabinButtons extends DisplaySurface {
  private last = '';
  private cabin = true;
  constructor() {
    super('cabin-buttons');
    this.texture.repeat.y = 64 / 224; this.texture.offset.y = 160 / 224;
    this.root.scale.y = 64 / 224;
  }
  update(car: VehiclePhysics, systems: VehicleSystems): void {
    this.cabin = systems.hasWindows;
    const states = [car.ignition !== 'off', systems.signal === 'hazard', car.equipment.fridgeOn,
      car.equipment.drinking, systems.cabinLight, systems.fan > 0];
    const signature = `${states.join('|')}|${this.cabin}`; if (signature === this.last) return;
    this.last = signature;
    this.rect(0, 0, 384, 64, [14, 25, 34]);
    controls.forEach(([, label], i) => {
      this.rect(i * 64 + 3, 4, 58, 56, states[i] ? [23, 59, 64] : [30, 40, 47]);
      this.text(!this.cabin && i >= 4 ? '---' : label, i * 64 + 14, 17, 2, [213, 237, 239]);
      this.rect(i * 64 + 20, 43, 25, 4, states[i] ? i === 1 ? [255, 155, 80] : [81, 235, 197] : [60, 78, 90]);
    });
    this.texture.needsUpdate = true;
  }
  pick(ray: Raycaster): string | undefined {
    const hit = ray.intersectObject(this.root.children[0])[0];
    if (!hit?.uv) return;
    const index = Math.min(5, Math.floor(hit.uv.x * 6));
    return !this.cabin && index >= 4 ? undefined : controls[index]?.[0];
  }
}
