import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraftKeyBinding, aircraftInput, smoothAircraftInput, aircraftControlHelp, aircraftThrottleShortcut, aircraftSystemShortcut, aircraftTrimBinding, aircraftTrimInput } from '../../src/aviation/aircraft-controls.js';
import { createAircraftFlight, updateAircraftFlight } from '../../src/aviation/aircraft-flight.js';
import { setAutopilot } from '../../src/aviation/aircraft-systems.js';

test('precision control reduces all three axes while retaining immediate braking, throttle and takeover intent', () => {
  for (const modifier of ['ShiftLeft', 'ShiftRight']) for (const preset of ['flight', 'wasd']) {
    const held = new Set([modifier, preset === 'wasd' ? 'KeyS' : 'ArrowDown', 'KeyD', 'KeyQ', preset === 'wasd' ? 'ArrowUp' : 'KeyW', 'Space']);
    const input = aircraftInput(held, {}, { preset });
    assert.equal(input.pitch, .4); assert.equal(input.roll, .4); assert.equal(input.yaw, -.4);
    assert.equal(input.throttle, 1); assert.equal(input.throttleRate, .3); assert.equal(input.brake, true); assert.equal(input.pilotOverride, 1);
    held.delete(modifier); assert.equal(aircraftInput(held, {}, { preset }).pitch, 1);
  }
  const input = aircraftInput(new Set(), { pitch: 1, roll: -1, yaw: .5, precision: true }, { deadzone: 0, precisionAuthority: .25, invertPitch: true });
  assert.equal(input.pitch, -.25); assert.equal(input.roll, -.25); assert.equal(input.yaw, .125); assert.equal(input.pilotOverride, 1);
});

test('precision authority caps boosted sensitivity, sanitizes its range and does not alter opposing inputs', () => {
  const held = new Set(['ShiftLeft', 'ShiftRight', 'KeyD']);
  for (const [value, expected] of [[.1, .1], [.8, .8], [-1, .1], [2, .8], [NaN, .4], [Infinity, .4]]) {
    assert.equal(aircraftInput(held, {}, { rollSensitivity: 2, precisionAuthority: value }).roll, expected);
  }
  held.add('KeyA'); assert.equal(aircraftInput(held).roll, 0);
  held.delete('KeyA'); held.delete('ShiftLeft');
  assert.equal(aircraftInput(held).roll, .4, 'either Shift key retains precision mode');
  assert.equal(aircraftInput(new Set(['ShiftLeft'])).pilotOverride, 0, 'precision alone does not take over AP');
});

test('the lowest precision authority still disconnects autopilot on the first manual command', () => {
  const flight = createAircraftFlight('a380', true), input = {};
  assert.equal(setAutopilot(flight, 'hold'), true);
  const target = aircraftInput(new Set(['ShiftLeft', 'KeyD']), {}, { precisionAuthority: .1, rollSensitivity: .2 });
  smoothAircraftInput(input, target, { inputRiseTime: .8 }, 1 / 120);
  assert.ok(input.roll > 0 && input.roll < .02);
  updateAircraftFlight(flight, input, 1 / 60);
  assert.equal(flight.systems.autopilot.mode, 'off'); assert.equal(flight.systems.autopilot.reason, 'manual');
});

test('three-axis trim keys are independent, cancel opposites and clear a reused output on release', () => {
  const held = new Set(['BracketRight', 'Comma', 'Quote']), output = { roll: .3 };
  assert.equal(aircraftTrimInput(held, output), output);
  assert.deepEqual(output, { roll: .3, trimPitch: 1, trimRoll: -1, trimYaw: 1 });
  for (const code of ['BracketLeft', 'Period', 'Semicolon']) held.add(code);
  aircraftTrimInput(held, output);
  assert.equal(output.trimPitch, 0); assert.equal(output.trimRoll, 0); assert.equal(output.trimYaw, 0);
  for (const code of held) {
    assert.ok(aircraftTrimBinding(code));
    for (const preset of ['flight', 'wasd']) assert.equal(aircraftKeyBinding(code, preset), undefined);
  }
  aircraftTrimInput(new Set(['KeyD']), output);
  assert.deepEqual(output, { roll: .3, trimPitch: 0, trimRoll: 0, trimYaw: 0 });
});

