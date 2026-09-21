import { BridgeDetector, type BridgeSpan } from '../bridge/BridgeDetector';
import { TunnelDetector, type TunnelSpan } from '../tunnel/TunnelDetector';
import { ServicePlanner, type ServiceArea } from '../service/ServicePlanner';
import { serviceTarget } from '../service/ServiceSchedule';
import { hashSeed } from '../world/WorldSeed';
import type { WorldOptions } from '../world/WorldOptions';
import type { RoadTerrain } from './RoadGenerator';
import { RoadSegment, type RoadControlPoint, type RoadSample } from './RoadSegment';
import { RoadSpine } from './RoadSpine';
import { roadProfile } from './RoadProfile';

export interface Junction { id: string; route: string; distance: number; sample: RoadSample; kind: 'fork' | 'stack'; exits: string[] }
interface RouteDefinition { id: string; seed: string; origin?: RoadControlPoint; prefix: RoadSegment[]; parent?: RouteDefinition; openings?: RoadSpine['openings'] }
export interface NetworkRoute {
  id: string; seed: string; road: RoadSpine; definition: RouteDefinition;
  bridges: BridgeSpan[]; tunnels: TunnelSpan[]; services: ServiceArea[];
  bridgeDetector: BridgeDetector; tunnelDetector: TunnelDetector; servicePlanner: ServicePlanner;
  version: number; ready: boolean;
}

export class RoadNetwork {
  private readonly cache = new Map<string, NetworkRoute>();
  readonly junctions: Junction[] = [];
  active: NetworkRoute;
  version = 0;

  constructor(seed: string, private readonly terrain: RoadTerrain, private readonly options: Readonly<WorldOptions>, road: RoadSpine) {
    road.openStart = true;
    this.active = this.add({ id: 'root', seed, prefix: [] }, road);
    const origin = { ...road.generator.start, heading: Math.PI, grade: -road.generator.start.grade, routeId: 'back' };
    this.add({ id: 'back', seed: `${seed}:back`, origin, prefix: [] });
  }

  get routes(): NetworkRoute[] { return [...this.cache.values()]; }

  reset(): void { this.active = this.cache.get('root')!; this.version++; }

  nearest(x: number, z: number, y?: number): { route: NetworkRoute; sample: RoadSample; error: number } | undefined {
    let best: ReturnType<RoadNetwork['nearest']>;
    for (const route of this.cache.values()) {
      const sample = route.road.nearest(x, z);
      if (!sample) continue;
      const error = Math.hypot(x - sample.position.x, z - sample.position.z)
        + (y === undefined || !Number.isFinite(y) ? 0 : Math.abs(sample.position.y + 1 - y) * 1.5);
      if (!best || error < best.error - 0.05 || Math.abs(error - best.error) < 0.05 && route === this.active) best = { route, sample, error };
    }
    return best;
  }

