import { airportHeight } from '../../src/aviation/airport.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, AIR_GATES, createAircraftFlight, updateAircraftFlight, toggleAircraftGear, toggleAircraftPause, crossesAirGate, runwayContact, aircraftEnvelope, setAircraftFlaps, toggleAircraftSpeedBrake, setAircraftPhysics } from '../../src/aviation/aircraft-flight.js';
import { AIRPORT_BUILDINGS, RUNWAY } from '../../src/aviation/airport.js';
import { Quaternion, Euler, Vector3 } from 'three';

function advance(flight, input, seconds, step = 1 / 60) {
  for (let time = 0; time < seconds - 1e-9; time += step) updateAircraftFlight(flight, input, Math.min(step, seconds - time));
}

const attitude = flight => new Quaternion().setFromEuler(new Euler(flight.pitch, -flight.heading, -flight.roll, 'YXZ'));

test('maneuver mode completes rolls and loops without discontinuities at vertical or inverted attitudes', () => {
  for (const aircraft of AIRCRAFT) for (const axis of ['roll', 'pitch']) {
    const flight = createAircraftFlight(aircraft.id, true, { physics: { mode: 'maneuver', stability: 0 } });
    flight.y = 3000; flight.throttle = 1; flight.speed = 250;
    let previous = attitude(flight), rotation = 0, inverted = false, backwards = false;
    for (let i = 0; i < 6000 && rotation < Math.PI * 2 + .1; i++) {
      updateAircraftFlight(flight, { [axis]: 1 }, 1 / 120);
      const current = attitude(flight), change = previous.angleTo(current);
      assert.ok(change < .04, 'orientation must remain continuous through vertical flight');
      rotation += change;
      inverted ||= new Vector3(0, 1, 0).applyQuaternion(current).y < -.9;
      backwards ||= new Vector3(0, 0, -1).applyQuaternion(current).z > .9;
      previous = current;
    }
    assert.equal(flight.status, 'running'); assert.ok(rotation > Math.PI * 2);
    assert.ok(inverted); if (axis === 'pitch') assert.ok(backwards);
  }
});

test('maneuver settings change rates, retain attitude on release and apply without teleporting', () => {
  const slow = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, rollRate: .4 } });
  const fast = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, rollRate: 2 } });
  advance(slow, { roll: 1 }, .6); advance(fast, { roll: 1 }, .6);
  assert.ok(Math.abs(fast.roll) > Math.abs(slow.roll) * 3);
  advance(slow, {}, 3);
  const bank = slow.roll;
  advance(slow, {}, 2);
  assert.ok(Math.abs(slow.roll - bank) < .015, 'released controls damp rotation, not bank');
  const before = attitude(fast), position = [fast.x, fast.y, fast.z];
  setAircraftPhysics(fast, { mode: 'assisted', stability: 1, pitchRate: Infinity, rollRate: 100, gravity: -.5 });
  assert.ok(before.angleTo(attitude(fast)) < 1e-7); assert.deepEqual([fast.x, fast.y, fast.z], position);
  assert.equal(fast.physics.pitchRate, 1); assert.equal(fast.physics.rollRate, 3); assert.equal(fast.physics.gravity, .5);
  advance(fast, {}, 5);
  assert.ok(Math.abs(fast.roll) < .15, 'stable mode gently recovers level flight');
});

test('gravity, low-speed authority and inverted lift affect maneuver flight', () => {
  const inverted = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0 } });
  inverted.y = 2000; inverted.roll = Math.PI;
  advance(inverted, {}, 2);
  assert.ok(inverted.verticalSpeed < -10, 'inverted flight must not produce upward automatic lift');
  const flights = [.5, 1.5].map(gravity => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, gravity } });
    Object.assign(flight, { y: 2000, speed: 5, throttle: 0 });
    advance(flight, { roll: 1 }, 2);
    return flight;
  });
  assert.ok(flights[1].verticalSpeed < flights[0].verticalSpeed - 10);
  assert.ok(Math.abs(flights[0].roll) < .5, 'near-zero airspeed must reduce control authority');
});

