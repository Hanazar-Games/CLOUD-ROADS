import { Group, type Scene } from 'three';
import type { HeightFunction } from '../terrain/HeightFunction';
import { AIRPORTS } from './airport.js';
import { createAirportLod, setAirportDetailDistance } from './airport-view.js';
import { createRunway } from './runway-view.js';
import { disposeAircraftObject, loadAircraftModel } from './aircraft-models.js';
import { AIRCRAFT } from './aircraft-flight.js';
import { AIRPORT_STAND, airportPavementHeight, constrainAirport } from './AirportGround';
import { createAirportAccess } from './AirportAccessView';
import { BiomeSystem } from '../biome/BiomeSystem';

export class AirportWorld {
  readonly sites;
  readonly roots: Group[];
  aircraftId = 'a380';
  aircraftState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  groundAircraftVisible = true;
  private parkedAircraft?: Group;
  private loadController?: AbortController;
  private detailDistance = -1;

  constructor(scene: Scene, height: HeightFunction, surface: (x: number, z: number) => number) {
    const biomes = new BiomeSystem(height.seed, height.terrain);
    this.sites = height.airports.map((placement, i) => {
      const site = { ...AIRPORTS[i], name: ['云海国际机场', '远山高原机场', '天际货运机场'][i],
        description: i === 0 ? 'Cloud Roads 双跑道枢纽 · 两条 5 km 跑道、中央航站区与公路接驳' : '当前 Cloud Roads 世界 · 地形整平与三档机场模型',
        elevation: placement.elevation, worldX: placement.x, worldZ: placement.z,
        airfieldColor: [...biomes.sample(placement.x, placement.z, placement.elevation, 1).color],
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
      if (site.id === 'coast') root.add(createAirportAccess(site.elevation));
      return root;
    });
    this.update({ x: 0, z: 0 });
  }

  update(origin: { x: number; z: number }, detailDistance = 1, position?: { x: number; y: number; z: number }): void {
    this.roots.forEach((root, i) => root.position.set(this.sites[i].worldX - origin.x, 0, this.sites[i].worldZ - origin.z));
    if (detailDistance !== this.detailDistance) {
      this.detailDistance = detailDistance;
      for (const root of this.roots) setAirportDetailDistance(root.children[0], Math.max(900, detailDistance * 4500), 'balanced');
    }
    const site = this.sites[0], nearby = position && Math.hypot(position.x - site.worldX, position.z - site.worldZ, position.y - site.elevation) < 2000;
    if (this.parkedAircraft) this.parkedAircraft.visible = this.groundAircraftVisible && !!nearby;
    if (nearby && this.groundAircraftVisible && this.aircraftState === 'idle') void this.loadParkedAircraft();
  }

  selectAircraft(id: string): void {
    if (!AIRCRAFT.some(aircraft => aircraft.id === id) || id === this.aircraftId && this.aircraftState !== 'error') return;
    this.loadController?.abort();
    if (this.parkedAircraft) disposeAircraftObject(this.parkedAircraft);
    this.parkedAircraft = undefined; this.aircraftId = id; this.aircraftState = 'idle';
  }

  private async loadParkedAircraft(): Promise<void> {
    const aircraft = AIRCRAFT.find(aircraft => aircraft.id === this.aircraftId)!;
    const controller = new AbortController(); this.loadController = controller; this.aircraftState = 'loading';
    try {
      const model = await loadAircraftModel(aircraft, controller.signal);
      if (controller.signal.aborted) { disposeAircraftObject(model); return; }
      const site = this.sites[0];
      model.name = 'airport-player-aircraft';
      model.position.set(AIRPORT_STAND.x, site.elevation + .34 + aircraft.gearHeight, AIRPORT_STAND.z);
      model.rotation.y = -Math.PI / 2;
      model.visible = this.groundAircraftVisible;
      this.roots[0].add(model); this.parkedAircraft = model; this.aircraftState = 'ready';
    } catch { if (!controller.signal.aborted) this.aircraftState = 'error'; }
  }

  surface(x: number, z: number, ceiling = Infinity): number | undefined {
    for (const site of this.sites) {
      if (x < site.worldX - Math.max(site.bounds.x, site.id === 'coast' ? 4500 : 0) || x > site.worldX + site.bounds.x || Math.abs(z - site.worldZ) > site.bounds.z) continue;
      const height = airportPavementHeight(site, x, z);
      if (height !== undefined && height <= ceiling) return height;
    }
  }

  constrain(body: { x: number; z: number }, previousX: number, previousZ: number, radius: number, feet: number, height: number): boolean {
    let hit = false;
    for (const site of this.sites) hit = constrainAirport(site, body, previousX, previousZ, radius, feet, height) || hit;
    return hit;
  }

  dispose(): void { this.loadController?.abort(); for (const root of this.roots) disposeAircraftObject(root); }
}