test('WASD matches forward-stick nose-down input and its help follows inversion', () => {
  assert.equal(aircraftInput(new Set(['KeyW']), {}, { preset: 'wasd' }).pitch, -1);
  assert.equal(aircraftInput(new Set(['KeyS']), {}, { preset: 'wasd' }).pitch, 1);
  assert.equal(aircraftControlHelp({ preset: 'wasd' }).pitch, 'S / W');
  assert.equal(aircraftControlHelp({ preset: 'wasd', invertPitch: true }).pitch, 'W / S');
});

test('lateral key exchange keeps three independent axes and arrow-roll aliases', () => {
  for (const preset of ['flight', 'wasd']) {
    assert.deepEqual(aircraftKeyBinding('KeyA', preset, 'yaw'), ['yaw', -1]);
    assert.deepEqual(aircraftKeyBinding('KeyE', preset, 'yaw'), ['roll', 1]);
    assert.deepEqual(aircraftKeyBinding('ArrowLeft', preset, 'yaw'), ['roll', -1]);
    const settings = { preset, lateral: 'yaw' };
    const input = aircraftInput(new Set(['KeyA', 'KeyE', preset === 'wasd' ? 'KeyS' : 'ArrowDown']), {}, settings);
    assert.equal(input.yaw, -1);assert.equal(input.roll, 1);assert.equal(input.pitch, 1);
    assert.equal(aircraftInput(new Set(['KeyQ', 'ArrowLeft']), {}, settings).roll, -1);
    assert.equal(aircraftInput(new Set(['KeyQ', 'KeyE']), {}, settings).roll, 0);
    assert.equal(aircraftControlHelp(settings).roll, 'Q / E');
    assert.equal(aircraftControlHelp(settings).yaw, 'A / D');
  }
});

test('progressive controls rise, return and reverse consistently across frame rates', () => {
  const settings = { inputRiseTime: .4, inputReturnTime: .2 };
  const samples = [];
  for (const hz of [30, 60, 120]) {
    const input = {}, target = aircraftInput(new Set(['KeyA', 'KeyE', 'ArrowDown']));
    const advance = (seconds, target) => {
      for (let i = 0; i < Math.round(seconds * hz); i++) smoothAircraftInput(input, target, settings, 1 / hz);
    };
    advance(.1, target);
    assert.ok(Math.abs(input.roll + .25) < 1e-12);
    assert.ok(Math.abs(input.pitch - .25) < 1e-12 && Math.abs(input.yaw - .25) < 1e-12);
    advance(.1, aircraftInput(new Set(['KeyD'])));
    assert.ok(Math.abs(input.roll - .125) < 1e-12, 'cross neutral before applying opposite input');
    samples.push(input.roll);
    advance(.1, aircraftInput(new Set()));
    assert.equal(input.pitch, 0);assert.equal(input.roll, 0);assert.equal(input.yaw, 0);
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) < 1e-12);
});

test('input smoothing preserves immediate braking, throttle and autopilot takeover', () => {
  const flight = createAircraftFlight('a380', true), input = {};
  assert.equal(setAutopilot(flight, 'level'), true);
  const target = aircraftInput(new Set(['KeyD', 'KeyW', 'Space']), {}, { rollSensitivity: .2 });
  smoothAircraftInput(input, target, { inputRiseTime: .8 }, 1 / 120);
  assert.ok(input.roll > 0 && input.roll < .2);assert.equal(input.pilotOverride, 1);
  assert.equal(input.brake, true);assert.equal(input.throttle, 1);
  updateAircraftFlight(flight, input, 1 / 60);
  assert.equal(flight.systems.autopilot.mode, 'off');
  assert.equal(flight.systems.autopilot.reason, 'manual');
  assert.equal(flight.systems.controls.brake, true);
});