  update(x: number, z: number, y: number | undefined, halo: number): boolean {
    const nearest = this.nearest(x, z, y), current = this.active.road.nearest(x, z);
    if (nearest && nearest.route !== this.active && nearest.error < this.options.roadWidth * 2 + 8
      && nearest.sample.distance > (nearest.route.id === 'back' ? 3 : 60)
      && (!current || Math.hypot(current.position.x - x, current.position.z - z) + (y === undefined ? 0 : Math.abs(current.position.y + 1 - y) * 1.5) > nearest.error + 0.7)) {
      this.active = nearest.route; this.version++;
    }
    const parent = this.active.definition.parent;
    if (parent && Math.hypot(x - this.active.road.generator.start.position.x, z - this.active.road.generator.start.position.z) < halo) this.add(parent);
    let ready = true;
    for (const route of this.cache.values()) {
      const active = route === this.active;
      const close = route.road.nearest(x, z);
      const nearby = !close || Math.hypot(close.position.x - x, close.position.z - z) < halo;
      if (!active && !nearby) continue;
      const preview = route.definition.parent && !active && route.id !== parent?.id;
      route.ready = preview ? route.road.advanceToDistance(route.road.generator.start.distance + 800)
        : route.road.update(route.road.coordinate(x, z), active ? 4 : 2, active ? halo : Math.min(1600, halo));
      if (active || route.id === 'back' && this.active.id === 'root' && current && current.distance < 400) ready &&= route.ready;
      if (route.ready && route.version !== route.road.version) this.refresh(route);
    }
    if (this.active.ready) this.planJunctions(x, z);
    const candidates = this.routes.sort((a, b) => {
      const distance = (route: NetworkRoute) => { const p = route.road.nearest(x, z)?.position; return p ? Math.hypot(p.x - x, p.z - z) : Infinity; };
      return distance(b) - distance(a);
    });
    for (const route of candidates) {
      if (this.cache.size <= 7) break;
      if (route === this.active || route.id === parent?.id || route.id === 'root' || route.id === 'back') continue;
      this.cache.delete(route.id); this.version++;
      for (let i = this.junctions.length - 1; i >= 0; i--) if (this.junctions[i].route === route.id) this.junctions.splice(i, 1);
    }
    for (let i = this.junctions.length - 1; i >= 0; i--) {
      const junction = this.junctions[i];
      if (Math.hypot(junction.sample.position.x - x, junction.sample.position.z - z) > halo + 4000) this.junctions.splice(i, 1);
    }
    return ready;
  }

  private add(definition: RouteDefinition, road?: RoadSpine): NetworkRoute {
    const found = this.cache.get(definition.id); if (found) return found;
    road ??= new RoadSpine(definition.seed, this.terrain, this.options, definition.origin, definition.prefix);
    road.openStart = true;
    road.openings.push(...definition.openings ?? []); definition.openings = road.openings;
    const route: NetworkRoute = { id: definition.id, seed: definition.seed, road, definition, bridges: [], tunnels: [], services: [],
      bridgeDetector: new BridgeDetector(this.terrain, this.options), tunnelDetector: new TunnelDetector(this.terrain, this.options),
      servicePlanner: new ServicePlanner(definition.seed, this.terrain, this.options), version: -1, ready: false };
    this.cache.set(route.id, route); this.version++; return route;
  }

  private refresh(route: NetworkRoute): void {
    route.bridges = route.bridgeDetector.detect(route.road.samples);
    route.services = route.servicePlanner.detect(route.road.samples);
    route.tunnels = route.tunnelDetector.detect(route.road.samples, route.bridges)
      .filter(span => !route.services.some(site => site.start < span.end.distance && site.end > span.start.distance));
    route.version = route.road.version; this.version++;
  }

