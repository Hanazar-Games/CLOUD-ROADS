import { expect, it } from 'vitest';
import { signalPhase, TrafficSignals, DEFAULT_SIGNAL_TIMING } from '../src/traffic/TrafficSignals';
import { TrafficRules } from '../src/traffic/TrafficRules';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadSpine } from '../src/road/RoadSpine';
import { RoadNetwork, type Junction } from '../src/road/RoadNetwork';
import { TrafficSystem } from '../src/traffic/TrafficSystem';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { Autopilot } from '../src/vehicle/Autopilot';
import { SignalMesh } from '../src/road/SignalMesh';
import { crossroadSite } from '../src/road/CrossroadSite';
import { Scene, Matrix4 } from 'three';

const flat = { sample: () => 100 };
const options = { ...DEFAULT_OPTIONS, crossroads: true, crossroadInterval: 3000, routeStyle: 0 as const, maxGrade: 0 };
const road = new RoadSpine('signals', flat, options);
while (!road.advanceToDistance(7000)) { /* Prepare the intersection corridor. */ }
const sample = road.segments.find(s => s.start.distance <= 3000 && s.end.distance >= 3000)!.atDistance(3000);
const junction: Junction = { id: 'signal-test', route: 'root', distance: 3000, sample, kind: 'crossroads', exits: [], ramps: [] };
const car = (remaining: number, heading = 0) => ({ x: sample.position.x + 2, y: sample.position.y + 1,
  z: sample.position.z + 13 + remaining, heading, speed: 10, profile: { chassisLength: 4, width: 2 } });

it('uses green, yellow and clearance intervals without conflicting green signals', () => {
  for (let t = 0; t < 200; t += 0.1) {
    expect([signalPhase(t, 0, DEFAULT_SIGNAL_TIMING).color, signalPhase(t, 1, DEFAULT_SIGNAL_TIMING).color].filter(c => c === 'green').length).toBeLessThanOrEqual(1);
  }
  expect(signalPhase(12, 0, DEFAULT_SIGNAL_TIMING).color).toBe('yellow');
  expect(signalPhase(15, 0, DEFAULT_SIGNAL_TIMING).color).toBe('red');
  expect(signalPhase(15, 1, DEFAULT_SIGNAL_TIMING).color).toBe('red');
  expect(signalPhase(17, 1, DEFAULT_SIGNAL_TIMING).color).toBe('green');
});

it('ignores other decks and cars already past the stop line, and freezes its clock at zero dt', () => {
  const signals = new TrafficSignals(options); signals.sync([junction]);
  expect(signals.approach(car(20))?.distance).toBeGreaterThan(0);
  expect(signals.approach({ ...car(20), y: car(20).y + 15 })).toBeUndefined();
  expect(signals.stopDistance(car(-15))).toBe(Infinity);
  signals.tick(0); expect(signals.time).toBe(0);
});

it.each([0, 1, 2, 3])('recognizes the stop line on approach %i and permits yellow clearance when stopping is unsafe', arm => {
  const signals = new TrafficSignals(options); signals.sync([junction]);
  const heading = sample.heading + arm * Math.PI / 2, c = Math.cos(heading), s = Math.sin(heading);
  const vehicle = { ...car(0), heading, x: sample.position.x + 2 * c - 60 * s, z: sample.position.z + 2 * s + 60 * c };
  signals.time = arm % 2 ? 0 : 18;
  expect(signals.approach(vehicle)?.axis).toBe(arm % 2); expect(signals.stopDistance(vehicle)).toBeGreaterThan(0);
  expect(signals.stopDistance(vehicle)).toBeLessThan(60);
  signals.time = arm % 2 ? 25 : 12;
  expect(signals.stopDistance(vehicle)).toBeLessThan(Infinity);
  vehicle.speed = 30; expect(signals.stopDistance(vehicle)).toBe(Infinity);
  signals.configure({ mainGreen: 20 });
  expect(signals.phase(junction, 0).color).toBe('red'); expect(signals.phase(junction, 1).color).toBe('red');
});

it('creates four connected level arms at the selected interval and opens both guardrails', () => {
  const network = new RoadNetwork('signals', flat, options, road);
  for (let i = 0; i < 180; i++) network.update(sample.position.x, sample.position.z, sample.position.y + 1, 4000);
  const crossing = network.junctions.find(j => j.route === 'root' && j.kind === 'crossroads');
  expect(crossing?.distance).toBe(3000); expect(crossing?.exits).toHaveLength(2);
  expect(road.nearest(sample.position.x, sample.position.z)?.opening).toBe(0);
  for (const id of crossing!.exits) {
    const branch = network.routes.find(r => r.id === id)!;
    expect(branch.road.segments[0].start.position).toEqual(sample.position);
    expect(branch.road.segments[0].end.grade).toBe(0);
    expect(branch.definition.opposite).toBeDefined();
  }
});