test('zero smoothing is direct, invalid times stay finite, and stopped time cannot advance controls', () => {
  const input = {}, target = aircraftInput(new Set(['KeyD', 'KeyQ']));
  smoothAircraftInput(input, target, { inputRiseTime: 0, inputReturnTime: 0 }, 1 / 60);
  assert.equal(input.roll, 1);assert.equal(input.yaw, -1);
  const frozen = { ...input };
  for (const dt of [0, -.1, NaN, Infinity]) {
    smoothAircraftInput(input, aircraftInput(new Set()), {}, dt);
    assert.deepEqual(input, frozen);
  }
  smoothAircraftInput(input, aircraftInput(new Set()), { inputRiseTime: NaN, inputReturnTime: Infinity }, 1 / 120);
  assert.ok(Number.isFinite(input.roll) && input.roll > 0 && input.roll < 1);
  smoothAircraftInput(input, aircraftInput(new Set()), { inputRiseTime: 0, inputReturnTime: 0 }, 1 / 60);
  assert.equal(input.roll, 0);assert.equal(input.yaw, 0);
});

test('flight keys retain defaults and alternate keys do not amplify an axis', () => {
  assert.deepEqual(aircraftKeyBinding('ArrowDown'), ['pitch', 1]);
  assert.equal(aircraftKeyBinding('KeyV'), undefined);
  const input = aircraftInput(new Set(['KeyA', 'ArrowLeft', 'ArrowDown', 'KeyW', 'Space']));
  assert.deepEqual(input, { pitch: 1, roll: -1, yaw: 0, throttle: 1, throttleRate: .3, brake: true, pilotOverride: 1 });
  assert.equal(aircraftInput(new Set(['KeyA', 'ArrowLeft', 'KeyD'])).roll, 0);
});

test('WASD preset, pitch inversion and sensitivity apply to keyboard and touch', () => {
  const settings = { preset: 'wasd', pitchSensitivity: .5, rollSensitivity: .5, yawSensitivity: .5, deadzone: 0, invertPitch: true };
  assert.deepEqual(aircraftInput(new Set(['KeyW', 'KeyD', 'ArrowUp', 'KeyQ']), {}, settings), { pitch: .5, roll: .5, yaw: -.5, throttle: 1, throttleRate: .3, brake: false, pilotOverride: 1 });
  const touch = aircraftInput(new Set(), { pitch: .6, roll: -.8, brake: true }, settings);
  assert.equal(touch.pitch, -.3); assert.equal(touch.roll, -.4); assert.equal(touch.brake, true);
  assert.match(aircraftControlHelp(settings).pitch, /W.*S/);
  assert.match(aircraftControlHelp(settings).throttle, /↑.*↓/);
});

test('invalid settings and unknown keys cannot poison flight input', () => {
  assert.deepEqual(aircraftInput(new Set(['Unknown']), { pitch: NaN, roll: Infinity }, { preset: 'unknown', pitchSensitivity: NaN, throttleRate: Infinity }), { pitch: 0, roll: 0, yaw: 0, throttle: 0, throttleRate: .3, brake: false, pilotOverride: 0 });
  assert.equal(aircraftInput(new Set(['ArrowDown']), {}, { pitchSensitivity: 100 }).pitch, 1);
  assert.equal(aircraftInput(new Set(), { roll: -.7 }, { deadzone: 0 }).roll, -.7);
});

test('reused input output clears released axes and preserves mixed keyboard and touch cancellation', () => {
  const output = { pitch: 99, roll: 99, yaw: 99, throttle: 99, brake: true };
  assert.equal(aircraftInput(new Set(['KeyA', 'ArrowLeft', 'ArrowDown']), { roll: .4 }, { deadzone: 0 }, output), output);
  assert.equal(output.roll, -.6); assert.equal(output.pitch, 1);
  aircraftInput(new Set(), {}, {}, output);
  assert.deepEqual(output, { pitch: 0, roll: 0, yaw: 0, throttle: 0, throttleRate: .3, brake: false, pilotOverride: 0 });
});

test('independent axis gains preserve keyboard authority, inversion and opposite input cancellation', () => {
  const settings = { pitchSensitivity: .2, rollSensitivity: .65, yawSensitivity: 2, invertPitch: true, curve: 3, deadzone: .25 };
  const input = aircraftInput(new Set(['ArrowDown', 'KeyD', 'KeyE', 'KeyW']), {}, settings);
  assert.equal(input.pitch, -.2); assert.equal(input.roll, .65); assert.equal(input.yaw, 1); assert.equal(input.throttle, 1);
  assert.equal(aircraftInput(new Set(['KeyQ']), { yaw: 1 }, settings).yaw, 0);
  assert.equal(aircraftInput(new Set(['KeyE']), { yaw: -1 }, settings).yaw, 0);
});

