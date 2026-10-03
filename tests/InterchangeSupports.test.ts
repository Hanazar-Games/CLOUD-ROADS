import { expect, it } from 'vitest';
import { Matrix4, Scene, Vector3 } from 'three';
import { highwayInterchange } from '../src/road/HighwayInterchange';
import { InterchangeMesh } from '../src/road/InterchangeMesh';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each([0, 1])('centers ramp piers, embeds sloped foundations and retains bearings at detail %s', detail => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
  const start = new RoadGenerator('ramp-supports', { sample: () => 200 }, options).start;
  const center = new RoadSegment({ ...start, heading: 0.7 }, 0.7, 0).sample(0);
  const plan = highwayInterchange('ramp-supports', center, options), scene = new Scene(), mesh = new InterchangeMesh(scene);
  const terrain = { sample: (x: number, z: number) => 60 + 0.02 * x + 0.04 * z };
  mesh.update([plan], { x: 0, z: 0 }, new RoadCorridor([], options), terrain, detail);
  scene.updateMatrixWorld(true);
  const column = new Matrix4(), footing = new Matrix4(), cap = new Matrix4();
  let checked = 0;
  for (let i = 0; i < mesh.decks.count; i += 3) {
    mesh.decks.getMatrixAt(i, column); mesh.decks.getMatrixAt(i + 1, footing); mesh.decks.getMatrixAt(i + 2, cap);
    const c = new Vector3().setFromMatrixPosition(column), roof = new Vector3().setFromMatrixPosition(cap);
    expect(Math.hypot(c.x - roof.x, c.z - roof.z)).toBeLessThan(0.02);
    const along = new Vector3().setFromMatrixColumn(column, 2).normalize(), across = new Vector3().setFromMatrixColumn(cap, 2).normalize();
    expect(Math.abs(along.dot(across))).toBeLessThan(0.001);
    expect(c.y + new Vector3().setFromMatrixColumn(column, 1).length() / 2).toBeLessThan(roof.y + 0.35);
    for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      const p = new Vector3(x, -0.5, z).applyMatrix4(footing).add(mesh.decks.position);
      expect(p.y).toBeLessThanOrEqual(terrain.sample(p.x, p.z) - 0.2);
    }
    checked++;
  }
  expect(checked).toBeGreaterThan(100);
  let bearings = 0;
  for (let i = 0; i < mesh.rails.count; i++) {
    mesh.rails.getMatrixAt(i, column);
    if (Math.abs(new Vector3().setFromMatrixColumn(column, 1).length() - 0.2) < 0.001) bearings++;
  }
  expect(bearings).toBe(checked * 2); mesh.dispose();
});