it('rejects signal intersections with steep side terrain, nearby bridges or service entrances', () => {
  const obstacles = { bridges: [], tunnels: [], services: [], samples: [sample] };
  expect(crossroadSite(sample, flat, options, obstacles)).toBe(true);
  expect(crossroadSite(sample, { sample: x => Math.abs(x - sample.position.x) > 12 ? 120 : 100 }, options, obstacles)).toBe(false);
  expect(crossroadSite(sample, flat, options, { ...obstacles, bridges: [{ start: { distance: 2990 }, end: { distance: 3010 } }] })).toBe(false);
  expect(crossroadSite(sample, flat, options, { ...obstacles, services: [{ start: 3100, end: 3400 }] })).toBe(false);
  expect(crossroadSite({ ...sample, grade: 0.01 }, flat, options, obstacles)).toBe(false);
});

it('emits one red-light warning per crossing, ignores teleports, and honors the reminder switch', () => {
  const signals = new TrafficSignals(options); signals.sync([junction]);
  while (signals.phase(junction, 0).color !== 'red') signals.tick(0.1);
  const rules = new TrafficRules();
  rules.update(0.1, car(2), signals, true);
  rules.update(0.1, car(-2), signals, true);
  expect(rules.warning?.kind).toBe('red'); expect(rules.count).toBe(1);
  rules.update(0.1, car(-3), signals, true); expect(rules.count).toBe(1);
  rules.reset(); rules.update(0.1, car(200), signals, true); rules.update(0.1, car(-2), signals, true);
  expect(rules.warning).toBeUndefined();
  rules.enabled = false; rules.update(0.1, car(2), signals, true); rules.update(0.1, car(-2), signals, true);
  expect(rules.warning).toBeUndefined();
});

it('requires sustained speeding, excludes inactive players and clears hints when disabled', () => {
  const rules = new TrafficRules(), signals = new TrafficSignals(options), fast = { ...car(100), speed: 40 };
  for (let i = 0; i < 30; i++) rules.update(0.1, fast, signals, false);
  expect(rules.count).toBe(0);
  for (let i = 0; i < 30; i++) rules.update(0.1, fast, signals, true);
  expect(rules.warning?.kind).toBe('speed'); expect(rules.count).toBe(1);
  rules.enabled = false; rules.update(0, fast, signals, false); expect(rules.warning).toBeUndefined();
});

it('stops NPCs behind the red line without honking, then releases them on green', () => {
  const signals = new TrafficSignals(options); signals.sync([junction]); signals.time = 18;
  const network = new RoadNetwork('signal-traffic', flat, options, road), traffic = new TrafficSystem('signal-traffic', options);
  network.active.ready = true; traffic.density = 1; traffic.signals = signals;
  const vehicle = new VehiclePhysics('sedan'); vehicle.reset(sample.position.x + 2, sample.position.z + 160, 0, () => ({ height: sample.position.y, grip: 1 })); vehicle.speed = 15;
  traffic.entries.push({ id: 'signal-npc', car: vehicle, routeId: 'root', distance: 2840, direction: 1, cruise: 15, lane: 1, offset: 2, signal: 0, cooldown: 0 });
  for (let i = 0; i < 240; i++) traffic.update(0.1, network.routes, vehicle);
  expect(vehicle.speed).toBeLessThan(0.1); expect(signals.approach(vehicle)!.distance).toBeGreaterThan(1);
  expect(traffic.horns(vehicle, { x: 1, y: 0, z: 0 })).toHaveLength(0);
  signals.time = 0;
  for (let i = 0; i < 100; i++) traffic.update(0.1, network.routes, vehicle);
  expect(vehicle.z).toBeLessThan(sample.position.z); expect(vehicle.speed).toBeGreaterThan(5);
});

it('does not spawn traffic inside the signal intersection', () => {
  const signals = new TrafficSignals(options); signals.sync([junction]);
  const network = new RoadNetwork('signal-spawn', flat, options, road), traffic = new TrafficSystem('signal-spawn', options);
  network.active.ready = true; traffic.density = 100; traffic.signals = signals;
  const anchor = { x: sample.position.x, y: sample.position.y, z: sample.position.z + 300 };
  let spawned = 0;
  for (let i = 0; i < 1200; i++) {
    traffic.update(0.1, [network.active], anchor);
    for (const entry of traffic.entries) {
      spawned++;
      expect(Math.abs(entry.car.z - sample.position.z) - entry.car.profile.chassisLength / 2).toBeGreaterThan(signals.stopOffset);
    }
    traffic.entries.length = 0;
  }
  expect(spawned).toBeGreaterThan(20);
});

