import { airportHeight } from '../../src/aviation/airport.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, createAircraftFlight, updateAircraftFlight, aircraftEnvelope } from '../../src/aviation/aircraft-flight.js';
import { aircraftInput } from '../../src/aviation/aircraft-controls.js';
import { SYSTEM_DEFAULTS, SYSTEM_LIMITS, setSystemSettings, setAircraftTrim, setAutopilot, setAutopilotTarget, toggleEngine, toggleParkingBrake, autopilotAvailability } from '../../src/aviation/aircraft-systems.js';

const advance = (flight, seconds, input = {}, step = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / step); i++) updateAircraftFlight(flight, input, step);
};

test('flight systems start ready, sanitize settings and do not share runtime state', () => {
  const a = createAircraftFlight('su30', true), b = createAircraftFlight('su30', true);
  assert.equal(a.systems.engineOn, true); assert.equal(a.systems.parkingBrake, false); assert.equal(a.systems.autopilot.mode, 'off');
  setSystemSettings(a, { trimAuthority: 99, climbRate: NaN, displayBrightness: -2 });
  assert.equal(a.systems.settings.trimAuthority, SYSTEM_LIMITS.trimAuthority[1]);
  assert.equal(a.systems.settings.climbRate, SYSTEM_DEFAULTS.climbRate);
  assert.equal(a.systems.settings.displayBrightness, SYSTEM_LIMITS.displayBrightness[0]);
  setAircraftTrim(a, 'pitch', .6); assert.equal(b.systems.trim.pitch, 0);
  assert.equal(setAircraftTrim(a, 'pitch', NaN), false); assert.equal(setAircraftTrim(a, 'unknown', 1), false);
  assert.equal(setAircraftTrim(a, 'roll', 5), true); assert.equal(a.systems.trim.roll, 1);
});

test('three-axis trim affects actual attitude and is frozen while paused', () => {
  for (const axis of ['pitch', 'roll', 'yaw']) {
    const a = createAircraftFlight('su30', true), b = createAircraftFlight('su30', true);
    a.y = b.y = 3000;setAircraftTrim(a, axis, .8);
    advance(a, 2);advance(b, 2);
    const field = axis === 'yaw' ? 'heading' : axis;
    assert.ok(Math.abs(a[field] - b[field]) > .005, axis);
    a.status = 'paused';const snapshot = structuredClone(a);advance(a, 1, { trimPitch: 1, trimRoll: 1, trimYaw: 1 });
    assert.deepEqual(a, { ...snapshot, events: [] });
  }
});

test('three-axis trim commands respect rate, bounds and step size without changing target throttle', () => {
  for (const step of [1 / 30, 1 / 120]) {
    const flight = createAircraftFlight('su30', true);flight.y = 3000;
    setSystemSettings(flight, { trimRate: .2 });advance(flight, 2, { trimPitch: 1, trimRoll: -1, trimYaw: 1 }, step);
    assert.ok(Math.abs(flight.systems.trim.pitch - .4) < 1e-8);
    assert.ok(Math.abs(flight.systems.trim.roll + .4) < 1e-8);
    assert.ok(Math.abs(flight.systems.trim.yaw - .4) < 1e-8);assert.equal(flight.throttle, .65);
    for (const axis of ['pitch', 'roll', 'yaw']) setAircraftTrim(flight, axis, .99);
    advance(flight, .1, { trimPitch: 100, trimRoll: 100, trimYaw: 100 }, step);
    assert.deepEqual(flight.systems.trim, { pitch: 1, roll: 1, yaw: 1 });
  }
});

test('engine master spools down to glide and restarts without teleporting or erasing throttle', () => {
  const flight = createAircraftFlight('a380', true);flight.y = 3000;
  assert.equal(toggleEngine(flight), true);advance(flight, 8);
  assert.ok(flight.engineOutput < .01);assert.equal(flight.throttle, .65);assert.ok(flight.speed > 0);
  const before = [flight.x, flight.y, flight.z, flight.speed];assert.equal(toggleEngine(flight), true);
  assert.deepEqual([flight.x, flight.y, flight.z, flight.speed], before);advance(flight, 1);assert.ok(flight.engineOutput > .1);
});

