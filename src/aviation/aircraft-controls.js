const common = { KeyA: ['roll', -1], KeyD: ['roll', 1], ArrowLeft: ['roll', -1], ArrowRight: ['roll', 1], KeyQ: ['yaw', -1], KeyE: ['yaw', 1], Space: ['brake', 1] };
const presets = {
  flight: { ...common, KeyW: ['throttle', 1], KeyS: ['throttle', -1], ArrowDown: ['pitch', 1], ArrowUp: ['pitch', -1] },
  wasd: { ...common, KeyW: ['pitch', -1], KeyS: ['pitch', 1], ArrowUp: ['throttle', 1], ArrowDown: ['throttle', -1] },
};
const yawKeys = { KeyA: ['yaw', -1], KeyD: ['yaw', 1], KeyQ: ['roll', -1], KeyE: ['roll', 1] };
const clamp = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
const axisBits = { pitch: 1, roll: 2, yaw: 4, throttle: 8 };
export const AIRCRAFT_CONTROL_DEFAULTS = Object.freeze({ preset: 'flight', lateral: 'roll', invertPitch: false, pitchSensitivity: 1, rollSensitivity: 1, yawSensitivity: 1, precisionAuthority: .4, deadzone: .07, curve: 1, throttleRate: .3, inputRiseTime: .16, inputReturnTime: .1 });
const controlLimits = { pitchSensitivity: [.2, 2], rollSensitivity: [.2, 2], yawSensitivity: [.2, 2], precisionAuthority: [.1, .8], deadzone: [0, .25], curve: [1, 3], throttleRate: [.05, 1], inputRiseTime: [0, .8], inputReturnTime: [0, .6] };
const trimBindings = { BracketLeft: ['trimPitch', -1], BracketRight: ['trimPitch', 1], Comma: ['trimRoll', -1], Period: ['trimRoll', 1], Semicolon: ['trimYaw', -1], Quote: ['trimYaw', 1] };
const throttleShortcuts = { Digit1: 0, Numpad1: 0, Digit2: .65, Numpad2: .65, Digit3: 1, Numpad3: 1 };
const systemShortcuts = { KeyH: 'ap-hold', KeyJ: 'ap-level', KeyK: 'engine', KeyN: 'parking', KeyT: 'trim-reset', KeyU: 'autothrottle', KeyM: 'reverse', KeyO: 'autobrake', KeyY: 'go-around', Backspace: 'ap-off' };
const settingValue = (settings, key) => Number.isFinite(settings[key]) ? Math.max(controlLimits[key][0], Math.min(controlLimits[key][1], settings[key])) : AIRCRAFT_CONTROL_DEFAULTS[key];

export function aircraftThrottleShortcut(code) {
  return throttleShortcuts[code];
}

export function aircraftSystemShortcut(code) {
  return systemShortcuts[code];
}

export function aircraftKeyBinding(code, preset = 'flight', lateral = 'roll') {
  if (lateral === 'yaw' && Object.hasOwn(yawKeys, code)) return yawKeys[code];
  return (presets[preset] ?? presets.flight)[code];
}

export function aircraftTrimBinding(code) { return trimBindings[code]; }

export function aircraftTrimInput(held, input = {}) {
  input.trimPitch = 0; input.trimRoll = 0; input.trimYaw = 0;
  for (const code of held) {
    const binding = aircraftTrimBinding(code);
    if (binding) input[binding[0]] += binding[1];
  }
  return input;
}

export function aircraftPrecisionActive(held, touch = {}) {
  return !!touch.precision || held.has('ShiftLeft') || held.has('ShiftRight');
}

export function aircraftInput(held, touch = {}, settings = {}, input = {}) {
  let negative = 0, positive = 0;
  input.brake = !!touch.brake;
  input.pilotOverride = 0;
  for (const code of held) {
    const binding = aircraftKeyBinding(code, settings.preset, settings.lateral);
    if (!binding) continue;
    const [axis, amount] = binding;
    if (axis === 'brake') input.brake = true;
    else if (amount < 0) negative |= axisBits[axis];
    else positive |= axisBits[axis];
  }
  const deadzone = settingValue(settings, 'deadzone'), curve = settingValue(settings, 'curve');
  const authority = aircraftPrecisionActive(held, touch) ? settingValue(settings, 'precisionAuthority') : 1;
  for (const axis in axisBits) {
    let value = clamp(touch[axis]);
    const bit = axisBits[axis], sensitivity = axis === 'throttle' ? 1 : settingValue(settings, `${axis}Sensitivity`);
    if (axis !== 'throttle') value = Math.abs(value) <= deadzone ? 0 : Math.sign(value) * ((Math.abs(value) - deadzone) / (1 - deadzone)) ** curve;
    const command = clamp((negative & bit ? -1 : Math.min(0, value)) + (positive & bit ? 1 : Math.max(0, value)));
    input[axis] = clamp(command * sensitivity) * (axis === 'throttle' ? 1 : authority);
    if (axis !== 'throttle') input.pilotOverride = Math.max(input.pilotOverride, Math.abs(command));
  }
  input.throttleRate = settingValue(settings, 'throttleRate');
  if (settings.invertPitch && input.pitch) input.pitch *= -1;
  return input;
}

export function aircraftControlHelp(settings = {}) {
  const wasd = settings.preset === 'wasd';
  return { pitch: settings.invertPitch ? wasd ? 'W / S' : '↑ / ↓' : wasd ? 'S / W' : '↓ / ↑', throttle: wasd ? '↑ / ↓' : 'W / S', roll: settings.lateral === 'yaw' ? 'Q / E' : 'A / D', yaw: settings.lateral === 'yaw' ? 'A / D' : 'Q / E' };
}

const approach = (value, target, duration, dt) => duration > 0 ? value + Math.sign(target - value) * Math.min(Math.abs(target - value), dt / duration) : target;

export function smoothAircraftInput(input, target, settings, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return input;
  const rise = settingValue(settings, 'inputRiseTime'), release = settingValue(settings, 'inputReturnTime');
  for (const axis of ['pitch', 'roll', 'yaw']) {
    let value = clamp(input[axis]), command = clamp(target[axis]);
    if (value * command < 0) {
      const toCenter = Math.abs(value) * release;
      value = approach(value, 0, release, dt);
      if (dt > toCenter) value = approach(value, command, rise, dt - toCenter);
    } else value = approach(value, command, command === 0 ? release : rise, dt);
    input[axis] = Math.abs(value - command) < 1e-12 ? command : value;
  }
  input.brake = !!target.brake;input.throttle = clamp(target.throttle);
  input.throttleRate = target.throttleRate;input.pilotOverride = target.pilotOverride;
  return input;
}
