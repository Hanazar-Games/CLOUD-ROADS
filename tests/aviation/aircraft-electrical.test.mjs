import test from 'node:test';
import assert from 'node:assert/strict';
import { createAircraftFlight, updateAircraftFlight, toggleAircraftPause } from '../../src/aviation/aircraft-flight.js';
import * as systems from '../../src/aviation/aircraft-systems.js';
import { createAircraftCockpit, updateCockpitControls } from '../../src/aviation/aircraft-cockpit.js';
import { disposeAircraftObject } from '../../src/aviation/aircraft-models.js';

function advance(flight, seconds, input = {}, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i++) updateAircraftFlight(flight, input, dt);
}

test('airliner restart requires electrical power and a ready APU; starter operation is frozen on pause', () => {
  const flight = createAircraftFlight('a380');
  assert.equal(systems.toggleEngine(flight), true);
  assert.equal(systems.engineStartAvailability(flight), 'apu');
  assert.equal(systems.toggleEngine(flight), false);
  assert.equal(systems.toggleAircraftSystem(flight, 'battery'), true);
  assert.equal(systems.aircraftElectrical(flight).powered, false);
  assert.equal(systems.toggleAircraftSystem(flight, 'apu'), false);
  assert.equal(systems.engineStartAvailability(flight), 'power');
  systems.toggleAircraftSystem(flight, 'battery');systems.toggleAircraftSystem(flight, 'apu');
  for (let i = 0; i < 60; i++) systems.updateAircraftElectrical(flight, .1);
  assert.equal(systems.aircraftElectrical(flight).apuReady, true);
  assert.equal(systems.toggleEngine(flight), true);
  const before = flight.systems.apuRpm;flight.status = 'paused';systems.updateAircraftElectrical(flight, .1);
  assert.equal(flight.systems.apuRpm, before);
  assert.equal(systems.toggleAircraftSystem(createAircraftFlight('t6'), 'apu'), false);
});

test('generator and APU feed the bus independently of the battery; power loss disconnects automation and darkens displays', () => {
  const flight = createAircraftFlight('a380', true);flight.y = 3000;
  systems.toggleAircraftSystem(flight, 'battery');
  assert.equal(systems.aircraftElectrical(flight).powered, true);
  systems.setAutopilot(flight, 'hold');systems.setAutothrottle(flight, true);
  systems.toggleAircraftSystem(flight, 'generator');
  updateAircraftFlight(flight, {}, 1 / 120);
  assert.equal(flight.systems.autopilot.mode, 'off');assert.equal(flight.systems.autopilot.reason, 'electrical');
  assert.equal(flight.systems.autothrottle.enabled, false);assert.equal(flight.systems.autothrottle.reason, 'electrical');
  assert.ok(flight.events.includes('ap-disconnect'));assert.ok(flight.events.includes('at-disconnect'));
  assert.equal(flight.systems.engineOn, true, 'electrical master must not stop a running engine');
  const cockpit = createAircraftCockpit(flight.aircraft);
  updateCockpitControls(cockpit, flight);assert.equal(cockpit.userData.display.material.color.r, 0);
  systems.toggleAircraftSystem(flight, 'battery');updateCockpitControls(cockpit, flight);
  assert.ok(cockpit.userData.display.material.color.r > 0);
  systems.toggleAircraftSystem(flight, 'avionics');
  assert.equal(systems.autopilotAvailability(flight).reason, 'electrical');
  updateCockpitControls(cockpit, flight);assert.equal(cockpit.userData.display.material.color.r, 0);
  disposeAircraftObject(cockpit);
  flight.systems.apuOn = true;flight.systems.apuRpm = 1;flight.systems.batteryOn = false;
  assert.equal(systems.aircraftElectrical(flight).powered, true);
});

