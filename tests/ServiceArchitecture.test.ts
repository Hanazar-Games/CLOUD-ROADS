import { expect, it } from 'vitest';
import { Raycaster, Scene, Vector3 } from 'three';
import { serviceArchitecture } from '../src/service/ServiceArchitecture';
import { ServiceMesh } from '../src/service/ServiceMesh';
import { ServicePlanner } from '../src/service/ServicePlanner';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { padPoint, type ServicePad } from '../src/service/ServiceTerrain';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { chargingBays, serviceObstacles } from '../src/service/ServiceAmenities';
import { parkingSlots } from '../src/service/ServiceParking';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { RoadSpine } from '../src/road/RoadSpine';

it.each([-0.02, 0.02])('connects solar canopy supports and panels on a %s grade in both directions', grade => {
  const terrain = { sample: () => 400 }, generator = new RoadGenerator('canopy', terrain);
  const segment = new RoadSegment(generator.start, 0, 0, 22000);
  const site = new ServicePlanner('canopy', terrain).detect(Array.from({ length: 11001 }, (_, i) => segment.sample(i / 11000)))[0];
  const scene = new Scene(), mesh = new ServiceMesh(scene, DEFAULT_OPTIONS, terrain);
  const pads: ServicePad[] = [-1, 1].map(side => ({ ...site.ground.pads[0], x: side * 250, heading: 0.7, side, grade }));
  mesh.update([{ ...site, ground: { ...site.ground, pads } }], 1, 0, 0); scene.updateMatrixWorld(true);
  for (const pad of pads) {
    for (const a of [-78, -50]) for (const x of [-62, -51.5]) {
      const p = padPoint(pad, x * pad.side, a, 4.4);
      const hits = new Raycaster(new Vector3(p.x, p.y, p.z), new Vector3(0, 1, 0), 0, 0.13).intersectObject(mesh.buildings);
      expect(hits.length, 'support must touch the canopy underside').toBeGreaterThan(0);
    }
    for (const a of [-77, -65, -51]) {
      const p = padPoint(pad, -56 * pad.side, a, 5);
      const hits = new Raycaster(new Vector3(p.x, p.y, p.z), new Vector3(0, -1, 0), 0, 1).intersectObject(mesh.buildings);
      expect(hits[0].point.y - padPoint(pad, 0, a).y).toBeCloseTo(4.7, 4);
    }
    const face = padPoint(pad, -61.52 * pad.side, -64, 1.5), outward = new Vector3(Math.cos(pad.heading) * pad.side, 0, Math.sin(pad.heading) * pad.side);
    mesh.chargerDetails.update(face, 0, 0, 2); scene.updateMatrixWorld(true);
    expect(mesh.chargerDetails.mesh.count).toBe(3);
    const hit = new Raycaster(new Vector3(face.x, face.y, face.z).addScaledVector(outward, 1).add(new Vector3(0, 0.1, 0)), outward.clone().negate(), 0, 1.05)
      .intersectObject(mesh.chargerDetails.mesh)[0];
    expect(hit).toBeDefined(); expect(hit.distance).toBeGreaterThan(0.9);
  }
  mesh.dispose();
});

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

it('keeps detailed shop and toilet arcades clear on mirrored graded pads at capacity', () => {
  const terrain = { sample: () => 400 }, generator = new RoadGenerator('arcades', terrain);
  const segment = new RoadSegment(generator.start, 0, 0, 22000);
  const site = new ServicePlanner('arcades', terrain).detect(Array.from({ length: 11001 }, (_, i) => segment.sample(i / 11000)))[0];
  const sites = [1, 2, 3].map(id => ({ ...site, id, ground: { ...site.ground, pads: [-1, 1].map(side => ({ ...site.ground.pads[0],
    x: id * 2000 + side * 250, heading: 0.7, side, grade: side * 0.08 })) } }));
  const scene = new Scene(), mesh = new ServiceMesh(scene, DEFAULT_OPTIONS, terrain);
  mesh.update(sites, 1, 0, 0); scene.updateMatrixWorld(true);
  for (const area of sites) for (const pad of area.ground.pads) for (const [x, from, to] of [[35, 12, 48], [42, 65, 83]]) {
    const a = padPoint(pad, x * pad.side, from, 1.75), b = padPoint(pad, x * pad.side, to, 1.75);
    const start = new Vector3(a.x, a.y, a.z), delta = new Vector3(b.x, b.y, b.z).sub(start);
    expect(new Raycaster(start, delta.clone().normalize(), 0, delta.length()).intersectObject(mesh.buildings)).toHaveLength(0);
  }
  for (const batch of [mesh.buildings, mesh.windows, mesh.lights]) expect(batch.count).toBeLessThan(batch.instanceMatrix.count);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});
