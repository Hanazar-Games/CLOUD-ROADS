import { Garage, GARAGE_APRON } from './Garage';
import type { RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';
import { RoadIndex } from '../road/RoadIndex';
import type { ServiceAccessPoint, ServicePoint } from '../service/ServiceTerrain';
import type { ServiceArea } from '../service/ServicePlanner';

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
  let best: { sample: RoadSample; position: ServicePoint; score: number } | undefined;
  for (let i = 80; i < samples.length - 80; i += 48) {
    const sample = samples[i];
    if (sample.structure || sample.junction || Math.abs(sample.grade) > 0.12) continue;
    const c = Math.cos(sample.heading), s = Math.sin(sample.heading);
    const position = { x: sample.position.x + c * 300 - s * 64, y: sample.position.y, z: sample.position.z + s * 300 + c * 64 };
    if (index.nearest(position.x, position.z, GARAGE_APRON + halfWidth + 24)
      || crossings.some(p => Math.hypot(p.x - position.x, p.z - position.z) < GARAGE_APRON + 40 || Math.hypot(p.x - sample.position.x, p.z - sample.position.z) < 330)
      || reserved.some(site => site.ground.pads.some(p => Math.hypot(p.x - position.x, p.z - position.z) < 300))) continue;
    let score = Math.abs(sample.distance) * 0.005;
    for (const x of [-52, 24, 100]) for (const z of [-80, 0, 80]) {
      const ground = terrain.sample(position.x + s * x + c * z, position.z - c * x + s * z);
      score += Math.abs(ground - position.y) + Math.max(0, position.y - ground - 4) * 8;
    }
    if (!best || score < best.score) best = { sample, position, score };
  }
  if (!best) return;
  const { sample, position } = best, { right, normal } = roadFrame(sample);
  garage.relocate(position, sample.heading - Math.PI / 2);
  const offset = halfWidth - 2;
  connectGarage(garage, { x: sample.position.x + right.x * offset, y: sample.position.y + right.y * offset,
    z: sample.position.z + right.z * offset, slopeX: -normal.x / normal.y, slopeZ: -normal.z / normal.y }, sample.heading);
  return { id: -2, sample, start: sample.distance - 30, end: sample.distance + 100, accessSide: 1, ground: garage.ground };
}