test('touch deadzone is continuous, symmetric and remapped to full travel before its response curve', () => {
  const settings = { deadzone: .2, curve: 2 };
  const sample = value => aircraftInput(new Set(), { pitch: value }, settings).pitch;
  assert.equal(sample(.19), 0); assert.equal(sample(-.2), 0);
  assert.ok(Math.abs(sample(.6) - .25) < 1e-12);
  assert.ok(Math.abs(sample(-.6) + .25) < 1e-12);
  assert.ok(sample(.2001) < 1e-6);
  assert.equal(sample(1), 1); assert.equal(sample(-1), -1);
  let previous = 0;
  for (let i = 0; i <= 100; i++) { const value = sample(i / 100); assert.ok(value >= previous); previous = value; }
  assert.equal(aircraftInput(new Set(), { throttle: .1 }, settings).throttle, .1);
  assert.equal(aircraftInput(new Set(['ArrowDown']), {}, settings).pitch, 1);
});

test('control ranges clamp safely without sharing settings between axes', () => {
  const input = aircraftInput(new Set(['KeyE']), { pitch: .5, roll: .5 }, { pitchSensitivity: -10, rollSensitivity: 99, yawSensitivity: NaN, deadzone: -1, curve: 99, throttleRate: 99 });
  assert.equal(input.pitch, .025); assert.equal(input.roll, .25); assert.equal(input.yaw, 1); assert.equal(input.throttleRate, 1);
  const fallback = aircraftInput(new Set(), { roll: .5 }, { deadzone: NaN, curve: Infinity });
  assert.ok(Math.abs(fallback.roll - (.5 - .07) / .93) < 1e-12);
});

test('keyboard throttle rate changes target travel consistently while engine output retains spool lag', () => {
  for (const rate of [.05, .3, 1]) for (const step of [1 / 30, 1 / 120]) {
    const flight = createAircraftFlight('a380'); flight.status = 'running';
    const input = aircraftInput(new Set(['KeyW']), {}, { throttleRate: rate });
    for (let i = 0; i < Math.round(.5 / step); i++) updateAircraftFlight(flight, input, step);
    assert.ok(Math.abs(flight.throttle - rate * .5) < 1e-12);
    assert.ok(flight.engineOutput > 0 && flight.engineOutput < flight.throttle);
    input.throttle = -1;
    for (let i = 0; i < Math.round(.5 / step); i++) updateAircraftFlight(flight, input, step);
    assert.ok(flight.throttle < 1e-12);
    input.throttle = 0;
    updateAircraftFlight(flight, input, step); assert.ok(flight.throttle < 1e-12);
  }
});

test('throttle shortcuts expose idle, cruise and full power without colliding with held flight axes', () => {
  for (const [digit, value] of [[1, 0], [2, .65], [3, 1]]) {
    assert.equal(aircraftThrottleShortcut(`Digit${digit}`), value);
    assert.equal(aircraftThrottleShortcut(`Numpad${digit}`), value);
    assert.equal(aircraftKeyBinding(`Digit${digit}`), undefined);
  }
  assert.equal(aircraftThrottleShortcut('KeyW'), undefined);
});

test('cockpit operation shortcuts remain distinct from both control presets and throttle presets', () => {
  const shortcuts = { KeyH: 'ap-hold', KeyJ: 'ap-level', KeyK: 'engine', KeyN: 'parking', KeyT: 'trim-reset', KeyU: 'autothrottle', KeyM: 'reverse', KeyO: 'autobrake', KeyY: 'go-around', Backspace: 'ap-off' };
  for (const [code, action] of Object.entries(shortcuts)) {
    assert.equal(aircraftSystemShortcut(code), action);
    for (const preset of ['flight', 'wasd']) assert.equal(aircraftKeyBinding(code, preset), undefined);
    assert.equal(aircraftThrottleShortcut(code), undefined);
  }
  for (const code of ['KeyW', 'KeyS', 'KeyZ', 'KeyX', 'BracketLeft', 'BracketRight', 'KeyI', 'KeyV', 'Digit1']) assert.equal(aircraftSystemShortcut(code), undefined);
});
