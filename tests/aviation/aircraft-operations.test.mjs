import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, createAircraftFlight, updateAircraftFlight, toggleAircraftPause, setAircraftPhysics, aircraftEnvelope } from '../../src/aviation/aircraft-flight.js';
import * as systems from '../../src/aviation/aircraft-systems.js';

const advance = (flight, seconds, input = {}, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) updateAircraftFlight(flight, input, dt);
};

test('speed hold captures airspeed, controls real throttle and follows a selected target across the fleet', () => {
  for (const { id } of AIRCRAFT) {
    const flight = createAircraftFlight(id, true);flight.y = 3000;
    const initial = flight.speed;
    assert.equal(systems.setAutothrottle(flight, true), true);
    assert.equal(flight.systems.autothrottle.target, initial);
    assert.equal(systems.setAutothrottleTarget(flight, initial * 1.1), true);
    advance(flight, 60);
    assert.equal(flight.status, 'running', id);assert.equal(flight.systems.autothrottle.enabled, true, id);
    assert.ok(Math.abs(flight.speed - initial * 1.1) < 4, `${id}: ${flight.speed}`);
    assert.ok(flight.throttle >= 0 && flight.throttle <= 1);
    assert.equal(systems.setAutothrottleTarget(flight, NaN), false);
  }
});

test('speed hold yields to keyboard and direct throttle, brakes, engine failure and excessive angle of attack', () => {
  for (const cause of ['keyboard', 'slider', 'brake', 'engine', 'aoa']) {
    const flight = createAircraftFlight('su30', true);flight.y = 3000;
    systems.setAutopilot(flight, 'hold');assert.equal(systems.setAutothrottle(flight, true), true);
    if (cause === 'slider') systems.setAircraftThrottle(flight, .3);
    if (cause === 'brake') flight.speedBrake = true;
    if (cause === 'engine') flight.systems.engineOn = false;
    if (cause === 'aoa') flight.verticalSpeed = -flight.speed * .7;
    const input = cause === 'keyboard' ? { throttle: -1 } : {};
    updateAircraftFlight(flight, input, 1 / 120);
    assert.equal(flight.systems.autothrottle.enabled, false, cause);
    assert.ok(flight.events.includes('at-disconnect') || cause === 'slider');
    if (cause === 'keyboard' || cause === 'slider') assert.equal(flight.systems.autopilot.mode, 'hold');
  }
});

test('reverse thrust respects aircraft capability, ground contact and engine spool', () => {
  for (const { id } of AIRCRAFT) {
    const airborne = createAircraftFlight(id, true);
    assert.equal(systems.toggleReverseThrust(airborne), false, `${id}: no airborne deployment`);
    const normal = createAircraftFlight(id), reverse = createAircraftFlight(id);
    for (const flight of [normal, reverse]) Object.assign(flight, { status: 'running', speed: 50, throttle: 1, engineOutput: 1 });
    if (!reverse.aircraft.reverseThrust) { assert.equal(systems.toggleReverseThrust(reverse), false);continue; }
    assert.equal(systems.toggleReverseThrust(reverse), true);
    advance(normal, .5);advance(reverse, .5);
    assert.ok(reverse.speed < normal.speed - 1, id);
    assert.equal(reverse.engineOutput, 1);
    reverse.speed = 0;advance(reverse, 1);assert.equal(reverse.speed, 0, 'reverse must not drive backwards');
  }
});

test('automatic braking arms in the air, brakes only after landing and yields to manual braking', () => {
  const flights = ['off', 'low', 'high'].map(mode => {
    const flight = createAircraftFlight('a380', true);
    assert.equal(systems.setAutobrake(flight, mode), true);
    flight.throttle = 0;flight.y = 3000;advance(flight, .1);
    assert.equal(flight.systems.autoBrakeActive, false);
    Object.assign(flight, { onGround: true, hasFlown: true, gearDown: true, y: flight.aircraft.gearHeight, z: 0, pitch: 0, verticalSpeed: 0, speed: 60 });
    advance(flight, 1);return flight;
  });
  assert.ok(flights[2].speed < flights[1].speed - 3 && flights[1].speed < flights[0].speed - 3);
  advance(flights[2], .1, { brake: true });assert.equal(flights[2].systems.autoBrake, 'off');
  const taxi = createAircraftFlight('a380');taxi.status = 'running';taxi.throttle = 1;
  systems.setAutobrake(taxi, 'high');advance(taxi, 4);
  assert.ok(taxi.speed > 0);assert.equal(taxi.systems.autoBrakeActive, false);
});

test('go-around commands full forward thrust, clears braking and automation without teleporting or retracting gear', () => {
  const flight = createAircraftFlight('a380', true);flight.y = 3000;flight.gearDown = true;
  systems.setAutopilot(flight, 'hold');systems.setAutothrottle(flight, true);systems.setAutobrake(flight, 'high');flight.speedBrake = true;
  const snapshot = [flight.x, flight.y, flight.z, flight.speed, flight.pitch, flight.roll, flight.engineOutput];
  assert.equal(systems.commandGoAround(flight), true);
  assert.deepEqual([flight.x, flight.y, flight.z, flight.speed, flight.pitch, flight.roll, flight.engineOutput], snapshot);
  assert.equal(flight.throttle, 1);assert.equal(flight.systems.autopilot.mode, 'off');
  assert.equal(flight.systems.autothrottle.enabled, false);assert.equal(flight.systems.autoBrake, 'off');
  assert.equal(flight.speedBrake, false);assert.equal(flight.gearDown, true);
});