test('parking brake holds a stopped aircraft against full power and cannot engage in flight or at speed', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id);flight.status = 'running';
    assert.equal(toggleParkingBrake(flight), true);advance(flight, 5, { throttle: 1 });
    assert.equal(flight.speed, 0);assert.equal(flight.distance, 0);assert.equal(flight.onGround, true);
    assert.equal(toggleParkingBrake(flight), true);advance(flight, 2);assert.ok(flight.speed > 0);
  }
  const flight = createAircraftFlight('su30', true);assert.equal(toggleParkingBrake(flight), false);
  flight.onGround = true;flight.speed = 30;assert.equal(toggleParkingBrake(flight), false);
});

test('autopilot captures current targets, follows the shortest heading turn and leaves throttle manual', () => {
  const flight = createAircraftFlight('su30', true);Object.assign(flight, { y: 3000, heading: 359 * Math.PI / 180 });
  assert.equal(setAutopilot(flight, 'hold'), true);assert.equal(flight.systems.autopilot.altitude, 3000);
  assert.equal(setAutopilotTarget(flight, 'heading', 1), true);advance(flight, 1);
  assert.ok(flight.roll > 0 && flight.roll < .15);assert.equal(flight.throttle, .65);
  assert.equal(setAutopilotTarget(flight, 'altitude', NaN), false);
});

test('autopilot retains captured low and high altitudes and accepts targets above 12000 metres', () => {
  for (const altitude of [75, 14500]) {
    const flight = createAircraftFlight('su30', true);flight.y = altitude;
    assert.equal(setAutopilot(flight, 'hold'), true);assert.equal(flight.systems.autopilot.altitude, altitude);
    assert.equal(setAutopilotTarget(flight, 'altitude', altitude), true);assert.equal(flight.systems.autopilot.altitude, altitude);
  }
  const flight = createAircraftFlight('su30', true);
  assert.equal(setAutopilotTarget(flight, 'altitude', -50), true);assert.equal(flight.systems.autopilot.altitude, 0);
  assert.equal(setAutopilotTarget(flight, 'altitude', Infinity), false);assert.equal(flight.systems.autopilot.altitude, 0);
});

test('every aircraft holds altitude and converges toward selected heading in stable cruise', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id, true);flight.y = 3000;
    setAutopilot(flight, 'hold');setAutopilotTarget(flight, 'heading', 15);advance(flight, 45);
    assert.equal(flight.status, 'running', aircraft.id);assert.equal(flight.systems.autopilot.mode, 'hold', aircraft.id);
    assert.ok(Math.abs(flight.y - 3000) < 35, `${aircraft.id}: altitude ${flight.y}`);
    assert.ok(Math.abs(flight.heading * 180 / Math.PI - 15) < 8, `${aircraft.id}: heading ${flight.heading}`);
  }
});

test('autopilot refuses excessive angle of attack and disconnects when airflow separates', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id, true);
    Object.assign(flight, { y: 3000, speed: flight.performance.stall * 2, pitch: .3, verticalSpeed: -flight.speed * .3 });
    assert.equal(autopilotAvailability(flight).reason, 'aoa', aircraft.id);
    assert.equal(setAutopilot(flight, 'hold'), false);
    flight.pitch = 0;flight.verticalSpeed = 0;
    assert.equal(setAutopilot(flight, 'hold'), true);
    flight.verticalSpeed = -flight.speed * .6;
    updateAircraftFlight(flight, {}, 1 / 120);
    assert.equal(flight.systems.autopilot.mode, 'off');
    assert.equal(flight.systems.autopilot.reason, 'aoa');
    assert.ok(flight.events.includes('ap-disconnect'));
  }
});

