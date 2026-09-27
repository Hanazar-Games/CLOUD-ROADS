import { expect, it } from 'vitest';
import { Raycaster, Scene, Vector3 } from 'three';
import { serviceArchitecture } from '../src/service/ServiceArchitecture';
import { ServiceMesh } from '../src/service/ServiceMesh';
import { ServicePlanner } from '../src/service/ServicePlanner';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { padPoint } from '../src/service/ServiceTerrain';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { chargingBays, serviceObstacles } from '../src/service/ServiceAmenities';
import { parkingSlots } from '../src/service/ServiceParking';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { RoadSpine } from '../src/road/RoadSpine';

it('varies roofs and structures between service sites while keeping access lanes clear', () => {
  const terrain = { sample: () => 400 }, generator = new RoadGenerator('architecture', terrain);
  const segment = new RoadSegment(generator.start, 0, 0, 22000);
  const samples = Array.from({ length: 11001 }, (_, i) => segment.sample(i / 11000));
  const site = new ServicePlanner('architecture', terrain).detect(samples)[0];
  const scene = new Scene(), mesh = new ServiceMesh(scene, DEFAULT_OPTIONS, terrain);
  const signatures: number[][] = [];
  expect(new Set([1, 2, 3].map(id => serviceArchitecture('alpine', id))).size).toBe(3);
  expect(serviceArchitecture('badlands', 1)).toBe('courtyard');
  for (const id of [1, 2, 3]) {
    mesh.update([{ ...site, id }], id, 0, 0); scene.updateMatrixWorld(true);
    signatures.push(Array.from(mesh.buildings.instanceMatrix.array.slice(0, mesh.buildings.count * 16)));
    const pad = site.ground.pads[0], a = padPoint(pad, -27, -70, 1), b = padPoint(pad, -27, 70, 1);
    const from = new Vector3(a.x, a.y, a.z), delta = new Vector3(b.x, b.y, b.z).sub(from);
    expect(new Raycaster(from, delta.clone().normalize(), 0, delta.length()).intersectObject(mesh.buildings)).toHaveLength(0);
  }
  for (let i = 0; i < signatures.length; i++) for (let j = i + 1; j < signatures.length; j++) expect(signatures[i]).not.toEqual(signatures[j]);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it('keeps charging equipment outside parking bays and blocks walking through solid fixtures', () => {
  const terrain = { sample: () => 400 }, road = new RoadSpine('amenities', terrain), generator = new RoadGenerator('amenities', terrain);
  const segment = new RoadSegment(generator.start, 0, 0, 22000);
  const samples = Array.from({ length: 11001 }, (_, i) => segment.sample(i / 11000));
  const site = new ServicePlanner('amenities', terrain).detect(samples)[0];
  const surface = new DrivingSurface({ seed: 'amenities', options: DEFAULT_OPTIONS, road, bridges: [], tunnels: [], services: [site], groundHeight: terrain.sample });
  for (const pad of site.ground.pads) {
    const start = padPoint(pad, -52.5 * pad.side, -82), end = padPoint(pad, -52.5 * pad.side, -46);
    expect(surface.constrainWalker(end, start.x, start.z)).toBe(false);
  }
  for (const a of chargingBays) {
    const slot = parkingSlots().find(s => s.x === -57 && s.along === a)!;
    expect(slot).toBeDefined();
    expect(slot.x - slot.length / 2).toBeGreaterThan(-62 + 0.4);
  }
  for (const pad of site.ground.pads) for (const [x, a] of serviceObstacles.slice(3)) {
    const start = padPoint(pad, (x - 2) * pad.side, a), body = padPoint(pad, x * pad.side, a);
    expect(surface.constrainWalker(body, start.x, start.z)).toBe(true);
    expect(Math.hypot(body.x - padPoint(pad, x * pad.side, a).x, body.z - padPoint(pad, x * pad.side, a).z)).toBeGreaterThan(0.4);
  }
});
