import { describe, expect, it, vi } from 'vitest';
import { RoadSpine } from '../src/road/RoadSpine';
import { roadFrame } from '../src/road/RoadFrame';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { ServicePlanner, type ServiceArea } from '../src/service/ServicePlanner';
import { padPoint } from '../src/service/ServiceTerrain';
import { hasRoadBarrier } from '../src/road/RoadProtection';
import type { BridgeSpan } from '../src/bridge/BridgeDetector';
import { SeasonState } from '../src/season/SeasonState';

function world(highway = false) {
  const options = { ...DEFAULT_OPTIONS, roadType: highway ? 'highway' as const : 'mountain' as const };
  const road = new RoadSpine('driving-surface', { sample: () => 100 }, options);
  while (!road.update(0)) { /* bounded generation */ }
  return { seed: 'driving-surface', road, options, bridges: [] as BridgeSpan[], services: [] as ServiceArea[], tunnels: [], groundHeight: () => -50 };
}

describe('DrivingSurface', () => {
  it.each([-0.2, 0.2])('exits a long coach beside its cab on a %s grade', grade => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics('coach');
    const sample = scene.road.samples[100];
    vi.spyOn(scene.road, 'nearest').mockImplementation((_x, z) => ({ ...sample,
      position: { x: 0, y: 100 - z * grade, z }, heading: 0, grade, bank: 0,
    }));
    car.reset(2, 0, 0, surface.sample);
    const exit = surface.exit(car);
    expect(exit).toBeDefined();
    expect(exit!.y).toBeCloseTo(100 - exit!.z * grade);
    expect(-exit!.z).toBeGreaterThan(4.5);
    vi.restoreAllMocks();
  });
  it.each([false, true])('exits beside the cab on the same bridge deck without crossing a barrier (highway %s)', highway => {
    const scene = world(highway), surface = new DrivingSurface(scene), car = new VehiclePhysics('truck5');
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 151, openStart: true, openEnd: true }];
    const sample = scene.road.samples[300], spawn = surface.spawn(sample.position.x, sample.position.z, car.profile)!;
    car.reset(spawn.x, spawn.z, spawn.heading, surface.sample);
    const exit = surface.exit(car)!;
    expect(exit).toBeDefined();
    expect(exit.y).toBeCloseTo(surface.sample(exit.x, exit.z, car.y + 1).height);
    expect(Math.abs(exit.y - sample.position.y)).toBeLessThan(2);
    const side = (exit.x - car.x) * Math.cos(car.heading) + (exit.z - car.z) * Math.sin(car.heading);
    expect(Math.abs(side)).toBeGreaterThan(car.profile.width / 2 + 0.35);
    expect(surface.constrainWalker({ ...exit }, car.x, car.z)).toBe(false);
    expect(surface.canBoard(car, exit)).toBe(true);
    expect(surface.canBoard(car, { ...exit, y: exit.y - 2 })).toBe(false);
    expect(surface.canBoard(car, { ...exit, x: exit.x + 20 })).toBe(false);
    car.y += 30;
    expect(surface.exit(car)).toBeUndefined();
  });
  it('does not board through a bridge guardrail next to the vehicle', () => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics('coach'), sample = scene.road.samples[100];
    vi.spyOn(scene.road, 'nearest').mockImplementation((_x, z) => ({ ...sample, position: { x: 0, y: 100, z }, heading: 0, grade: 0, bank: 0 }));
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 151, openStart: true, openEnd: true }];
    car.reset(2.8, 0, 0, surface.sample);
    expect(surface.canBoard(car, { x: 6, y: 100, z: -car.profile.eye.along })).toBe(false);
    expect(surface.canBoard(car, { x: 2.8, y: 100, z: 4.8 })).toBe(false);
    expect(surface.canBoard(car, surface.exit(car)!)).toBe(true);
    vi.restoreAllMocks();
  });
  it('uses seasonal grip at each contact and exempts only the matching road tunnel', () => {
    const scene = { ...world(), season: new SeasonState('forest') }, sample = scene.road.samples[100], outside = scene.road.samples[300];
    const span = { start: scene.road.samples[90], end: scene.road.samples[110], samples: scene.road.samples.slice(90, 111) };
    const surface = new DrivingSurface({ ...scene, tunnels: [span] });
    scene.season.set('winter');
    expect(surface.sample(sample.position.x, sample.position.z).grip).toBe(1);
    expect(surface.sample(outside.position.x, outside.position.z).grip).toBeLessThan(0.7);
    scene.season.set('summer'); expect(surface.sample(outside.position.x, outside.position.z).grip).toBe(1);
  });
  it.each([30, 60, 120])('keeps a continuous scrape inside the bridge at %i Hz', fps => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics();
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 80, openStart: true, openEnd: true }];
    const sample = scene.road.samples[300], { right } = roadFrame(sample);
    car.reset(sample.position.x + right.x * 3.7, sample.position.z + right.z * 3.7, sample.heading + 0.12, surface.sample);
    car.parked = false; car.speed = 18;
    for (let i = 0; i < fps * 3; i++) {
      const x = car.x, z = car.z;
      car.update(1 / fps, { throttle: 0.4, steer: 0.1, handbrake: false }, surface.sample);
      surface.constrain(car, x, z, 1 / fps);
      expect(car.speed).toBeGreaterThan(10);
      for (const body of car.bodies()) for (const along of [body.front, body.rear]) {
        const x = body.x + Math.sin(body.heading) * along, z = body.z - Math.cos(body.heading) * along;
        const road = scene.road.nearest(x, z)!;
        const lateral = (x - road.position.x) * Math.cos(road.heading) + (z - road.position.z) * Math.sin(road.heading);
        expect(Math.abs(lateral) + car.profile.width / 2).toBeLessThan(5.3);
      }
    }
  });
  it('slides along a guardrail after a grazing hit instead of stopping immediately', () => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics();
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 80, openStart: true, openEnd: true }];
    const sample = scene.road.samples[300], { right } = roadFrame(sample);
    car.reset(sample.position.x + right.x * 3.8, sample.position.z + right.z * 3.8, sample.heading + 0.12, surface.sample);
    car.parked = false; car.speed = 18;
    const x = car.x, z = car.z;
    car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false }, surface.sample);
    expect(surface.constrain(car, x, z)).toBe(true);
    expect(car.speed).toBeGreaterThan(16);
    expect(Math.hypot(car.x - x, car.z - z)).toBeGreaterThan(0.15);
  });
  it('spawns long rigs with room behind the tractor and detects trailer rear swing', () => {
    const scene = world(true), surface = new DrivingSurface(scene), car = new VehiclePhysics('semi20');
    const start = scene.road.samples[0].position, spawn = surface.spawn(start.x, start.z, car.profile)!;
    expect(spawn).toBeDefined();
    car.reset(spawn.x, spawn.z, spawn.heading, surface.sample, false, spawn.trailerHeading);
    expect(car.trailer!.wheels.every(wheel => wheel.height > 90 && wheel.grounded)).toBe(true);
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 151, openStart: true, openEnd: true }];
    car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false }, surface.sample);
    car.trailer!.heading += 0.7;
    expect(surface.constrain(car, car.x, car.z)).toBe(true);
    expect(car.trailer!.heading).toBeCloseTo(spawn.trailerHeading, 1);
    expect(Math.hypot(car.trailer!.x - car.hitch().x, car.trailer!.z - car.hitch().z)).toBeLessThan(0.001);
  });
  it('keeps elevated service guardrails solid for walkers and cars while leaving the road entrances open', () => {
    const scene = world(true), surface = new DrivingSurface(scene);
    while (!scene.road.advanceToDistance(19000)) { /* Complete a service window. */ }
    scene.services = new ServicePlanner('driving-surface', { sample: () => -50 }, scene.options).detect(scene.road.samples);
    const site = scene.services[0], pad = site.ground.pads[0];
    expect(site.ground.elevated).toBe(true);
    const a = padPoint(pad, 32, 0), b = padPoint(pad, 34, 0);
    const body = { ...b };
    expect(surface.constrainWalker(body, a.x, a.z)).toBe(true);
    const car = new VehiclePhysics(); car.x = b.x; car.y = b.y + 0.8; car.z = b.z; car.speed = 10;
    expect(surface.constrain(car, a.x, a.z)).toBe(true); expect(car.speed).toBeLessThan(10);
    const truck = new VehiclePhysics('truck5'), before = padPoint(pad, 29, 0), after = padPoint(pad, 31.5, 0);
    truck.reset(before.x, before.z, pad.heading + Math.PI / 2, surface.sample);
    truck.x = after.x; truck.z = after.z;
    expect(surface.constrain(truck, before.x, before.z)).toBe(true);
    const below = { ...b, y: -50 };
    expect(surface.constrainWalker(below, a.x, a.z)).toBe(false);
    expect(surface.ceiling(pad.x, pad.z, -50)).toBeCloseTo(pad.y - 1.45);
    const ramp = site.ground.access.find(({ a, b }) => {
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      return Math.hypot(x - scene.road.nearest(x, z)!.position.x, z - scene.road.nearest(x, z)!.position.z) > 20
        && site.ground.pads.every(p => Math.abs((x - p.x) * Math.sin(p.heading) - (z - p.z) * Math.cos(p.heading)) > p.halfLength + 5);
    })!;
    expect(ramp).toBeDefined();
    const rx = (ramp.a.x + ramp.b.x) / 2, rz = (ramp.a.z + ramp.b.z) / 2, ry = (ramp.a.y + ramp.b.y) / 2;
    expect(surface.ceiling(rx, rz, -50)).toBeCloseTo(ry - 1.45);
    expect(surface.ceiling(rx, rz, ry)).toBe(Infinity);
    const entrance = { ...site.sample, distance: site.start + 45 };
    expect(hasRoadBarrier(scene, entrance, 1)).toBe(false);
    expect(hasRoadBarrier(scene, entrance, -1)).toBe(false);
  });

  it('keeps bridge barriers effective while jumping on either side of a banked deck', () => {
    const scene = world(), surface = new DrivingSurface(scene);
    const sample = { ...scene.road.samples[100], bank: Math.PI / 30, heading: 0, grade: 0 };
    vi.spyOn(scene.road, 'nearest').mockReturnValue(sample);
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 151, openStart: true, openEnd: true }];
    for (const side of [-1, 1]) {
      const { x, y, z } = sample.position;
      const person = { x: x + side * 5.7, y: y + Math.tan(sample.bank) * side * 5.7 + 1.13, z };
      expect(surface.constrainWalker(person, x + side * 4.5, z)).toBe(true);
    }
    vi.restoreAllMocks();
  });

  it('selects ground under a bridge without teleporting a walker onto its deck', () => {
    const scene = world(), surface = new DrivingSurface(scene), sample = scene.road.samples[100];
    const { x, y, z } = sample.position;
    expect(surface.sample(x, z, y + 1).height).toBeCloseTo(y);
    expect(surface.sample(x, z, -48).height).toBe(-50);
  });

  it('shares visible guardrail openings with cars and pedestrians, but closes every bridge side', () => {
    const scene = world(), surface = new DrivingSurface(scene);
    const sample = scene.road.samples.find((_point, index) => index > 4 && scene.road.samples.slice(index - 2, index + 3).every(point => !hasRoadBarrier(scene, point, 1)))!;
    expect(sample).toBeDefined();
    const { x, y, z } = sample.position, cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
    const before = { x: x + cos * 4.5, z: z + sin * 4.5 };
    const person = { x: x + cos * 5.7, y, z: z + sin * 5.7 };
    expect(surface.constrainWalker(person, before.x, before.z)).toBe(false);
    const car = new VehiclePhysics(); car.reset(before.x, before.z, sample.heading, surface.sample);
    car.x = person.x; car.z = person.z;
    expect(surface.constrain(car, before.x, before.z)).toBe(false);
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 151, openStart: true, openEnd: true }];
    expect(surface.constrainWalker(person, before.x, before.z)).toBe(true);
    expect(surface.constrain(car, before.x, before.z)).toBe(true);
    const below = { x: x + cos * 5.7, y: -50, z: z + sin * 5.7 };
    expect(surface.constrainWalker(below, before.x, before.z)).toBe(false);
  });
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
    surface.level = -50;
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
    surface.wet = 1;
    const spawn = surface.spawn(scene.road.samples[100].position.x, scene.road.samples[100].position.z)!;
    expect(surface.sample(spawn.x, spawn.z).grip).toBeLessThan(1);
    scene.services = [];
    expect(surface.sample(1e6, 1e6).height).toBe(-50);
  });
});