test('maneuver integration stays consistent across frame sizes and ground controls stay safe', () => {
  const flights = [1 / 30, 1 / 60, 1 / 120].map(step => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0 } });
    flight.y = 3000;
    advance(flight, { pitch: .8, roll: .6, yaw: .3 }, 8, step);
    return flight;
  });
  for (const flight of flights) {
    assert.ok(attitude(flight).angleTo(attitude(flights[0])) < 1e-6);
    assert.ok(Math.abs(flight.y - flights[0].y) < .001);
  }
  const ground = createAircraftFlight('su30', false, { physics: { mode: 'maneuver', rollRate: 2 } });
  ground.status = 'running'; advance(ground, { pitch: 1, roll: 1 }, 2);
  assert.equal(ground.onGround, true); assert.equal(ground.roll, 0);
  assert.ok(ground.pitch <= .13);
});

test('all aircraft accelerate on the runway and need speed plus rotation to take off', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id);
    flight.status = 'running'; flight.throttle = 1;
    advance(flight, {}, 5);
    assert.equal(flight.onGround, true);
    assert.ok(flight.speed > 10);
    advance(flight, { pitch: 1 }, 30);
    assert.equal(flight.status, 'running');
    assert.equal(flight.onGround, false);
    assert.ok(flight.y > 100);
    assert.equal(toggleAircraftGear(flight), true);
    assert.equal(flight.gearDown, false);
  }
});

test('the fighter is faster and more agile than the airliner', () => {
  const flights = AIRCRAFT.map(aircraft => createAircraftFlight(aircraft.id, true));
  for (const flight of flights) { flight.throttle = 1; advance(flight, { roll: .6 }, 15); }
  assert.ok(flights[1].speed > flights[0].speed * 1.4);
  assert.ok(flights[1].roll > flights[0].roll);
  assert.ok(flights.every(flight => flight.x > 0 && flight.status === 'running'));
});

test('low airspeed loses lift, falls under gravity and cannot hover', () => {
  const flight = createAircraftFlight('a380', true);
  Object.assign(flight, { speed: 10, throttle: 0, y: 1000 });
  advance(flight, { pitch: 1 }, 3);
  assert.ok(flight.verticalSpeed < -10);
  assert.ok(flight.y < 980);
  assert.equal(flight.stalling, true);
});

test('safe runway touchdown needs gear, alignment, moderate bank, speed and descent', () => {
  const sample = { ...createAircraftFlight('a380', true), x: 0, z: 0, heading: 0, roll: .03, pitch: .05, speed: 80, verticalSpeed: -2, gearDown: true, gearPosition: 1 };
  assert.equal(runwayContact(sample, AIRCRAFT[0]), true);
  for (const change of [{ gearDown: false }, { x: 90 }, { z: -4000 }, { heading: .8 }, { trackHeading: .4 }, { roll: .5 }, { speed: 180 }, { verticalSpeed: -15 }, { pitch: -.3 }]) {
    assert.equal(runwayContact({ ...sample, ...change }, AIRCRAFT[0]), false);
  }
  assert.equal(runwayContact({ ...sample, heading: Math.PI, trackHeading: Math.PI }, AIRCRAFT[0]), true);
  assert.equal(runwayContact({ ...sample, heading: Math.PI, trackHeading: 0 }, AIRCRAFT[0]), false, 'backwards motion is not a safe landing');
  assert.equal(runwayContact({ ...sample, pitch: .28 }, AIRCRAFT[0]), false, 'tail contact above gear height cannot count as a safe landing');
  assert.equal(runwayContact({ ...sample, roll: .18 }, AIRCRAFT[0]), false, 'a wingtip touching first cannot count as a safe landing');
});

test('pitch, yaw, response and recovery assistance each change actual aircraft motion', () => {
  for (const [setting, input, measure] of [['pitchRate', 'pitch', 'pitch'], ['yawRate', 'yaw', 'heading'], ['response', 'roll', 'roll']]) {
    const flights = [.5, 2].map(value => {
      const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, [setting]: value } });
      advance(flight, { [input]: 1 }, .15);
      return flight;
    });
    assert.ok(Math.abs(flights[1][measure]) > Math.abs(flights[0][measure]) * 1.5, setting);
  }
  const flights = [0, 1].map(stability => {
    const flight = createAircraftFlight('su30', true, { physics: { stability } });
    flight.roll = .6; advance(flight, {}, 3);
    return flight;
  });
  assert.ok(Math.abs(flights[0].roll) > .5); assert.ok(Math.abs(flights[1].roll) < .1);
});

test('steep maneuver attitudes collide using their rotated airframe rather than level height', () => {
  const flight = createAircraftFlight('a380', true, { physics: { mode: 'maneuver', stability: 0 } });
  Object.assign(flight, { y: 22, pitch: Math.PI / 2, gearDown: true, speed: 100, verticalSpeed: 0 });
  updateAircraftFlight(flight, {}, 1 / 120);
  assert.equal(flight.status, 'running'); assert.ok(flight.events.includes('recovery'), 'vertical airframe contact triggers recovery');
});

