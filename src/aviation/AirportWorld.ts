import { Group, type Scene } from 'three';
import type { HeightFunction } from '../terrain/HeightFunction';
import { AIRPORTS } from './airport.js';
import { createAirportLod } from './airport-view.js';
import { createRunway } from './runway-view.js';
import { disposeAircraftObject } from './aircraft-models.js';

export class AirportWorld {
  readonly sites;
  readonly roots: Group[];

  constructor(scene: Scene, height: HeightFunction, surface: (x: number, z: number) => number) {
    this.sites = height.airports.map((placement, i) => {
      const site = { ...AIRPORTS[i], name: ['云海国际机场', '远山高原机场', '天际货运机场'][i],
        description: '当前 Cloud Roads 世界 · 地形整平与三档机场模型',
        elevation: placement.elevation, worldX: placement.x, worldZ: placement.z,
        terrainHeight: (x: number, z: number) => surface(x + placement.x, z + placement.z) };
      site.gates = site.gates.map((gate: { x: number; y: number; z: number; radius: number; normal: readonly number[] }) => ({ ...gate, y: Math.max(placement.elevation + gate.y - AIRPORTS[i].elevation,
        height.sample(placement.x + gate.x, placement.z + gate.z) + 250) }));
      site.gates = site.gates.map((gate: { x: number; y: number; z: number; normal: readonly number[] }, index: number) => {
        const previous = site.gates[index - 1] ?? { x: 0, y: placement.elevation, z: 1000 };
        const direction = [gate.x - previous.x, gate.y - previous.y, gate.z - previous.z], length = Math.hypot(...direction);
        return { ...gate, normal: direction.map(value => value / length) };
      });
      return site;
    });
    this.roots = this.sites.map(site => {
      const root = new Group(); root.name = `cloud-airport-${site.id}`;
      root.add(createAirportLod(site), createRunway(site)); scene.add(root);
      return root;
    });
    this.update({ x: 0, z: 0 });
  }

  update(origin: { x: number; z: number }): void {
    this.roots.forEach((root, i) => root.position.set(this.sites[i].worldX - origin.x, 0, this.sites[i].worldZ - origin.z));
  }

  dispose(): void { for (const root of this.roots) disposeAircraftObject(root); }
}
