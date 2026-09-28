import { RoadIndex, type RoadEdge } from '../road/RoadIndex';

export interface ServicePoint { x: number; y: number; z: number }
export interface ServiceAccessPoint extends ServicePoint { slopeX: number; slopeZ: number }
export interface ServicePad extends ServicePoint { heading: number; grade: number; side: number; halfWidth: number; halfLength: number }
export interface ServiceBarrier extends RoadEdge<ServicePoint> { height?: number }
export interface ServiceCrossover { kind: 'over' | 'under'; access: RoadEdge<ServiceAccessPoint>[]; barriers: ServiceBarrier[]; supports: ServicePoint[]; deck: number; roof?: number }
export interface ServiceGround { pads: ServicePad[]; access: RoadEdge<ServiceAccessPoint>[]; elevated: boolean; barriers: ServiceBarrier[]; crossover?: ServiceCrossover; excavation?: ServicePoint & { radius: number; bottom: number } }
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function padPoint(pad: ServicePad, x: number, along: number, height = 0): ServicePoint {
  return { x: pad.x + Math.cos(pad.heading) * x + Math.sin(pad.heading) * along,
    y: pad.y + pad.grade * along + height, z: pad.z + Math.sin(pad.heading) * x - Math.cos(pad.heading) * along };
}

export function crossoverShelter(cross: ServiceCrossover | undefined, x: number, y: number, z: number): number {
  if (!cross || cross.roof === undefined || y < cross.deck - 0.5 || y > cross.roof) return 0;
  const covered = cross.access.filter(({ a, b }) => Math.abs(a.y - cross.deck) < 0.01 && Math.abs(b.y - cross.deck) < 0.01);
  for (const { a, b } of covered) {
    const dx = b.x - a.x, dz = b.z - a.z, t = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz);
    const joint = 0.4 / Math.hypot(dx, dz);
    if (t < -joint || t > 1 + joint || Math.hypot(x - a.x - dx * t, z - a.z - dz * t) > 3.8) continue;
    const first = covered[0].a, last = covered.at(-1)!.b;
    return Math.min(1, Math.hypot(x - first.x, z - first.z) / 12, Math.hypot(x - last.x, z - last.z) / 12);
  }
  return 0;
}

export class ServiceTerrain {
  private readonly access;
  private readonly index;
  private readonly pads;
  private readonly elevatedPads = new Set<ServicePad>();
  private readonly elevatedAccess = new Set<RoadEdge<ServiceAccessPoint>>();
  private readonly crossAccess;
  private readonly crossIndex;

  constructor(readonly sites: readonly ServiceGround[]) {
    this.access = sites.flatMap(site => site.access);
    this.index = new RoadIndex(this.access);
    this.pads = sites.flatMap(site => site.pads);
    this.crossAccess = sites.flatMap(site => site.crossover?.access ?? []);
    this.crossIndex = new RoadIndex(this.crossAccess);
    for (const site of sites) if (site.elevated) {
      for (const pad of site.pads) this.elevatedPads.add(pad);
      for (const edge of site.access) this.elevatedAccess.add(edge);
    }
  }

  private local(pad: ServicePad, x: number, z: number) {
    const dx = x - pad.x, dz = z - pad.z, cos = Math.cos(pad.heading), sin = Math.sin(pad.heading);
    return { x: dx * cos + dz * sin, along: dx * sin - dz * cos };
  }

  height(x: number, z: number, ground: number, roadDistance: number, roadHalfWidth: number): number {
    const foundation = ground;
    for (const site of this.sites) if (site.excavation) {
      const hole = site.excavation, distance = Math.hypot(x - hole.x, z - hole.z);
      const rim = hole.y - 0.3;
      if (distance < hole.radius + 28) {
        const target = distance <= hole.radius ? hole.bottom : hole.bottom + (rim - hole.bottom) * smooth((distance - hole.radius) / 8);
        ground += (Math.min(ground, target) - ground) * (1 - smooth((distance - hole.radius - 12) / 16));
      }
    }
    let crossingFloor = Infinity;
    const crossing = this.crossIndex.nearest(x, z, 22);
    if (crossing) {
      const { a, b } = this.crossAccess[crossing.index], target = a.y + (b.y - a.y) * crossing.t - 0.7;
      if (crossing.distanceSquared <= 64) crossingFloor = target;
      ground += Math.min(0, target - ground) * (1 - smooth((Math.sqrt(crossing.distanceSquared) - 8) / 14));
    }
    if (!this.sites.length || roadDistance <= roadHalfWidth + 0.1) return ground;
    const roadBlend = smooth((roadDistance - roadHalfWidth - 0.1) / 2);
    for (const pad of this.pads) {
      const local = this.local(pad, x, z);
      const distance = Math.hypot(Math.max(0, Math.abs(local.x) - pad.halfWidth - 3), Math.max(0, Math.abs(local.along) - pad.halfLength - 3));
      if (distance >= 24) continue;
      const elevated = this.elevatedPads.has(pad), target = pad.y + pad.grade * local.along - (elevated ? 1.7 : 0.14);
      ground += (Math.min(elevated ? ground : foundation + 5, target) - ground) * (1 - smooth(distance / 24)) * roadBlend;
    }
    const nearest = this.index.nearest(x, z, 22);
    if (nearest) {
      const { a, b } = this.access[nearest.index], t = nearest.t;
      const elevated = this.elevatedAccess.has(this.access[nearest.index]);
      const target = a.y + (b.y - a.y) * t - (elevated ? 2 : 0.38)
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t);
      ground += (Math.min(elevated ? ground : foundation + 5, target) - ground) * (1 - smooth((Math.sqrt(nearest.distanceSquared) - 6) / 16)) * roadBlend;
    }
    return Math.min(ground, crossingFloor);
  }

  contains(x: number, z: number): boolean {
    return this.sites.some(site => site.excavation && Math.hypot(x - site.excavation.x, z - site.excavation.z) < site.excavation.radius + 20)
      || this.pads.some(pad => { const p = this.local(pad, x, z); return Math.abs(p.x) < pad.halfWidth + 8 && Math.abs(p.along) < pad.halfLength + 8; })
      || !!this.index.nearest(x, z, 10) || !!this.crossIndex.nearest(x, z, 12);
  }

  crossesBelow(point: ServicePoint, radius: number): boolean {
    for (const i of this.crossIndex.within(point.x - radius, point.z - radius, point.x + radius, point.z + radius)) {
      const { a, b } = this.crossAccess[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
      if (point.y - a.y - (b.y - a.y) * t > 6 && Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t) < radius) return true;
    }
    return false;
  }

  forChunk(cx: number, cz: number): ServiceGround[] {
    return this.sites.filter(site => site.excavation && Math.abs(site.excavation.x - (cx + 0.5) * 256) < 256 && Math.abs(site.excavation.z - (cz + 0.5) * 256) < 256
      || site.pads.some(pad => Math.abs(pad.x - (cx + 0.5) * 256) < 350 && Math.abs(pad.z - (cz + 0.5) * 256) < 350)
      || [...site.access, ...site.crossover?.access ?? []].some(edge => Math.abs(edge.a.x - (cx + 0.5) * 256) < 170 && Math.abs(edge.a.z - (cz + 0.5) * 256) < 170));
  }
}
