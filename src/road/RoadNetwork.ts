import { BridgeDetector, type BridgeSpan } from '../bridge/BridgeDetector';
import { TunnelDetector, type TunnelSpan } from '../tunnel/TunnelDetector';
import { ServicePlanner, type ServiceArea } from '../service/ServicePlanner';
import { hashSeed } from '../world/WorldSeed';
import { absoluteElevation, type WorldOptions } from '../world/WorldOptions';
import type { RoadTerrain } from './RoadGenerator';
import { RoadSegment, type RoadControlPoint, type RoadSample } from './RoadSegment';
import { RoadSpine } from './RoadSpine';
import { roadProfile } from './RoadProfile';
import { JUNCTION_INTERVAL, junctionsEnabled } from './JunctionSchedule';
import { highwayInterchange, type HighwayInterchange } from './HighwayInterchange';

export interface JunctionRamp { id: string; sample: RoadSample; direction: 'left' | 'right' | 'return' }
export interface Junction { id: string; route: string; distance: number; sample: RoadSample; kind: 'fork' | 'stack'; exits: string[]; ramps: JunctionRamp[]; interchange?: HighwayInterchange }
interface RouteDefinition { id: string; seed: string; origin?: RoadControlPoint; prefix: RoadSegment[]; parent?: RouteDefinition; openings?: RoadSpine['openings']; opposite?: string }
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
    const parentRoute = parent && this.cache.get(parent.id);
    if (this.active.definition.opposite && parentRoute?.ready
      && Math.hypot(x - this.active.road.generator.start.position.x, z - this.active.road.generator.start.position.z) < halo)
      this.planJunctions(x, z, parentRoute);
    const candidates = this.routes.sort((a, b) => {
      const distance = (route: NetworkRoute) => { const p = route.road.nearest(x, z)?.position; return p ? Math.hypot(p.x - x, p.z - z) : Infinity; };
      return distance(b) - distance(a);
    });
    for (const route of candidates) {
      if (this.cache.size <= 11) break;
      if (route === this.active || route.id === parent?.id || route.id === 'root' || route.id === 'back') continue;
      if (this.junctions.some(j => (j.route === this.active.id || j.route === parent?.id) && j.exits.includes(route.id)
        && Math.hypot(j.sample.position.x - x, j.sample.position.z - z) < 4000)) continue;
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

  private planJunctions(x: number, z: number, route = this.active): void {
    if (!junctionsEnabled(this.options)) return;
    const current = route.road.nearest(x, z)!;
    const first = Math.max(1, Math.floor((current.distance - 2400) / JUNCTION_INTERVAL));
    for (let index = first; index <= first + 1; index++) {
      const id = `${route.id}/${index}`, seed = `${route.seed}:junction:${index}`;
      const existing = this.junctions.find(junction => junction.id === id);
      if (existing && existing.exits.every(exit => this.cache.has(exit))) continue;
      const distance = index * JUNCTION_INTERVAL;
      if (distance > current.distance + 2800 || distance < current.distance - 1400) continue;
      const segment = route.road.segments.find(s => s.start.distance <= distance && s.end.distance >= distance);
      if (!segment) continue;
      if (route.road.segments.some(s => s.start.structure?.landmark && s.end.distance > distance - 3000 && s.start.distance < distance + 3000)) continue;
      const sample = segment.atDistance(distance);
      const childId = `branch-${hashSeed(seed).toString(36)}-${hashSeed(`${seed}:id`).toString(36)}`;
      if (this.options.roadType === 'highway' && !this.options.oneWay && this.options.interchanges) {
        if (Math.abs(sample.grade) > 0.001) continue;
        const interchange = highwayInterchange(id, sample, this.options), exits = [childId, `${childId}-opposite`];
        for (const [i, direction] of [1, -1].entries()) {
          let start: RoadControlPoint = { ...sample, routeId: exits[i], position: { ...sample.position, y: interchange.upperHeight },
            heading: sample.heading + direction * Math.PI / 2, grade: 0, distance: 0, bank: 0, junction: true, elevated: true,
            mountain: undefined, structure: undefined, structureStep: undefined, nextStructure: undefined, nextLandmark: undefined, climb: undefined };
          const prefix: RoadSegment[] = [];
          for (let j = 0; j < 12; j++) { const segment = new RoadSegment(start, start.heading, 0); prefix.push(segment); start = segment.end; }
          const child = this.add({ id: exits[i], seed: exits[i], origin: { ...start, junction: undefined, elevated: undefined, nextMountain: start.distance + 600 },
            prefix, parent: route.definition, opposite: exits[1 - i] });
          child.road.openings.length = 0;
          for (const ramp of interchange.ramps) for (const port of [ramp.entry, ramp.exit]) if (port.direction % 2 && port.u * direction > 0)
            child.road.openings.push({ start: Math.abs(port.u) - 170, end: Math.abs(port.u) + 170, side: -Math.sign(port.v) * direction });
          child.road.version++; child.ready = true; this.refresh(child);
        }
        route.road.openings.splice(0, route.road.openings.length, ...route.road.openings.filter(range => range.end >= current.distance - 8000));
        for (const ramp of interchange.ramps) for (const port of [ramp.entry, ramp.exit]) if (!(port.direction % 2)) {
          const opening = { start: distance + port.v - 170, end: distance + port.v + 170, side: Math.sign(port.u) };
          if (!route.road.openings.some(o => o.start === opening.start && o.side === opening.side)) route.road.openings.push(opening);
        }
        if (existing) this.junctions.splice(this.junctions.indexOf(existing), 1);
        this.junctions.push({ id, route: route.id, distance, sample, kind: 'stack', exits, interchange,
          ramps: interchange.ramps.map(r => ({ id: r.to % 2 ? exits[r.to === 3 ? 1 : 0] : route.id, direction: r.turn,
            sample: { ...sample, position: r.points[0], heading: sample.heading + r.from * Math.PI / 2, distance: distance + r.entry.v } })) });
        route.road.version++; this.version++; continue;
      }
      let kind: Junction['kind'] = this.options.interchanges && this.options.maxGrade >= 0.025 ? 'stack' : 'fork';
      const makeRamps = (type: Junction['kind']) => (type === 'stack' ? ['left', 'right', 'return'] as const : ['right'] as const).map((direction, index) => {
        const d = distance + index * 420;
        const entry = route.road.segments.find(s => s.start.distance <= d && s.end.distance >= d)?.atDistance(d);
        if (!entry) return undefined;
        const id = index ? `${childId}-${direction}` : childId;
        return { id, sample: entry, direction, prefix: this.ramp(entry, id, type, direction) };
      });
      let planned = makeRamps(kind);
      if (planned.some(ramp => !ramp)) continue;
      if (kind === 'stack' && planned.some(ramp => !this.clearance(ramp!.prefix, route.road)
        || absoluteElevation(this.options) && ramp!.prefix.some(s => [s.start.position.y, s.end.position.y]
          .some(y => y < this.options.altitudeMin - 0.05 || y > this.options.altitudeMax + 0.05)))) {
        kind = 'fork'; planned = makeRamps(kind);
      }
      const ramps = planned.map(ramp => ramp!);
      const junction: Junction = { id, route: route.id, distance, sample, kind, exits: ramps.map(ramp => ramp.id),
        ramps: ramps.map(({ id, sample, direction }) => ({ id, sample, direction })) };
      route.road.openings.splice(0, route.road.openings.length, ...route.road.openings.filter(range => range.end >= current.distance - 8000));
      for (const { id, sample: entry, prefix } of ramps) {
        const start = prefix.at(-1)!.end;
        const child = this.add({ id, seed: id, origin: { ...start, junction: undefined, elevated: undefined, nextMountain: start.distance + 600 }, prefix, parent: route.definition });
        child.road.openings.splice(0, 1, { start: 0, end: 280, side: -1 }); child.road.version++;
        if (!route.road.openings.some(range => range.start === entry.distance - 12)) route.road.openings.push({ start: entry.distance - 12, end: entry.distance + 280, side: 1 });
      }
      if (existing) this.junctions.splice(this.junctions.indexOf(existing), 1);
      this.junctions.push(junction); route.road.version++; this.version++;
    }
  }

  private ramp(entry: RoadSample, id: string, kind: Junction['kind'], direction: JunctionRamp['direction']): RoadSegment[] {
    const prefix: RoadSegment[] = [];
    let start: RoadControlPoint = { ...entry, position: { ...entry.position, y: entry.position.y + 0.015 }, distance: 0, routeId: id,
      mountain: undefined, climb: undefined, structure: undefined, structureStep: undefined, nextLandmark: undefined,
      nextStructure: undefined, opening: undefined, junction: true, bank: 0 };
    const grade = Math.min(this.options.maxGrade, 0.06);
    const pieces = kind === 'fork' ? [[0.32, 260, 0], [0.85, 300, 0]]
      : direction === 'left' ? [[0.32, 260, 0], [Math.PI / 2, 360, grade], [Math.PI, 480, grade * 0.8], [Math.PI * 1.5, 480, 0], [Math.PI * 1.5, 600, 0]]
        : direction === 'right' ? [[0.32, 260, 0], [Math.PI / 2, 520, 0], [Math.PI / 2, 900, 0]]
          : [[0.32, 260, 0], [Math.PI / 2, 700, grade], [Math.PI, 900, 0], [Math.PI, 1500, 0]];
    for (const [i, [turn, length, grade]] of pieces.entries()) {
      const piece = new RoadSegment({ ...start, elevated: kind === 'stack' && direction !== 'right' && i > 0 }, entry.heading + turn, grade, length);
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
