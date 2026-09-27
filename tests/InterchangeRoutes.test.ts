import { expect, it } from 'vitest';
import { RoadSpine } from '../src/road/RoadSpine';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { roadProfile } from '../src/road/RoadProfile';
import { Raycaster, Scene, Vector3 } from 'three';
import { RoadSigns } from '../src/road/RoadSigns';
import { JunctionMesh } from '../src/road/JunctionMesh';

it.each([0.025, 0.06])('connects three directions with separated crossings at grade %s', maxGrade => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, routeStyle: 0 as const, maxGrade }, terrain = { sample: () => 100 };
  const root = new RoadSpine('multi', terrain, options), network = new RoadNetwork('multi', terrain, options, root);
  while (!root.advanceToDistance(24000)) { /* Load the complete interchange. */ }
  const point = root.segments.find(s => s.start.distance <= 20000 && s.end.distance >= 20000)!.atDistance(20000);
  for (let i = 0; i < 180; i++) network.update(point.position.x, point.position.z, point.position.y + 1, 4000);
  const junction = network.junctions[0];
  expect(junction.exits).toHaveLength(3);
  const branches = junction.exits.map(id => network.routes.find(r => r.id === id)!);
  const scene = new Scene(), signs = new RoadSigns(scene, options), details = new JunctionMesh(scene, options);
  signs.update(root.samples, [], [], 1, 0, 0, [], [junction]); details.update([junction], network.routes, 1, 0, 0); scene.updateMatrixWorld(true);
  for (const ramp of junction.ramps) {
    const at = ramp.sample.distance - 90, p = root.segments.find(s => s.start.distance <= at && s.end.distance >= at)!.atDistance(at);
    const ray = new Raycaster(new Vector3(p.position.x + roadProfile(options).centers.at(-1)! + 1.8, p.position.y + 6.4, p.position.z + 12), new Vector3(0, 0, -1), 0, 16);
    expect(ray.intersectObjects([signs.boards, signs.backs, details.parts])[0]?.object === signs.boards).toBe(true);
  }
  signs.dispose(); details.dispose(); expect(scene.children).toHaveLength(0);
  for (const [i, branch] of branches.entries()) {
    const ramp = junction.ramps[i], first = branch.road.samples[0];
    expect(first.position.x).toBeCloseTo(ramp.sample.position.x, 5);
    expect(first.position.z).toBeCloseTo(ramp.sample.position.z, 5);
    expect(first.position.y - ramp.sample.position.y).toBeCloseTo(0.015, 5);
    expect(root.openings.some(o => o.start <= ramp.sample.distance && o.end >= ramp.sample.distance + 260)).toBe(true);
    const end = branch.definition.prefix.at(-1)!.end;
    expect(Math.cos(end.heading - point.heading)).toBeCloseTo(i === 2 ? -1 : 0, 5);
    for (const other of branches.slice(i + 1)) for (const sample of branch.road.samples.filter((s, index) => index % 3 === 0 && s.distance > 300 && s.distance < end.distance)) {
      const near = other.road.nearest(sample.position.x, sample.position.z)!;
      if (Math.hypot(sample.position.x - near.position.x, sample.position.z - near.position.z) < roadProfile(options).outerHalfWidth * 2 + 5)
        expect(Math.abs(sample.position.y - near.position.y)).toBeGreaterThanOrEqual(12);
    }
  }
});