test('autopilot yields immediately to pilot override, unsafe speed, ground and maneuver mode', () => {
  for (const cause of ['manual', 'stall', 'ground', 'mode']) {
    const flight = createAircraftFlight('su30', true);flight.y = 3000;assert.equal(setAutopilot(flight, 'hold'), true);
    if (cause === 'stall') flight.speed = 20;
    if (cause === 'ground') flight.onGround = true;
    if (cause === 'mode') flight.physics.mode = 'maneuver';
    updateAircraftFlight(flight, cause === 'manual' ? { roll: .6 } : {}, 1 / 60);
    assert.equal(flight.systems.autopilot.mode, 'off', cause);assert.equal(flight.systems.autopilot.reason, cause);
    assert.ok(flight.events.includes('ap-disconnect'));
  }
  const flight = createAircraftFlight('su30');assert.equal(setAutopilot(flight, 'hold'), false);
  flight.status = 'crashed';assert.equal(toggleEngine(flight), false);assert.equal(setAircraftTrim(flight, 'pitch', .2), false);
});

test('wing leveling works with manual stability disabled and altitude target changes stay smooth', () => {
  const flight = createAircraftFlight('su30', true, { physics: { stability: 0 } });flight.y = 3000;flight.roll = .4;
  assert.equal(setAutopilot(flight, 'level'), true);advance(flight, 6);assert.ok(Math.abs(flight.roll) < .02);
  assert.equal(setAutopilot(flight, 'hold'), true);
  const before = [flight.x, flight.y, flight.z, flight.speed];setAutopilotTarget(flight, 'altitude', 3200);
  assert.deepEqual([flight.x, flight.y, flight.z, flight.speed], before);advance(flight, 50);
  assert.ok(flight.y > 3100 && flight.y < 3220);assert.ok(Math.abs(flight.verticalSpeed) < 6);
});

test('system tuning and autopilot remain consistent across simulation step sizes', () => {
  const samples = [];
  for (const step of [1 / 30, 1 / 60, 1 / 120]) {
    const flight = createAircraftFlight('su30', true);flight.y = 3000;setAutopilot(flight, 'hold');
    setAutopilotTarget(flight, 'heading', 30);advance(flight, 20, {}, step);samples.push(flight);
  }
  for (const flight of samples.slice(1)) {
    assert.ok(Math.abs(flight.heading - samples[0].heading) < .005);
    assert.ok(Math.abs(flight.y - samples[0].y) < 1);assert.ok(Math.abs(flight.speed - samples[0].speed) < 1);
  }
});

test('autopilot engagement uses the current bank and flap stall envelope for every aircraft', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id, true);flight.y = 3000;
    flight.roll = 50 * Math.PI / 180;flight.speed = flight.performance.stall * 1.2;
    assert.ok(flight.speed < aircraftEnvelope(flight).stall * 1.15);
    assert.equal(setAutopilot(flight, 'hold'), false, `${aircraft.id}: banked stall margin`);
    flight.roll = 0;flight.flaps = 2;flight.speed = flight.performance.stall * .97;
    assert.ok(flight.speed > aircraftEnvelope(flight).stall * 1.15);
    assert.equal(setAutopilot(flight, 'level'), true, `${aircraft.id}: flap lift margin`);
    updateAircraftFlight(flight, {}, 1 / 120);assert.equal(flight.systems.autopilot.mode, 'level');
  }
});

test('keyboard and touch can take over autopilot at minimum sensitivity and maximum threshold', () => {
  for (const [axis, key] of [['pitch', 'ArrowDown'], ['roll', 'KeyA'], ['yaw', 'KeyQ']]) {
    for (const touch of [false, true]) {
      const flight = createAircraftFlight('su30', true);flight.y = 3000;
      setSystemSettings(flight, { overrideThreshold: .6 });setAutopilot(flight, 'hold');
      const input = aircraftInput(new Set(touch ? [] : [key]), touch ? { [axis]: 1 } : {}, { [`${axis}Sensitivity`]: .2 });
      assert.equal(Math.abs(input[axis]), .2);
      updateAircraftFlight(flight, input, 1 / 60);
      assert.equal(flight.systems.autopilot.mode, 'off', `${axis}: ${touch ? 'touch' : 'keyboard'}`);
      assert.equal(flight.systems.autopilot.reason, 'manual');assert.ok(flight.events.includes('ap-disconnect'));
      assert.equal(Math.abs(flight.systems.controls[axis]), .2, 'takeover preserves the selected control sensitivity');
    }
  }
});

