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
import { ParkedFleet } from '../src/service/ParkedFleet';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';

function world(highway = false) {
  const options = { ...DEFAULT_OPTIONS, roadType: highway ? 'highway' as const : 'mountain' as const };
  const road = new RoadSpine('driving-surface', { sample: () => 100 }, options);
  while (!road.update(0)) { /* bounded generation */ }
  return { seed: 'driving-surface', road, options, bridges: [] as BridgeSpan[], services: [] as ServiceArea[], tunnels: [], groundHeight: () => -50 };
}

describe('DrivingSurface', () => {
  it('shares solid vehicle tops with walking without lifting the driving surface onto parked cars', () => {
    const scene = world(), fleet = new ParkedFleet('solid-roofs'), car = new VehiclePhysics('sedan');
    car.reset(1000, 0, 0, () => ({ height: 100, grip: 1 })); fleet.park(car);
    const surface = new DrivingSurface({ ...scene, parkedVehicles: { fleet } });
    expect(surface.sample(1000, 0, 103).height).toBe(-50);
    surface.walking = true;
    expect(surface.sample(1000, 0, 103).height).toBeCloseTo(101.65);
    expect(surface.sample(1000, 0, 100.45).height).toBe(-50);
    expect(surface.canBoard(car, { x: 1000, y: 101.65, z: 0 })).toBe(false);
  });

  it('sweeps a fast car against parked vehicles and preserves a glancing tangential velocity', () => {
    const scene = world(), fleet = new ParkedFleet('solid-impact'), surface = new DrivingSurface({ ...scene, groundHeight: () => 100, parkedVehicles: { fleet } });
    const obstacle = new VehiclePhysics('truck8'); obstacle.reset(1000, 0, 0, surface.sample); fleet.park(obstacle);
    const car = new VehiclePhysics('supercar'); car.reset(1006, 0, -Math.PI / 2 + 0.25, surface.sample);
    car.parked = false; car.speed = 90; car.setSpeedLimit(400);
    expect(car.update(0.1, { throttle: 0, steer: 0, handbrake: false }, surface.sample, surface.constrain)).toBe(true);
    expect(car.x).toBeGreaterThan(1000 + obstacle.profile.width / 2);
    expect(car.motionSpeed).toBeGreaterThan(5);
  });
  it('blocks walking through the vehicle just exited while leaving its door reachable', () => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics();
    car.reset(1000, 0, 0, () => ({ height: 100, grip: 1 }));
    surface.parkedVehicle = car;
    const person = { x: 1000, y: 100, z: 0 };
    expect(surface.constrainWalker(person, 1004, 0)).toBe(true);
    expect(person.x).toBeCloseTo(1000 + car.profile.width / 2 + 0.42);
    expect(surface.constrainWalker({ x: 1002, y: 100, z: 0 }, 1001.6, 0)).toBe(false);
    expect(surface.constrainWalker({ x: 1000, y: 90, z: 0 }, 1004, 0)).toBe(false);
  });

  it('includes the thickness of elevated service rails in the nearby collision query', () => {
    const scene = world();
    scene.services = [{ id: 1, sample: scene.road.samples[0], start: 0, end: 100,
      ground: { pads: [], access: [], elevated: true, barriers: [{
        a: { x: 100, y: 100, z: -10 }, b: { x: 100, y: 100, z: 10 },
      }] } }];
    const surface = new DrivingSurface(scene), body = { x: 99.53, y: 100, z: 0 };
    expect(surface.constrainWalker(body, 99, 0)).toBe(true);
    expect(body.x).toBeCloseTo(99.5, 5);
  });

  it('blocks a car crossing a guardrail from the outside without snapping it through the rail', () => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics();
    const sample = scene.road.samples[100];
    vi.spyOn(scene.road, 'nearest').mockImplementation((_x, z) => ({ ...sample, position: { x: 0, y: 100, z }, heading: 0, grade: 0, bank: 0 }));
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 80, openStart: true, openEnd: true }];
    car.reset(8, 0, 0, () => ({ height: 100, grip: 1 }));
    car.x = 4;
    expect(surface.constrain(car, 8, 0)).toBe(true);
    expect(car.x - car.profile.width / 2).toBeGreaterThan(5.2);
    vi.restoreAllMocks();
  });

  it.each([-1, 1])('matches a banked highway rail height on side %i and ignores traffic underneath', side => {
    const scene = world(true), surface = new DrivingSurface(scene), car = new VehiclePhysics('truck5');
    const sample = scene.road.samples[100], bank = 0.2;
    vi.spyOn(scene.road, 'nearest').mockImplementation((_x, z) => ({ ...sample, position: { x: 0, y: 100, z }, heading: 0, grade: 0, bank }));
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 80, openStart: true, openEnd: true }];
    const before = side * 9.4, after = side * 12.9;
    const plane = (x: number) => ({ height: 100 + Math.tan(bank) * x, grip: 1 });
    car.reset(before, 0, 0, plane); car.x = after; car.y += Math.tan(bank) * (after - before);
    expect(surface.constrain(car, before, 0)).toBe(true);
    expect(Math.abs(car.x) + car.profile.width / 2).toBeLessThan(12.5);
    car.reset(before, 0, 0, x => ({ ...plane(x), height: plane(x).height - 10 })); car.x = after;
    expect(surface.constrain(car, before, 0)).toBe(false);
    vi.restoreAllMocks();
  });

  it('resolves a glancing impact without snapping the body heading or losing the suspension pose', () => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics();
    const sample = scene.road.samples[100];
    vi.spyOn(scene.road, 'nearest').mockImplementation((_x, z) => ({ ...sample, position: { x: 0, y: 100, z }, heading: 0, grade: 0, bank: 0 }));
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 80, openStart: true, openEnd: true }];
    car.reset(3.8, 0, 0.3, surface.sample); car.speed = 20; car.parked = false;
    car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false }, surface.sample);
    const heading = car.heading, y = car.y, pitch = car.pitch, roll = car.roll;
    expect(surface.constrain(car, 3.8, 0)).toBe(true);
    expect(Math.abs(car.heading - heading)).toBeLessThan(0.04);
    expect(car.speed).toBeGreaterThan(16);
    expect(car.y).toBe(y); expect(car.pitch).toBe(pitch); expect(car.roll).toBe(roll);
    vi.restoreAllMocks();
  });

  it('keeps high-speed rail contact identical at 20, 60 and 144 render frames per second', () => {
    const results = [20, 60, 144].map(fps => {
      const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics();
      const sample = scene.road.samples[100];
      vi.spyOn(scene.road, 'nearest').mockImplementation((_x, z) => ({ ...sample, position: { x: 0, y: 100, z }, heading: 0, grade: 0, bank: 0 }));
      scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 80, openStart: true, openEnd: true }];
      car.reset(3.7, 0, 0.12, surface.sample); car.parked = false; car.speed = 30;
      let hits = 0;
      for (let i = 0; i < fps * 2; i++) {
        if (car.update(1 / fps, { throttle: 0, steer: 0.1, handbrake: false }, surface.sample, surface.constrain)) hits++;
        for (const body of car.bodies()) for (const along of [body.front, body.rear])
          expect(Math.abs(body.x + Math.sin(body.heading) * along) + car.profile.width / 2).toBeLessThan(5.276);
      }
      expect(hits).toBeGreaterThan(0); expect(car.speed).toBeGreaterThan(20);
      vi.restoreAllMocks(); return car;
    });
    for (const car of results.slice(1)) for (const field of ['x', 'y', 'z', 'speed', 'lateralSpeed', 'heading', 'trip'] as const)
      expect(car[field]).toBeCloseTo(results[0][field], 7);
  });

  it('stops a head-on 400 km/h impact inside the bridge and allows reversing away', () => {
    const scene = world(), surface = new DrivingSurface(scene), car = new VehiclePhysics('supercar');
    const sample = scene.road.samples[100];
    vi.spyOn(scene.road, 'nearest').mockImplementation((_x, z) => ({ ...sample, position: { x: 0, y: 100, z }, heading: 0, grade: 0, bank: 0 }));
    scene.bridges = [{ start: scene.road.samples[0], end: scene.road.samples.at(-1)!, samples: scene.road.samples, depth: 80, openStart: true, openEnd: true }];
    car.reset(0, 0, Math.PI / 2, surface.sample); car.ignition = 'running'; car.setSpeedLimit(400); car.speed = 400 / 3.6; car.parked = false;
    expect(car.update(0.1, { throttle: 0, steer: 0, handbrake: false }, surface.sample, surface.constrain)).toBe(true);
    expect(Math.abs(car.speed)).toBeLessThan(0.01);
    expect(car.x + car.profile.chassisLength / 2).toBeLessThan(5.28);
    expect(car.trip).toBeLessThan(4);
    const stopped = car.x;
    for (let i = 0; i < 120; i++) car.update(1 / 120, { throttle: -1, steer: 0, handbrake: false }, surface.sample, surface.constrain);
    expect(car.x).toBeLessThan(stopped - 0.5); expect(car.speed).toBeLessThan(-1);
    vi.restoreAllMocks();
  });

  it('boards every parked vehicle beside its cab on a sloping service pad without boarding from another elevation', () => {
    const base = world();
    base.services = [{ id: 1, sample: base.road.samples[0], start: 0, end: 200,
      ground: { pads: [{ x: 1000, y: 100, z: 0, side: 1, heading: 0, grade: 0.02, halfWidth: 80, halfLength: 110 }], access: [], elevated: true, barriers: [] } }];
    for (const kind of Object.keys(vehicleProfiles) as VehicleKind[]) {
      const fleet = new ParkedFleet('doors'), surface = new DrivingSurface({ ...base, parkedVehicles: { fleet } }), car = new VehiclePhysics(kind);
      car.reset(1000, 0, 0, surface.sample); fleet.park(car);
      const door = surface.exit(car); expect(door, kind).toBeDefined();
      if (car.profile.bus) expect(door!.x, kind).toBeGreaterThan(car.x);
      expect(surface.canBoard(car, door!), kind).toBe(true);
      expect(surface.canBoard(car, { ...door!, y: door!.y - 5 }), kind).toBe(false);
    }
  });
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
    car.reset(sample.position.x + right.x * 4.25, sample.position.z + right.z * 4.25, sample.heading + 0.12, surface.sample);
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
    const a = padPoint(pad, pad.halfWidth - 1, 0), b = padPoint(pad, pad.halfWidth + 1, 0);
    const body = { ...b };
    expect(surface.constrainWalker(body, a.x, a.z)).toBe(true);
    const car = new VehiclePhysics(), approach = padPoint(pad, pad.halfWidth - 4, 0);
    car.reset(approach.x, approach.z, pad.heading + Math.PI / 2, surface.sample);
    car.x = b.x; car.z = b.z; car.speed = 10;
    expect(surface.constrain(car, approach.x, approach.z)).toBe(true); expect(car.speed).toBeLessThan(10);
    const truck = new VehiclePhysics('truck5'), before = padPoint(pad, pad.halfWidth - 4, 0), after = padPoint(pad, pad.halfWidth - 1.5, 0);
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
