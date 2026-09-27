import { expect, it } from 'vitest';
import { roadProfile } from '../src/road/RoadProfile';
import { DEFAULT_OPTIONS, validWorldOptions } from '../src/world/WorldOptions';
import { RoadSpine } from '../src/road/RoadSpine';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';

it('places four avenue lanes inside custom pavement with two lanes in each direction', () => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'avenue' as const, roadWidth: 11.5, roadLanes: 4 };
  expect(validWorldOptions(options)).toBe(true);
  const profile = roadProfile(options);
  expect(profile.centers).toEqual([0]);
  expect(profile.lanes.map(lane => lane.direction)).toEqual([-1, -1, 1, 1]);
  expect(profile.laneWidth).toBeCloseTo(2.875);
  for (const lane of profile.lanes) expect(Math.abs(lane.offset) + profile.laneWidth / 2).toBeLessThanOrEqual(5.75);
});

it('places the player facing the permitted direction on the reverse half of a one-way road', () => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, oneWay: true, roadLanes: 1, roadWidth: 5, routeStyle: 0 as const };
  const height = { sample: () => 0 }, root = new RoadSpine('one-way', height, options);
  const network = new RoadNetwork('one-way', height, options, root);
  for (let i = 0; i < 100; i++) network.update(128, 428, 1, 4000);
  expect(network.active.id).toBe('back');
  const surface = new DrivingSurface({ seed: 'one-way', options, network, road: network.active.road, bridges: [], tunnels: [], services: [], groundHeight: () => 0 });
  const spawn = surface.spawn(128, 428)!;
  expect(spawn).toBeDefined(); expect(Math.cos(spawn.heading)).toBeGreaterThan(0.99);
  expect(spawn.x).toBeCloseTo(128, 3);
});

it('supports one to three lanes per highway direction and a single one-way carriageway', () => {
  for (const roadLanes of [1, 2, 3]) {
    const profile = roadProfile({ ...DEFAULT_OPTIONS, roadType: 'highway', roadWidth: 12, roadLanes });
    expect(profile.lanes.filter(lane => lane.direction === 1)).toHaveLength(roadLanes);
    expect(profile.lanes.filter(lane => lane.direction === -1)).toHaveLength(roadLanes);
    expect(profile.centers).toHaveLength(2);
  }
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, oneWay: true, roadLanes: 1, roadWidth: 5 };
  expect(validWorldOptions(options)).toBe(true);
  expect(roadProfile(options).lanes).toEqual([{ offset: 0, direction: 1, index: 0 }]);
  expect(roadProfile(options).outerHalfWidth).toBe(3.7);
});

it('rejects unsafe widths, odd two-way undivided layouts and excessive highway lanes', () => {
  for (const patch of [{ roadWidth: 4.9 }, { roadWidth: 12.5 }, { roadWidth: 7.3 }, { roadLanes: 3 },
    { roadLanes: 4, roadWidth: 5 }, { roadType: 'highway', roadLanes: 4, roadWidth: 12 },
    { roadType: 'highway', roadLanes: 3, roadWidth: 8 }])
    expect(validWorldOptions({ ...DEFAULT_OPTIONS, ...patch })).toBe(false);
});
