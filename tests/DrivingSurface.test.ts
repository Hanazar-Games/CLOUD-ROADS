import { describe, expect, it } from 'vitest';
import { RoadSpine } from '../src/road/RoadSpine';
import { roadFrame } from '../src/road/RoadFrame';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { ServicePlanner, type ServiceArea } from '../src/service/ServicePlanner';
import { padPoint } from '../src/service/ServiceTerrain';

function world(highway = false) {
  const options = { ...DEFAULT_OPTIONS, roadType: highway ? 'highway' as const : 'mountain' as const };
  const road = new RoadSpine('driving-surface', { sample: () => 100 }, options);
  while (!road.update(0)) { /* bounded generation */ }
  return { road, options, services: [] as ServiceArea[], tunnels: [], sampleGround: () => ({ height: -50 }) };
}

describe('DrivingSurface', () => {
  it('contacts the banked road plane above a valley, including both highway decks', () => {
    const scene = world(true), surface = new DrivingSurface(scene);
    const sample = scene.road.samples[120], { right } = roadFrame(sample);
    for (const offset of [-9, 9]) {
      const x = sample.position.x + right.x * offset, z = sample.position.z + right.z * offset;
      expect(surface.sample(x, z).height).toBeCloseTo(sample.position.y + right.y * offset, 2);
      expect(surface.sample(x, z).grip).toBe(1);
    }
    expect(surface.sample(sample.position.x + 100, sample.position.z).height).toBe(-50);
  });

  it('spawns away from the route endpoint with all four wheels supported', () => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics();
    const start = scene.road.samples[0].position, spawn = surface.spawn(start.x, start.z)!;
    car.reset(spawn.x, spawn.z, spawn.heading, surface.sample);
    expect(car.wheels.every(wheel => wheel.height > 99)).toBe(true);
    expect(car.x).toBeGreaterThan(start.x);
  });

  it('blocks crossing the highway divider while allowing travel along the carriageway', () => {
    const scene = world(true), surface = new DrivingSurface(scene), car = new VehiclePhysics();
    const sample = scene.road.samples[100], { right } = roadFrame(sample);
    const x = sample.position.x + right.x * 3, z = sample.position.z + right.z * 3;
    car.reset(x, z, sample.heading, surface.sample);
    car.x = sample.position.x; car.z = sample.position.z; car.speed = 20;
    expect(surface.constrain(car, x, z)).toBe(true);
    expect(surface.sample(car.x, car.z).grip).toBe(1);
    expect(car.speed).toBeLessThan(20);
  });

  it('follows service pads and ramps and refreshes streamed surface data', () => {
    const scene = world(true), surface = new DrivingSurface(scene);
    while (!scene.road.advanceToDistance(19000)) { /* Complete a service window. */ }
    scene.services = new ServicePlanner('driving-surface', { sample: () => 100 }, scene.options).detect(scene.road.samples);
    expect(scene.services.length).toBeGreaterThan(0);
    for (const site of scene.services) {
      for (const pad of site.ground.pads) {
        const point = padPoint(pad, 0, 30);
        expect(surface.sample(point.x, point.z).height).toBeCloseTo(point.y, 5);
      }
      for (const { a, b } of site.ground.access.filter((_, i) => i % 5 === 0)) {
        const point = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        expect(surface.sample(point.x, point.z).height).toBeCloseTo((a.y + b.y) / 2, 1);
      }
    }
    surface.wet = true;
    const spawn = surface.spawn(scene.road.samples[100].position.x, scene.road.samples[100].position.z)!;
    expect(surface.sample(spawn.x, spawn.z).grip).toBeLessThan(1);
    scene.services = [];
    expect(surface.sample(1e6, 1e6).height).toBe(-50);
  });
});