  private planJunctions(x: number, z: number): void {
    if (this.options.roadType === 'highway' ? !this.options.interchanges : !this.options.junctions) return;
    const route = this.active, current = route.road.nearest(x, z)!;
    const first = Math.max(0, Math.floor((current.distance - 2400) / 7200));
    for (let index = first; index <= first + 1; index++) {
      const id = `${route.id}/${index}`, seed = `${route.seed}:junction:${index}`;
      const existing = this.junctions.find(junction => junction.id === id);
      if (existing && existing.exits.every(exit => this.cache.has(exit))) continue;
      let distance = Math.max(route.road.generator.start.distance + 1200, index * 7200 + 1000 + hashSeed(seed) % 1200);
      const service = serviceTarget(route.seed, Math.max(1, Math.round(distance / 15000)));
      if (Math.abs(service - distance) < 1300) distance += 2300;
      if (distance > current.distance + 2800 || distance < current.distance - 1400) continue;
      const segment = route.road.segments.find(s => s.start.distance >= distance && s.start.distance < distance + 1200
        && !s.start.structure && !s.end.structure && Math.abs(s.start.grade) < 0.075
        && !route.tunnels.some(span => s.start.distance > span.start.distance - 200 && s.start.distance < span.end.distance + 200)
        && !route.services.some(site => Math.abs(site.sample.distance - s.start.distance) < 1300));
      if (!segment) continue;
      distance = segment.start.distance;
      const sample = segment.sample(0);
      let kind: Junction['kind'] = this.options.roadType === 'highway' && this.options.maxGrade >= 0.025 ? 'stack' : 'fork';
      const ramps = (kind: Junction['kind']) => [-1, 1].map(side => {
        const entryDistance = distance + (kind === 'stack' && side > 0 ? 480 : 0);
        const entry = route.road.segments.find(s => s.start.distance <= entryDistance && s.end.distance >= entryDistance)?.atDistance(entryDistance) ?? sample;
        const childId = `branch-${hashSeed(`${seed}:${side}`).toString(36)}-${hashSeed(`${seed}:${side}:id`).toString(36)}`;
        const prefix = this.ramp(entry, childId, side, kind);
        return { side, entry, childId, prefix };
      });
      let exits = ramps(kind);
      if (kind === 'stack' && exits.some(exit => !this.clearance(exit.prefix, route.road)
        || exit.entry.structure || route.tunnels.some(span => exit.entry.distance > span.start.distance - 200 && exit.entry.distance < span.end.distance + 200))) { kind = 'fork'; exits = ramps(kind); }
      if (kind === 'fork' && !this.options.junctions) continue;
      const junction: Junction = { id, route: route.id, distance, sample, kind, exits: [] };
      route.road.openings.splice(0, route.road.openings.length, ...route.road.openings.filter(range => range.end >= current.distance - 8000));
      for (const { side, childId, entry, prefix } of exits) {
        const start = prefix.at(-1)!.end;
        const child = this.add({ id: childId, seed: childId, origin: { ...start, elevated: undefined, nextMountain: start.distance + 600 }, prefix, parent: route.definition });
        child.road.openings.splice(0, 1, { start: 0, end: kind === 'stack' ? 190 : 150, side: kind === 'stack' ? -1 : -side });
        child.road.version++;
        const openingSide = kind === 'stack' ? 1 : side;
        if (!route.road.openings.some(range => range.start === entry.distance - 12 && range.side === openingSide)) route.road.openings.push({ start: entry.distance - 12, end: entry.distance + (kind === 'stack' ? 190 : 150), side: openingSide });
        junction.exits.push(childId);
      }
      if (existing) this.junctions.splice(this.junctions.indexOf(existing), 1);
      this.junctions.push(junction); route.road.version++; this.version++;
    }
  }

  private ramp(entry: RoadSample, id: string, side: number, kind: Junction['kind']): RoadSegment[] {
    const prefix: RoadSegment[] = [];
    let start: RoadControlPoint = { ...entry, position: { ...entry.position, y: entry.position.y + 0.015 }, distance: 0, routeId: id,
      mountain: undefined, climb: undefined, structure: undefined, nextStructure: undefined, opening: undefined, bank: 0 };
    const turns = kind === 'stack' ? side < 0 ? [Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 1.5] : [Math.PI / 2, Math.PI / 2] : [side * 0.7, side * 0.85];
    for (const [i, turn] of turns.entries()) {
      const grade = kind === 'stack' ? Math.min(this.options.maxGrade, 0.06) * (i === 0 ? 1 : i === 1 && side < 0 ? 0.8 : 0) : 0;
      const piece = new RoadSegment({ ...start, elevated: kind === 'stack' && i > 0 }, entry.heading + turn, grade, kind === 'stack' ? 420 : 260);
      prefix.push(piece); start = piece.end;
    }
    return prefix;
  }

  private clearance(prefix: RoadSegment[], parent: RoadSpine): boolean {
    const width = roadProfile(this.options).outerHalfWidth * 2 + 10;
    for (const segment of prefix) for (let i = 0; i <= 48; i++) {
      const sample = segment.sample(i / 48);
      if (sample.distance < 300) continue;
      const below = parent.nearest(sample.position.x, sample.position.z)!;
      if (Math.hypot(sample.position.x - below.position.x, sample.position.z - below.position.z) < width && sample.position.y - below.position.y < 12) return false;
    }
    return true;
  }
}