test('operations remain frame-rate independent, pause freezes automation and end states reject commands', () => {
  const flights = [1 / 30, 1 / 60, 1 / 120].map(dt => {
    const flight = createAircraftFlight('b62', true);flight.y = 3000;
    systems.setAutothrottle(flight, true);advance(flight, 10, {}, dt);return flight;
  });
  for (const flight of flights) {
    for (const key of ['speed', 'y', 'throttle', 'engineOutput']) assert.ok(Math.abs(flight[key] - flights[0][key]) < .001, key);
    toggleAircraftPause(flight);const paused = structuredClone(flight);advance(flight, 1);
    assert.deepEqual(flight, { ...paused, events: [] });
    flight.status = 'crashed';
    assert.equal(systems.setAutothrottle(flight, true), false);assert.equal(systems.toggleReverseThrust(flight), false);
    assert.equal(systems.setAutobrake(flight, 'high'), false);assert.equal(systems.commandGoAround(flight), false);
  }
});

test('speed hold clamps targets to the live flight envelope and rejects zero thrust and impossible settings', () => {
  const flight = createAircraftFlight('t6', true);flight.y = 3000;
  systems.setAutothrottleTarget(flight, 0);assert.equal(flight.systems.autothrottle.target, aircraftEnvelope(flight).stall * 1.3);
  systems.setAutothrottleTarget(flight, 10000);assert.equal(flight.systems.autothrottle.target, flight.performance.maxSpeed);
  systems.setAutothrottle(flight, true);
  setAircraftPhysics(flight, { maxSpeed: .7 });advance(flight, .1);
  assert.ok(flight.systems.autothrottle.target <= flight.performance.maxSpeed);
  setAircraftPhysics(flight, { thrust: 0 });advance(flight, .1);
  assert.equal(flight.systems.autothrottle.enabled, false);assert.equal(flight.systems.autothrottle.reason, 'power');
  assert.equal(systems.setAutothrottle(flight, true), false);
  setAircraftPhysics(flight, { thrust: 1, mass: 2, gravity: 1.5, lift: .5, maxSpeed: .5 });
  assert.equal(systems.autothrottleAvailability(flight).reason, 'envelope');
  assert.equal(systems.setAutothrottleTarget(flight, 40), false);
});

test('autobrake works together with reverse and cancels braking when forward takeoff power is requested', () => {
  const flight = createAircraftFlight('a380');
  Object.assign(flight, { status: 'running', hasFlown: true, speed: 70, throttle: 1, engineOutput: 1 });
  systems.toggleReverseThrust(flight);const reverseOnly = structuredClone(flight);systems.setAutobrake(flight, 'high');
  advance(flight, .5, { throttle: 1 });
  advance(reverseOnly, .5, { throttle: 1 });
  assert.equal(flight.systems.autoBrakeActive, true);assert.ok(flight.speed < reverseOnly.speed - 6);
  const takeoff = createAircraftFlight('a380');takeoff.status = 'running';takeoff.speed = takeoff.performance.takeoff + 20;takeoff.throttle = 1;takeoff.engineOutput = 1;
  systems.toggleReverseThrust(takeoff);advance(takeoff, .5, { pitch: 1 });
  assert.equal(takeoff.onGround, true, 'reverse cannot rotate into flight');
  systems.commandGoAround(flight);advance(flight, .1);
  assert.equal(flight.systems.autoBrakeActive, false);assert.equal(flight.systems.reverse, false);
});

test('new operation settings sanitize independently, change actual braking and remain session-local', () => {
  const flight = createAircraftFlight('b62', true), other = createAircraftFlight('b62', true);
  systems.setSystemSettings(flight, { speedResponse: 99, reversePower: -1, autoBrakeStrength: NaN });
  assert.equal(flight.systems.settings.speedResponse, 2);assert.equal(flight.systems.settings.reversePower, .25);
  assert.equal(flight.systems.settings.autoBrakeStrength, 1);assert.equal(other.systems.settings.speedResponse, 1);
  const results = [.25, 1.5].map(strength => {
    const flight = createAircraftFlight('a380');Object.assign(flight, { status: 'running', hasFlown: true, speed: 70 });
    systems.setSystemSettings(flight, { autoBrakeStrength: strength });systems.setAutobrake(flight, 'high');
    advance(flight, .5);return flight.speed;
  });
  assert.ok(results[1] < results[0] - 3);
});

test('shutting down during reverse preserves braking direction while the engine spools down', () => {
  const flight = createAircraftFlight('a380');
  Object.assign(flight, { status: 'running', speed: 40, throttle: 1, engineOutput: 1 });
  systems.toggleReverseThrust(flight);systems.toggleEngine(flight);advance(flight, .25);
  assert.equal(flight.systems.reverse, true);assert.ok(flight.speed < 40);
  assert.ok(flight.engineOutput > .5 && flight.engineOutput < 1);
  assert.equal(systems.toggleReverseThrust(flight), true);assert.equal(flight.systems.reverse, false);
  assert.equal(systems.toggleReverseThrust(flight), false, 'engine must be running to redeploy');
});