test('touchdown and rollout continue exploration and unsafe impact recovers', () => {
  const flight = createAircraftFlight('a380', true);
  Object.assign(flight, { x: 0, y: AIRCRAFT[0].gearHeight + .01, z: 0, verticalSpeed: -2, speed: 65, throttle: 0, gearDown: true, gearPosition: 1, hasFlown: true });
  advance(flight, { brake: true }, 6);
  assert.equal(flight.status, 'running');
  assert.equal(flight.onGround, true);
  assert.equal(flight.loadFactor, 0);assert.equal(flight.stalling, false);
  const crashed = createAircraftFlight('su30', true);
  Object.assign(crashed, { y: 2.6, verticalSpeed: -20, gearDown: false });
  updateAircraftFlight(crashed, {}, .1);
  assert.equal(crashed.status, 'running'); assert.ok(crashed.events.includes('recovery'));
  const elapsed = crashed.elapsed;
  advance(crashed, { throttle: 1, pitch: .1 }, 5);
  assert.equal(crashed.status, 'running'); assert.ok(crashed.elapsed > elapsed + 4);
});

test('gear cannot retract on the ground and pause freezes all flight motion', () => {
  const flight = createAircraftFlight();
  assert.equal(toggleAircraftGear(flight), false);
  flight.status = 'running';
  toggleAircraftPause(flight);
  const snapshot = structuredClone(flight);
  advance(flight, { throttle: 1, pitch: 1 }, 4);
  assert.deepEqual(flight, { ...snapshot, events: [] });
  toggleAircraftPause(flight);
  assert.equal(flight.status, 'running');
  for (const dt of [0, -1, NaN, Infinity]) updateAircraftFlight(flight, { throttle: 1 }, dt);
  assert.deepEqual(flight, { ...snapshot, status: 'running', events: [] });
});

test('gate detection checks the swept crossing and rejects distant or parallel passes', () => {
  const gate = { x: 0, y: 300, z: -100, radius: 100, normal: [0, 0, -1] };
  assert.equal(crossesAirGate({ x: 10, y: 310, z: 0 }, { x: 10, y: 310, z: -200 }, gate), true);
  assert.equal(crossesAirGate({ x: 150, y: 310, z: 0 }, { x: 150, y: 310, z: -200 }, gate), false);
  assert.equal(crossesAirGate({ x: 0, y: 300, z: 0 }, { x: 100, y: 300, z: 0 }, gate), false);
});

test('flight integration stays finite and consistent across render frame sizes', () => {
  for (const aircraft of AIRCRAFT) {
    const flights = [1 / 30, 1 / 60, 1 / 120].map(step => {
      const flight = createAircraftFlight(aircraft.id, true);
      advance(flight, { pitch: .25, roll: .3 }, 12, step);
      return flight;
    });
    for (const flight of flights) {
      assert.ok(['x', 'y', 'z', 'speed', 'pitch', 'roll', 'heading', 'verticalSpeed'].every(key => Number.isFinite(flight[key])));
      assert.ok(Math.abs(flight.x - flights[0].x) < .001);
      assert.ok(Math.abs(flight.y - flights[0].y) < .001);
    }
  }
});

test('airport and city buildings collide, while flying above their roofs is clear', () => {
  for (const building of AIRPORT_BUILDINGS) {
    const flight = createAircraftFlight('su30', true);
    Object.assign(flight, { x: building.x, z: building.z, y: building.height / 2, speed: 30 });
    updateAircraftFlight(flight, {}, 1 / 120);
    assert.equal(flight.status, 'running'); assert.ok(flight.events.includes('recovery'));
    const clear = createAircraftFlight('su30', true);
    Object.assign(clear, { x: building.x, z: building.z, y: building.height + 50, speed: 80 });
    updateAircraftFlight(clear, {}, 1 / 120);
    assert.equal(clear.status, 'running');
  }
});

