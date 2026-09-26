import { Group } from 'three';
import type { VehicleDetailKit } from './VehicleDetails';
import type { CraneSystems } from './CraneSystems';
import { mergeVehicleParts } from './VehicleGeometry';

export class CraneMesh {
  readonly turret = new Group();
  private readonly boom = new Group();
  private readonly stages: Group[] = [];
  private readonly feet: Group[] = [];
  private readonly legs: Group[] = [];
  private readonly hook = new Group();
  private readonly cable;
  private readonly weight;
  constructor(parent: Group, kit: VehicleDetailKit, private readonly rideHeight: number) {
    const { block, cylinder, paint, trim, metal, glass } = kit;
    this.turret.name = 'crane-turret'; this.turret.position.z = 2.25; parent.add(this.turret);
    block(2.65, 0.28, 10.6, 0, 0.28, 1.25, paint, parent);
    cylinder(1.03, 0.22, 0, 0.54, 2.25, metal, parent);
    block(1.55, 0.64, 3.4, 0.15, 1.04, 0.85, paint, this.turret);
    for (let i = 0; i < 4; i++) block(2.35, 0.24, 1.25, 0, 0.94 + i * 0.25, 2.6, trim, this.turret);
    block(0.88, 0.4, 1.7, -0.88, 1.1, -0.7, paint, this.turret);
    block(0.86, 0.76, 1.7, -0.88, 1.74, -0.7, glass, this.turret);
    for (const x of [-1.31, -0.45]) {
      for (const z of [-1.53, 0.13]) block(0.055, 0.85, 0.055, x, 1.73, z, metal, this.turret);
    }
    block(0.9, 0.08, 1.75, -0.88, 2.17, -0.7, metal, this.turret);
    block(0.5, 0.14, 0.5, -0.88, 1.12, -0.65, trim, this.turret);
    block(0.5, 0.55, 0.13, -0.88, 1.4, -0.35, trim, this.turret);
    for (const x of [-1.18, -0.59]) {
      block(0.14, 0.13, 0.3, x, 1.36, -0.93, trim, this.turret);
      cylinder(0.035, 0.18, x, 1.5, -1, metal, this.turret);
    }
    this.boom.name = 'crane-boom'; this.boom.position.set(0.17, 2.45, 0.2); this.turret.add(this.boom);
    for (let i = 0; i < 4; i++) {
      const stage = new Group(); stage.name = `crane-stage-${i}`; this.stages.push(stage); this.boom.add(stage);
      block(0.92 - i * 0.15, 0.65 - i * 0.12, 3.5, 0, 0, -1.75, paint, stage);
      for (const side of [-1, 1]) block(0.03, 0.025, 3.45, side * (0.46 - i * 0.075), 0, -1.75, metal, stage);
    }
    this.hook.name = 'crane-hook'; this.turret.add(this.hook);
    this.cable = cylinder(0.016, 1, 0, -0.2, 0, metal, this.hook);
    this.weight = new Group(); this.hook.add(this.weight);
    block(0.3, 0.18, 0.24, 0, 0, 0, paint, this.weight);
    block(0.045, 0.22, 0.06, 0, -0.18, 0, metal, this.weight);
    block(0.16, 0.045, 0.06, 0.06, -0.28, 0, metal, this.weight);
    for (const z of [-2.25, 4.9]) for (const side of [-1, 1]) {
      const foot = new Group(); foot.userData.side = side; foot.position.z = z; parent.add(foot); this.feet.push(foot);
      block(1.2, 0.22, 0.42, -side * 0.55, 0.02, 0, trim, foot);
      const leg = new Group(); leg.name = 'crane-support-leg'; foot.add(leg); this.legs.push(leg);
      cylinder(0.14, 0.7, 0, -0.02, 0, metal, leg);
      block(0.5, 0.08, 0.55, 0, -0.41, 0, metal, leg);
    }
  }
  sync(state: CraneSystems): void {
    this.turret.rotation.y = state.yaw; this.boom.rotation.x = state.angle;
    this.stages.forEach((stage, i) => { stage.position.z = -i * (1.7 + state.extension / 3); });
    const reach = 8.6 + state.extension;
    this.hook.position.set(0.17, 2.45 + Math.sin(state.angle) * reach, 0.2 - Math.cos(state.angle) * reach);
    this.cable.scale.y = state.rope; this.cable.position.y = -state.rope / 2;
    this.weight.position.y = -state.rope;
    for (const foot of this.feet) foot.position.x = Number(foot.userData.side) * (1.17 + state.deployment * 1.15);
    for (const leg of this.legs) {
      leg.scale.y = 1 + state.deployment * ((this.rideHeight + 0.33) / 0.78 - 1);
      leg.position.y = 0.33 * (1 - leg.scale.y);
    }
  }
  mergeParts() { return [this.turret, this.weight, ...this.stages, ...this.feet, ...this.legs].flatMap(group => mergeVehicleParts(group)); }
}