test('takeover ignores throttle, cancelled axes and joystick noise, and clears reused input', () => {
  const input = {};
  for (const [held, touch] of [[['KeyW'], {}], [['KeyA', 'KeyD'], {}], [[], { roll: .05 }]]) {
    const flight = createAircraftFlight('su30', true);flight.y = 3000;setAutopilot(flight, 'hold');
    aircraftInput(new Set(held), touch, { rollSensitivity: 2 }, input);updateAircraftFlight(flight, input, 1 / 60);
    assert.equal(flight.systems.autopilot.mode, 'hold');
  }
  aircraftInput(new Set(['KeyA']), {}, {}, input);
  const flight = createAircraftFlight('su30', true);flight.y = 3000;setAutopilot(flight, 'hold');
  aircraftInput(new Set(), {}, {}, input);updateAircraftFlight(flight, input, 1 / 60);
  assert.equal(flight.systems.autopilot.mode, 'hold');
});

test('autopilot reports the blocking condition without changing captured targets and still allows disconnection', () => {
  for (const reason of ['status', 'ground', 'mode', 'engine', 'stall', 'attitude']) {
    const flight = createAircraftFlight('su30', true);flight.y = 3000;
    assert.equal(setAutopilot(flight, 'hold'), true);
    const targets = [flight.systems.autopilot.heading, flight.systems.autopilot.altitude];
    if (reason === 'status') flight.status = 'crashed';
    if (reason === 'ground') flight.onGround = true;
    if (reason === 'mode') flight.physics.mode = 'maneuver';
    if (reason === 'engine') flight.systems.engineOn = false;
    if (reason === 'stall') flight.speed = 20;
    if (reason === 'attitude') flight.pitch = .5;
    assert.equal(autopilotAvailability(flight).reason, reason);
    assert.equal(autopilotAvailability(flight).minimumSpeed, aircraftEnvelope(flight).stall * 1.15);
    assert.equal(setAutopilot(flight, 'level'), false);
    assert.deepEqual([flight.systems.autopilot.heading, flight.systems.autopilot.altitude], targets);
    if (reason !== 'status') assert.equal(setAutopilot(flight, 'off'), true, reason);
  }
});

test('takeover threshold stays independent of high sensitivity and respects the joystick curve', () => {
  const flight = createAircraftFlight('su30', true);flight.y = 3000;
  setSystemSettings(flight, { overrideThreshold: .6 });setAutopilot(flight, 'hold');
  const settings = { rollSensitivity: 2, curve: 2, deadzone: .1 };
  const input = aircraftInput(new Set(), { roll: .7 }, settings);
  assert.ok(input.roll > .6);assert.ok(input.pilotOverride < .6);
  updateAircraftFlight(flight, input, 1 / 60);assert.equal(flight.systems.autopilot.mode, 'hold');
  aircraftInput(new Set(), { roll: 1 }, settings, input);updateAircraftFlight(flight, input, 1 / 60);
  assert.equal(flight.systems.autopilot.mode, 'off');
});

test('pause preserves autopilot but a collision clears its active state for every aircraft', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id, true);flight.y = 3000;
    assert.equal(setAutopilot(flight, 'hold'), true);flight.status = 'paused';advance(flight, 1);
    assert.equal(flight.systems.autopilot.mode, 'hold');
    flight.status = 'running';flight.x = 4000;flight.z = -6000;flight.y = airportHeight(flight.x, flight.z) + .1;
    updateAircraftFlight(flight, {}, 1 / 60);
    assert.equal(flight.status, 'crashed', aircraft.id);assert.equal(flight.systems.autopilot.mode, 'off', aircraft.id);
    assert.equal(flight.systems.autopilot.reason, 'status');assert.ok(flight.events.includes('crash'));
  }
});
