import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { AircraftMouseAim, projectFlightDirection } from '../../src/aviation/aircraft-aim.js';
import { flightPathAngle } from '../../src/aviation/aircraft-envelope.js';
import { AIRCRAFT, AIRCRAFT_STEP, createAircraftFlight, updateAircraftFlight } from '../../src/aviation/aircraft-flight.js';
import { setAutopilot } from '../../src/aviation/aircraft-systems.js';

test('mouse aim projects a world direction and preserves it as the camera follows the aircraft', () => {
  const camera = new PerspectiveCamera(65, 1.5, 8, 30000);
  const aim = new AircraftMouseAim(), point = {};
  aim.reset(createAircraftFlight('t6', true));
  aim.move(120, -80, camera, 1200, 800);
  assert.ok(aim.engaged);
  assert.ok(aim.heading > 0 && aim.elevation > 0);
  assert.ok(projectFlightDirection(aim.heading, aim.elevation, camera, point));
  assert.ok(Math.abs(point.x - .2) < 1e-8 && Math.abs(point.y - .2) < 1e-8);
  const { heading, elevation } = aim;
  camera.position.set(9000, 2000, -3000);
  camera.rotation.y = -heading;
  aim.move(0, 0, camera, 1200, 800);
  assert.ok(projectFlightDirection(aim.heading, aim.elevation, camera, point));
  assert.ok(Math.abs(point.x) < 1e-8, 'the reticle moves as the camera catches up');
  assert.equal(aim.heading, heading);
  assert.equal(aim.elevation, elevation);
});

test('every aircraft banks and brings its actual flight path toward the aim direction', () => {
  for (const { id } of AIRCRAFT) {
    const flight = createAircraftFlight(id, true);
    Object.assign(flight, { y: 4000, throttle: .85, engineOutput: .85 });
    const aim = { heading: .35, elevation: .12 };
    let greatestBank = 0;
    for (let i = 0; i < 15 / AIRCRAFT_STEP; i++) {
      updateAircraftFlight(flight, { aim }, AIRCRAFT_STEP);
      greatestBank = Math.max(greatestBank, flight.roll);
      assert.ok(!flight.stalling, id);
    }
    assert.ok(greatestBank > .35 && greatestBank < flight.performance.bankLimit + .05, id);
    assert.ok(Math.abs(flight.trackHeading - aim.heading) < .025, id);
    assert.ok(Math.abs(flightPathAngle(flight) - aim.elevation) < .015, id);
  }
});

test('aim can rotate from the runway and gives way to direct controls without commanding an unsafe low-speed bank', () => {
  const takeoff = createAircraftFlight('t6');
  takeoff.status = 'running'; takeoff.throttle = 1;
  const aim = { heading: 0, elevation: .16 };
  for (let i = 0; i < 30 / AIRCRAFT_STEP && takeoff.onGround; i++) updateAircraftFlight(takeoff, { aim }, AIRCRAFT_STEP);
  assert.ok(!takeoff.onGround && takeoff.speed >= takeoff.performance.takeoff);

  const low = createAircraftFlight('su30', true);
  Object.assign(low, { y: 4000, speed: low.performance.stall * .65 });
  for (let i = 0; i < 120; i++) updateAircraftFlight(low, { aim: { heading: 1, elevation: .6 } }, AIRCRAFT_STEP);
  assert.ok(Math.abs(low.roll) < .05);
  assert.ok(low.y < 4000);

  const manual = createAircraftFlight('su30', true);
  for (let i = 0; i < 60; i++) updateAircraftFlight(manual, { aim: { heading: 1, elevation: 0 }, roll: -1 }, AIRCRAFT_STEP);
  assert.ok(manual.roll < -.3);
});

test('a decisive mouse correction takes over attitude hold and leaves the speed control independent', () => {
  const flight = createAircraftFlight('su30', true);
  assert.ok(setAutopilot(flight, 'hold'));
  updateAircraftFlight(flight, { aim: { heading: .01, elevation: 0 } }, AIRCRAFT_STEP);
  assert.equal(flight.systems.autopilot.mode, 'hold');
  updateAircraftFlight(flight, { aim: { heading: .5, elevation: 0 } }, AIRCRAFT_STEP);
  assert.equal(flight.systems.autopilot.reason, 'manual');
  assert.ok(flight.events.includes('ap-disconnect'));
  assert.equal(flight.throttle, .65);
});
