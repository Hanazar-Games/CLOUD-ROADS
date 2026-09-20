import { expect, it } from 'vitest';
import { Raycaster, Scene, Vector3 } from 'three';
import { serviceArchitecture } from '../src/service/ServiceArchitecture';
import { ServiceMesh } from '../src/service/ServiceMesh';
import { ServicePlanner } from '../src/service/ServicePlanner';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { padPoint } from '../src/service/ServiceTerrain';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

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
