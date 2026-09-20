import { RoadIndex, type RoadEdge } from '../road/RoadIndex';

export interface ServicePoint { x: number; y: number; z: number }
export interface ServiceAccessPoint extends ServicePoint { slopeX: number; slopeZ: number }
export interface ServicePad extends ServicePoint { heading: number; grade: number; side: number; halfWidth: number; halfLength: number }
export interface ServiceGround { pads: ServicePad[]; access: RoadEdge<ServiceAccessPoint>[]; elevated: boolean; barriers: RoadEdge<ServicePoint>[] }
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function padPoint(pad: ServicePad, x: number, along: number, height = 0): ServicePoint {
  return { x: pad.x + Math.cos(pad.heading) * x + Math.sin(pad.heading) * along,
    y: pad.y + pad.grade * along + height, z: pad.z + Math.sin(pad.heading) * x - Math.cos(pad.heading) * along };
}

export class ServiceTerrain {
  private readonly access;
  private readonly index;
  private readonly pads;
  private readonly elevatedPads = new Set<ServicePad>();
  private readonly elevatedAccess = new Set<RoadEdge<ServiceAccessPoint>>();

  constructor(readonly sites: readonly ServiceGround[]) {
    this.access = sites.flatMap(site => site.access);
    this.index = new RoadIndex(this.access);
    this.pads = sites.flatMap(site => site.pads);
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
    if (!this.sites.length || roadDistance <= roadHalfWidth + 0.1) return ground;
    const roadBlend = smooth((roadDistance - roadHalfWidth - 0.1) / 2);
    for (const pad of this.pads) {
      const local = this.local(pad, x, z);
      const distance = Math.hypot(Math.max(0, Math.abs(local.x) - pad.halfWidth - 3), Math.max(0, Math.abs(local.along) - pad.halfLength - 3));
      if (distance >= 24) continue;
      const elevated = this.elevatedPads.has(pad), target = pad.y + pad.grade * local.along - (elevated ? 1.7 : 0.14);
      ground += Math.min(elevated ? 0 : 5, target - ground) * (1 - smooth(distance / 24)) * roadBlend;
    }
    const nearest = this.index.nearest(x, z, 22);
    if (nearest) {
      const { a, b } = this.access[nearest.index], t = nearest.t;
      const elevated = this.elevatedAccess.has(this.access[nearest.index]);
      const target = a.y + (b.y - a.y) * t - (elevated ? 2 : 0.38)
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t);
      ground += Math.min(elevated ? 0 : 5, target - ground) * (1 - smooth((Math.sqrt(nearest.distanceSquared) - 6) / 16)) * roadBlend;
    }
    return ground;
  }

  contains(x: number, z: number): boolean {
    return this.pads.some(pad => { const p = this.local(pad, x, z); return Math.abs(p.x) < pad.halfWidth + 8 && Math.abs(p.along) < pad.halfLength + 8; })
      || !!this.index.nearest(x, z, 10);
  }

  forChunk(cx: number, cz: number): ServiceGround[] {
    return this.sites.filter(site => site.pads.some(pad => Math.abs(pad.x - (cx + 0.5) * 256) < 350 && Math.abs(pad.z - (cz + 0.5) * 256) < 350)
      || site.access.some(edge => Math.abs(edge.a.x - (cx + 0.5) * 256) < 170 && Math.abs(edge.a.z - (cz + 0.5) * 256) < 170));
  }
}