it('makes cruise assistance wait at red while leaving steering-only braking to the player', () => {
  const signals = new TrafficSignals(options); signals.sync([junction]); signals.time = 18;
  const vehicle = new VehiclePhysics('sedan'), pilot = new Autopilot(), surface = () => ({ height: sample.position.y, grip: 1 });
  vehicle.reset(sample.position.x + 2, sample.position.z + 120, 0, surface); vehicle.ignition = 'running'; vehicle.speed = 12; vehicle.parked = false;
  const routes = [{ id: 'root', road }], manual = { throttle: 0, steer: 0, handbrake: false };
  expect(pilot.engage(vehicle, routes, options)).toBe(true);
  for (let i = 0; i < 1200; i++) vehicle.update(1 / 60, pilot.update(1 / 60, vehicle, routes, [], manual, 1, signals), surface);
  expect(vehicle.speed).toBeLessThan(0.2); expect(signals.approach(vehicle)!.distance).toBeGreaterThan(0);
  pilot.configure({ ...pilot.settings, mode: 'steering' }); vehicle.handbrake = 0; expect(pilot.engage(vehicle, routes, options)).toBe(true);
  expect(pilot.update(0.1, vehicle, routes, [], { ...manual, throttle: 0.7 }, 1, signals).throttle).toBe(0.7);
  expect(pilot.status).toBe('信号灯 · 请自行制动');
});

it('clears a disabled warning category immediately even while paused', () => {
  const rules = new TrafficRules(), signals = new TrafficSignals(options);
  rules.warning = { kind: 'speed', remaining: 5 }; rules.speedWarnings = false;
  rules.update(0, car(20), signals, false); expect(rules.warning).toBeUndefined();
  rules.warning = { kind: 'red', remaining: 5 }; rules.redWarnings = false;
  rules.update(0, car(20), signals, false); expect(rules.warning).toBeUndefined();
});

it('freezes reminders while paused, preserves the speeding timer and clears them when leaving the driver seat', () => {
  const rules = new TrafficRules(), signals = new TrafficSignals(options), fast = { ...car(100), speed: 40 };
  for (let i = 0; i < 15; i++) rules.update(0.1, fast, signals, true);
  rules.update(0, fast, signals, true);
  for (let i = 0; i < 6; i++) rules.update(0.1, fast, signals, true);
  expect(rules.warning?.kind).toBe('speed');
  const remaining = rules.warning!.remaining;
  rules.update(0, fast, signals, true); expect(rules.warning!.remaining).toBe(remaining);
  rules.update(0, fast, signals, false); expect(rules.warning).toBeUndefined(); expect(rules.count).toBe(1);
  rules.update(0.1, fast, signals, true); expect(rules.warning).toBeUndefined();
});

it('keeps signal models bounded, rebases geometry and releases all scene objects', () => {
  const scene = new Scene(), signals = new TrafficSignals(options), mesh = new SignalMesh(scene); signals.sync([junction]);
  mesh.update(signals, { x: 0, z: 0 }); expect(mesh.bulbs.count).toBe(12); expect(mesh.markings.count).toBeGreaterThan(40);
  const local = new Matrix4(); mesh.bulbs.getMatrixAt(0, local);
  mesh.update(signals, { x: 2048, z: -4096 }); const moved = new Matrix4(); mesh.bulbs.getMatrixAt(0, moved);
  expect(moved.elements).toEqual(local.elements); expect(mesh.parts.position.x).toBe(sample.position.x - 2048);
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it('retains every crossing marking at the supported intersection capacity on wide roads', () => {
  const signals = new TrafficSignals({ ...options, roadWidth: 12, roadLanes: 4 }), mesh = new SignalMesh(new Scene());
  signals.sync([junction]); mesh.update(signals, { x: 0, z: 0 }); const count = mesh.markings.count;
  signals.sync(Array.from({ length: 32 }, (_, i) => ({ ...junction, id: `wide-${i}`, sample: { ...sample, position: { ...sample.position, z: i * 1000 } } })));
  mesh.update(signals, { x: 0, z: 0 }); expect(mesh.markings.count).toBe(count * 32); expect(mesh.bulbs.count).toBe(384);
  mesh.dispose();
});