test('APU aborts if startup power is removed; spool is frame independent and commands reject ended flights', () => {
  const flights = [1 / 30, 1 / 60, 1 / 120].map(dt => {
    const flight = createAircraftFlight('a380');flight.systems.engineOn = false;
    systems.toggleAircraftSystem(flight, 'apu');flight.status = 'running';advance(flight, 2, {}, dt);return flight;
  });
  for (const flight of flights) assert.ok(Math.abs(flight.systems.apuRpm - flights[0].systems.apuRpm) < 1e-9);
  const flight = flights[0];systems.toggleAircraftSystem(flight, 'battery');advance(flight, .1);
  assert.equal(flight.systems.apuOn, false);
  toggleAircraftPause(flight);const state = structuredClone(flight);advance(flight, 1);
  assert.deepEqual(flight, { ...state, events: [] });
  flight.status = 'crashed';assert.equal(systems.toggleAircraftSystem(flight, 'battery'), false);
  assert.equal(systems.toggleAircraftSystem(flights[1], 'unknown'), false);
  assert.equal(systems.toggleAircraftSystem(flights[1], 'toString'), false);
});

test('yaw damper reduces real sideslip while deliberate rudder input remains available', () => {
  const flights = [false, true].map(enabled => {
    const flight = createAircraftFlight('a380', true, { physics: { lateralResponse: .25 } });
    Object.assign(flight, { y: 3000, heading: .25, sideslip: .25 });
    if (enabled) systems.toggleAircraftSystem(flight, 'yaw-damper');
    advance(flight, 2);return flight;
  });
  assert.ok(Math.abs(flights[1].sideslip) < Math.abs(flights[0].sideslip) * .8);
  const flight = createAircraftFlight('a380', true);flight.y = 3000;
  systems.toggleAircraftSystem(flight, 'yaw-damper');advance(flight, 1, { yaw: 1 });
  assert.ok(flight.heading > .02);
});

test('armed ground spoilers deploy only on touchdown with idle thrust and go-around cancels the arm', () => {
  for (const throttle of [0, 1]) {
    const flight = createAircraftFlight('a380', true);
    Object.assign(flight, { y: flight.aircraft.gearHeight + .005, z: 0, speed: 65, verticalSpeed: -2, throttle, gearDown: true, gearPosition: 1 });
    systems.toggleAircraftSystem(flight, 'spoiler-arm');
    updateAircraftFlight(flight, {}, 1 / 120);
    assert.equal(flight.onGround, true);assert.equal(flight.speedBrake, throttle === 0);
    assert.equal(flight.events.includes('spoilers-deployed'), throttle === 0);
    if (throttle === 1) {
      flight.throttle = 0;updateAircraftFlight(flight, {}, 1 / 120);
      assert.equal(flight.speedBrake, true, 'idle after touchdown must also deploy armed spoilers');
    }
    systems.commandGoAround(flight);assert.equal(flight.systems.spoilerArmed, false);assert.equal(flight.speedBrake, false);
  }
  const flight = createAircraftFlight('a380', true);flight.y = 3000;
  systems.toggleAircraftSystem(flight, 'spoiler-arm');advance(flight, .1);assert.equal(flight.speedBrake, false);
});

test('preflight transfer preserves switch states and APU progress without sharing objects', () => {
  const previous = createAircraftFlight('a380');previous.throttle = .2;
  systems.toggleAircraftSystem(previous, 'apu');systems.updateAircraftElectrical(previous, .1);
  systems.toggleAircraftSystem(previous, 'avionics');systems.toggleAircraftSystem(previous, 'spoiler-arm');
  previous.systems.trim.pitch = .2;
  const flight = createAircraftFlight('a380');systems.restoreAircraftPreflight(flight, previous);
  for (const key of ['engineOn', 'batteryOn', 'generatorOn', 'apuOn', 'apuRpm', 'avionicsOn', 'yawDamper', 'spoilerArmed']) assert.equal(flight.systems[key], previous.systems[key]);
  assert.equal(flight.throttle, .2);assert.equal(flight.systems.trim.pitch, .2);
  flight.systems.trim.pitch = 0;assert.equal(previous.systems.trim.pitch, .2);
});