test('runway stays flat, every gate clears terrain and gate collection cannot repeat', () => {
  for (let z = RUNWAY.end; z <= RUNWAY.start; z += 50) assert.equal(airportHeight(0, z), 0);
  for (const gate of AIR_GATES) assert.ok(gate.y - airportHeight(gate.x, gate.z) > gate.radius);
  const flight = createAircraftFlight('su30', true);
  Object.assign(flight, { x: 0, y: 180, z: -1999, speed: 220 });
  updateAircraftFlight(flight, {}, 1 / 30);
  assert.equal(flight.gates, 1);
  Object.assign(flight, { z: -1999 });
  updateAircraftFlight(flight, {}, 1 / 30);
  assert.equal(flight.gates, 1);
});

test('every aircraft can take off and land from both runway directions', () => {
  for (const aircraft of AIRCRAFT) for (const runwayDirection of ['18', '36']) {
    const flight = createAircraftFlight(aircraft.id, false, { runwayDirection });
    assert.ok(flight.z > RUNWAY.end + 100 && flight.z < RUNWAY.start - 100);
    assert.equal(Math.sign(Math.cos(flight.heading)), runwayDirection === '18' ? -1 : 1);
    const initialZ = flight.z;
    flight.status = 'running'; flight.throttle = 1;
    advance(flight, { pitch: 1 }, 30);
    assert.equal(flight.status, 'running'); assert.equal(flight.onGround, false);
    assert.equal(Math.sign(flight.z - initialZ), runwayDirection === '18' ? 1 : -1);
    Object.assign(flight, { x: 0, z: RUNWAY.center, y: aircraft.gearHeight + .01, speed: Math.min(65, aircraft.landingSpeed * .8), pitch: .03, roll: 0, verticalSpeed: -2, gearDown: true, throttle: 0 });
    advance(flight, { brake: true }, 6);
    assert.equal(flight.status, 'running');
  }
});

test('flaps lower stall and rotation speeds, add drag and retract above their safe speed', () => {
  for (const aircraft of AIRCRAFT) {
    const clean = createAircraftFlight(aircraft.id, true);
    const deployed = createAircraftFlight(aircraft.id, true);
    for (const flight of [clean, deployed]) Object.assign(flight, { speed: aircraft.stall * .9, y: 1000, throttle: 0 });
    assert.equal(setAircraftFlaps(deployed, 2), true);
    assert.ok(aircraftEnvelope(deployed).stall < aircraftEnvelope(clean).stall);
    assert.ok(aircraftEnvelope(deployed).takeoff < aircraft.takeoff);
    advance(clean, {}, .1); advance(deployed, {}, .1);
    assert.equal(clean.stalling, true); assert.equal(deployed.stalling, false);
    assert.ok(deployed.speed < clean.speed);
    deployed.speed = aircraft.flapLimit + 10;
    updateAircraftFlight(deployed, {}, 1 / 60);
    assert.equal(deployed.flaps, 0); assert.ok(deployed.events.includes('flaps-limit'));
    assert.equal(setAircraftFlaps(deployed, 1), false);
    assert.equal(setAircraftFlaps(deployed, -1), false);
    assert.equal(setAircraftFlaps(deployed, NaN), false);
    updateAircraftFlight(deployed, {}, 1 / 60);
    assert.equal(deployed.events.includes('flaps-limit'), false);
  }
});

test('independent speed brake slows flight, survives pause and resets for a new flight', () => {
  for (const aircraft of AIRCRAFT) {
    const clean = createAircraftFlight(aircraft.id, true), braking = createAircraftFlight(aircraft.id, true);
    assert.equal(toggleAircraftSpeedBrake(braking), true);
    advance(clean, {}, 3); advance(braking, {}, 3);
    assert.ok(braking.speed < clean.speed - 10);
    toggleAircraftPause(braking);
    const snapshot = structuredClone(braking);
    advance(braking, {}, 2);
    assert.deepEqual(braking, { ...snapshot, events: [] });
    assert.equal(toggleAircraftSpeedBrake(braking), true); assert.equal(braking.speedBrake, false);
    braking.status = 'invalid';
    assert.equal(toggleAircraftSpeedBrake(braking), false); assert.equal(setAircraftFlaps(braking, 1), false);
    assert.equal(createAircraftFlight(aircraft.id).speedBrake, false);
    const ground = createAircraftFlight(aircraft.id);
    Object.assign(ground, { status: 'running', speed: aircraft.takeoff + 5, throttle: 1 });
    toggleAircraftSpeedBrake(ground); advance(ground, { pitch: 1 }, .5);
    assert.equal(ground.onGround, true, 'speed brake must prevent takeoff');
    toggleAircraftSpeedBrake(ground); advance(ground, { pitch: 1 }, .5);
    assert.equal(ground.onGround, false);
  }
});
