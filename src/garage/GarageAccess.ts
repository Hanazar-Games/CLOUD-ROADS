import { Garage, GARAGE_APRON } from './Garage';
import type { RoadSample } from '../road/RoadSegment';
import { RoadIndex } from '../road/RoadIndex';
import type { ServiceAccessPoint, ServicePoint } from '../service/ServiceTerrain';
import type { ServiceArea } from '../service/ServicePlanner';
import { garageInterchange } from './GarageInterchange';

export function connectGarage(garage: Garage, start: ServiceAccessPoint, heading: number): void {
  const end = garage.point(64, -80), distance = Math.hypot(end.x - start.x, end.z - start.z);
  const handle = Math.min(80, distance * 0.4);
  const a = { x: start.x + Math.sin(heading) * handle, z: start.z - Math.cos(heading) * handle };
  const b = garage.point(64, -80 - handle), points: ServiceAccessPoint[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80, u = 1 - t;
    const x = u ** 3 * start.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * end.x;
    const z = u ** 3 * start.z + 3 * u * u * t * a.z + 3 * u * t * t * b.z + t ** 3 * end.z;
    const blend = t * t * (3 - 2 * t), plane = start.y + start.slopeX * (x - start.x) + start.slopeZ * (z - start.z);
    points.push({ x, z, y: plane + (end.y - plane) * blend, slopeX: start.slopeX * (1 - blend), slopeZ: start.slopeZ * (1 - blend), halfWidth: 8 });
  }
  garage.ground.access = points.slice(1).map((b, i) => ({ a: points[i], b }));
  garage.ground.barriers = garage.ground.access.slice(12, -3).flatMap(({ a, b }) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z), nx = (a.z - b.z) / length, nz = (b.x - a.x) / length;
    return [-1, 1].map(side => ({ a: { x: a.x + nx * side * 8.4, y: a.y, z: a.z + nz * side * 8.4 },
      b: { x: b.x + nx * side * 8.4, y: b.y, z: b.z + nz * side * 8.4 } }));
  });
}

export function placeRoadGarage(garage: Garage, samples: readonly RoadSample[], terrain: { sample(x: number, z: number): number }, halfWidth: number,
  reserved: readonly ServiceArea[], crossings: readonly ServicePoint[] = []): ServiceArea | undefined {
  const index = new RoadIndex(samples.slice(1).map((p, i) => ({ a: samples[i].position, b: p.position })));
  const candidates: { sample: RoadSample; position: ServicePoint; score: number }[] = [];
  for (let i = 80; i < samples.length - 80; i += 48) {
    const sample = samples[i];
    if (sample.structure || sample.junction || Math.abs(sample.grade) > 0.12) continue;
    if (sample.distance < samples[0].distance + 520 || sample.distance > samples.at(-1)!.distance - 520) continue;
    const c = Math.cos(sample.heading), s = Math.sin(sample.heading);
    const corridor = samples.filter(p => Math.abs(p.distance - sample.distance) < 520);
    if (corridor.some(p => p.structure || p.junction || Math.abs(p.grade) > 0.08 || Math.abs(p.bank) > 0.14
      || Math.abs((p.position.x - sample.position.x) * c + (p.position.z - sample.position.z) * s) > 100)) continue;
    const position = { x: sample.position.x + c * 560 - s * 64, y: sample.position.y, z: sample.position.z + s * 560 + c * 64 };
    if (index.nearest(position.x, position.z, GARAGE_APRON + halfWidth + 24)
      || crossings.some(p => Math.hypot(p.x - position.x, p.z - position.z) < GARAGE_APRON + 40 || Math.hypot(p.x - sample.position.x, p.z - sample.position.z) < 330)
      || reserved.some(site => Math.abs(site.sample.distance - sample.distance) < 1000 || site.ground.pads.some(p => Math.hypot(p.x - position.x, p.z - position.z) < 300))) continue;
    let score = Math.abs(sample.distance) * 0.005;
    for (const x of [-52, 24, 100]) for (const z of [-80, 0, 80]) {
      const ground = terrain.sample(position.x + s * x + c * z, position.z - c * x + s * z);
      score += Math.abs(ground - position.y) + Math.max(0, position.y - ground - 4) * 8;
    }
    candidates.push({ sample, position, score });
  }
  const original = { ...garage.position }, heading = garage.heading;
  for (const { sample, position } of candidates.sort((a, b) => a.score - b.score).slice(0, 12)) {
    garage.relocate(position, sample.heading - Math.PI / 2);
    const { accessWindows, ground, valid } = garageInterchange(garage, sample, samples, halfWidth);
    if (!valid || !ground || crossings.some(p => ground.access.some(({ a }) => Math.hypot(p.x - a.x, p.z - a.z) < (a.halfWidth ?? 4) + 35))) continue;
    Object.assign(garage.ground, ground);
    return { id: -2, sample, start: sample.distance - 500, end: sample.distance + 500, accessWindows, ground: garage.ground };
  }
  if (candidates.length) garage.relocate(original, heading);
}
