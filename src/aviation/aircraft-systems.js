import { aircraftEnvelope, aircraftAirflow } from './aircraft-envelope.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const axis = value => Number.isFinite(value) ? clamp(value, -1, 1) : 0;
const editable = flight => ['ready', 'running', 'paused'].includes(flight.status);
const radians = Math.PI / 180;
const trimInputs = { pitch: 'trimPitch', roll: 'trimRoll', yaw: 'trimYaw' };
export const SYSTEM_DEFAULTS = Object.freeze({ trimAuthority: .2, trimRate: .08, apResponse: 1, bankLimit: 22, climbRate: 5, overrideThreshold: .2, displayBrightness: 1, speedResponse: 1, reversePower: 1, autoBrakeStrength: 1 });
export const SYSTEM_LIMITS = Object.freeze({ trimAuthority: [.05, .4], trimRate: [.01, .3], apResponse: [.25, 2], bankLimit: [5, 35], climbRate: [1, 15], overrideThreshold: [.05, .6], displayBrightness: [.2, 1.2], speedResponse: [.25, 2], reversePower: [.25, 1.5], autoBrakeStrength: [.25, 1.5] });
export const AUTOBRAKE_MODES = Object.freeze(['off', 'low', 'high']);
export const AIRCRAFT_SYSTEM_SWITCHES = Object.freeze({
  battery: { key: 'batteryOn', label: 'BAT', name: '电池母线' },
  generator: { key: 'generatorOn', label: 'GEN', name: '发动机发电机' },
  apu: { key: 'apuOn', label: 'APU', name: '辅助动力' },
  avionics: { key: 'avionicsOn', label: 'AVIONICS', name: '航电主开关' },
  'yaw-damper': { key: 'yawDamper', label: 'Y/DAMP', name: '偏航阻尼' },
  'spoiler-arm': { key: 'spoilerArmed', label: 'SPLR ARM', name: '扰流板预位' },
  'nav-lights': { key: 'navLights', label: 'NAV', name: '航行灯', lighting: true },
  'beacon-lights': { key: 'beaconLights', label: 'BEACON', name: '防撞灯', lighting: true },
  'landing-lights': { key: 'landingLights', label: 'LAND', name: '着陆灯', lighting: true },
  'taxi-lights': { key: 'taxiLights', label: 'TAXI', name: '滑行灯', lighting: true },
});

export function createAircraftSystems(settings) {
  return { engineOn: true, batteryOn: true, generatorOn: true, apuOn: false, apuRpm: 0, avionicsOn: true, yawDamper: false, spoilerArmed: false, navLights: true, beaconLights: true, landingLights: false, taxiLights: false, parkingBrake: false, reverse: false, autoBrake: 'off', autoBrakeActive: false, autothrottle: { enabled: false, target: 0, integral: 0, reason: '' }, trim: { pitch: 0, roll: 0, yaw: 0 }, settings: { ...SYSTEM_DEFAULTS, ...settings }, autopilot: { mode: 'off', heading: 0, altitude: 1000, reason: '' }, controls: { pitch: 0, roll: 0, yaw: 0, brake: false, wheelBrake: 0 } };
}

export function aircraftElectrical(flight) {
  const systems = flight.systems;
  const apuReady = systems.apuOn && systems.apuRpm >= .95;
  const generatorOnline = systems.engineOn && systems.generatorOn;
  const powered = systems.batteryOn || generatorOnline || apuReady;
  return { powered, avionics: powered && systems.avionicsOn, apuReady, generatorOnline };
}

export function aircraftSystemAvailability(flight, action) {
  if (!editable(flight) || !Object.hasOwn(AIRCRAFT_SYSTEM_SWITCHES, action)) return 'status';
  const control = AIRCRAFT_SYSTEM_SWITCHES[action];
  if (flight.systems[control.key]) return '';
  if (action === 'apu' && flight.aircraft.cockpit !== 'airliner' && flight.aircraft.id !== 'b62') return 'aircraft';
  const power = aircraftElectrical(flight);
  return action === 'apu' || action === 'spoiler-arm' ? power.powered ? '' : 'power' : action === 'yaw-damper' && !power.avionics ? 'avionics' : '';
}

export function toggleAircraftSystem(flight, action) {
  if (aircraftSystemAvailability(flight, action)) return false;
  const key = AIRCRAFT_SYSTEM_SWITCHES[action].key;
  flight.systems[key] = !flight.systems[key];return true;
}

export function updateAircraftElectrical(flight, dt) {
  if (!['ready', 'running'].includes(flight.status) || !Number.isFinite(dt) || dt <= 0) return;
  const systems = flight.systems;
  if (systems.apuOn && !aircraftElectrical(flight).powered) systems.apuOn = false;
  const target = Number(systems.apuOn);
  systems.apuRpm += (target - systems.apuRpm) * (1 - Math.exp(-.6 * Math.min(dt, .25)));
  if (Math.abs(target - systems.apuRpm) < .001) systems.apuRpm = target;
}

export function engineStartAvailability(flight) {
  if (!editable(flight)) return 'status';
  const power = aircraftElectrical(flight);
  return !power.powered ? 'power' : flight.onGround && flight.aircraft.cockpit === 'airliner' && !power.apuReady ? 'apu' : '';
}

export function restoreAircraftPreflight(flight, previous) {
  for (const key of ['engineOn', 'parkingBrake', 'reverse', 'autoBrake', 'apuRpm', ...Object.values(AIRCRAFT_SYSTEM_SWITCHES).map(control => control.key)]) flight.systems[key] = previous.systems[key];
  flight.throttle = previous.throttle;Object.assign(flight.systems.trim, previous.systems.trim);
}

export function reverseThrustAvailability(flight) {
  return !editable(flight) ? 'status' : !flight.aircraft.reverseThrust ? 'aircraft' : !flight.onGround ? 'ground' : !flight.systems.engineOn ? 'engine' : '';
}

export function toggleReverseThrust(flight) {
  if (!editable(flight) || (!flight.systems.reverse && reverseThrustAvailability(flight))) return false;
  flight.systems.reverse = !flight.systems.reverse;return true;
}

export function setAutobrake(flight, mode) {
  if (!editable(flight) || !AUTOBRAKE_MODES.includes(mode)) return false;
  flight.systems.autoBrake = mode;flight.systems.autoBrakeActive = false;return true;
}

export function autothrottleAvailability(flight) {
  const envelope = aircraftEnvelope(flight), minimum = envelope.stall * 1.3, maximum = envelope.maxSpeed;
  const reason = !editable(flight) ? 'status' : flight.onGround ? 'ground' : !aircraftElectrical(flight).avionics ? 'electrical' : !flight.systems.engineOn ? 'engine' : flight.performance.acceleration <= .01 ? 'power' : minimum > maximum ? 'envelope' : flight.speedBrake ? 'brake' : flight.speed < envelope.stall * 1.1 ? 'stall' : aircraftAirflow(flight).highAngle ? 'aoa' : '';
  return { reason, minimum, maximum };
}

export function setAutothrottle(flight, enabled) {
  if (!editable(flight) || typeof enabled !== 'boolean' || (enabled && autothrottleAvailability(flight).reason)) return false;
  const control = flight.systems.autothrottle;
  if (enabled) {
    const { minimum, maximum } = autothrottleAvailability(flight);
    control.target = clamp(flight.speed, minimum, maximum);control.integral = 0;
  }
  control.enabled = enabled;control.reason = '';return true;
}

export function setAutothrottleTarget(flight, value) {
  if (!editable(flight) || !Number.isFinite(value)) return false;
  const { minimum, maximum } = autothrottleAvailability(flight);
  if (minimum > maximum) return false;
  flight.systems.autothrottle.target = clamp(value, minimum, maximum);return true;
}

function disconnectAutothrottle(flight, reason) {
  if (!flight.systems.autothrottle.enabled) return;
  flight.systems.autothrottle.enabled = false;flight.systems.autothrottle.reason = reason;flight.events.push('at-disconnect');
}

export function setAircraftThrottle(flight, value) {
  if (flight.status !== 'running' || !Number.isFinite(value)) return false;
  disconnectAutothrottle(flight, 'manual');flight.throttle = clamp(value, 0, 1);return true;
}

export function commandGoAround(flight) {
  if (!editable(flight) || !flight.systems.engineOn) return false;
  setAutopilot(flight, 'off');setAutothrottle(flight, false);setAutobrake(flight, 'off');
  flight.systems.reverse = false;flight.systems.spoilerArmed = false;flight.speedBrake = false;flight.throttle = 1;return true;
}

export function deployArmedSpoilers(flight) {
  if (flight.onGround && flight.hasFlown && flight.systems.spoilerArmed && flight.throttle < .15 && !flight.speedBrake && aircraftElectrical(flight).powered) {
    flight.speedBrake = true;flight.events.push('spoilers-deployed');
  }
}

function updatePowerSystems(flight, input, dt) {
  const systems = flight.systems, control = systems.autothrottle;
  deployArmedSpoilers(flight);
  if (!flight.onGround) systems.reverse = false;
  if (input.brake) systems.autoBrake = 'off';
  systems.autoBrakeActive = systems.autoBrake !== 'off' && flight.onGround && flight.hasFlown && flight.speed > 1 && (systems.reverse || (flight.throttle < .15 && axis(input.throttle) <= 0)) && !systems.parkingBrake;
  systems.controls.wheelBrake = systems.controls.brake ? 1 : systems.autoBrakeActive ? Math.min(1, (systems.autoBrake === 'high' ? .8 : .35) * systems.settings.autoBrakeStrength) : 0;
  if (!control.enabled) return;
  const availability = autothrottleAvailability(flight);
  const reason = axis(input.throttle) ? 'manual' : input.brake ? 'brake' : availability.reason;
  if (reason) { disconnectAutothrottle(flight, reason);return; }
  control.target = clamp(control.target, availability.minimum, availability.maximum);
  const error = control.target - flight.speed, response = systems.settings.speedResponse;
  const gravity = 9.81 * flight.physics.gravity * clamp(flight.verticalSpeed / Math.max(1, flight.speed), -1, 1);
  const drag = flight.performance.drag * (1 + flight.gearPosition * .55) * (1 + flight.flaps * .35) * flight.speed ** 2;
  const demand = (drag + gravity) / flight.performance.acceleration + error * .025 * response + control.integral;
  if ((demand > 0 && demand < 1) || (demand >= 1 && error < 0) || (demand <= 0 && error > 0)) control.integral = clamp(control.integral + error * .002 * response * dt, -.3, .3);
  flight.throttle += clamp(clamp(demand, 0, 1) - flight.throttle, -.4 * dt, .4 * dt);
}

export function setSystemSettings(flight, settings = {}) {
  for (const key in SYSTEM_DEFAULTS) {
    const value = settings[key] ?? flight.systems.settings[key];
    flight.systems.settings[key] = Number.isFinite(value) ? clamp(value, ...SYSTEM_LIMITS[key]) : SYSTEM_DEFAULTS[key];
  }
  return flight.systems.settings;
}

export function setAircraftTrim(flight, key, value) {
  if (!editable(flight) || !Object.hasOwn(flight.systems.trim, key) || !Number.isFinite(value)) return false;
  flight.systems.trim[key] = axis(value);return true;
}

export function toggleEngine(flight) {
  if (!editable(flight) || (!flight.systems.engineOn && engineStartAvailability(flight))) return false;
  flight.systems.engineOn = !flight.systems.engineOn;return true;
}

export function toggleParkingBrake(flight) {
  if (!editable(flight) || !flight.onGround || (!flight.systems.parkingBrake && flight.speed >= 1)) return false;
  flight.systems.parkingBrake = !flight.systems.parkingBrake;return true;
}

export function autopilotAvailability(flight) {
  const minimumSpeed = aircraftEnvelope(flight).stall * 1.15;
  const reason = !editable(flight) ? 'status' : flight.onGround ? 'ground' : flight.physics.mode !== 'assisted' ? 'mode' : !aircraftElectrical(flight).avionics ? 'electrical' : !flight.systems.engineOn ? 'engine' : flight.speed < minimumSpeed ? 'stall' : Math.abs(flight.roll) > Math.PI / 3 || Math.abs(flight.pitch) > .45 ? 'attitude' : aircraftAirflow(flight).highAngle ? 'aoa' : '';
  return { reason, minimumSpeed };
}

export function setAutopilot(flight, mode) {
  if (!editable(flight) || !['off', 'level', 'hold'].includes(mode)) return false;
  const autopilot = flight.systems.autopilot;
  if (mode !== 'off' && autopilotAvailability(flight).reason) return false;
  if (mode !== 'off') { autopilot.heading = flight.heading;autopilot.altitude = flight.y; }
  autopilot.mode = mode;autopilot.reason = '';return true;
}

export function setAutopilotTarget(flight, key, value) {
  if (!editable(flight) || !Number.isFinite(value)) return false;
  if (key === 'heading') flight.systems.autopilot.heading = ((value % 360 + 360) % 360) * radians;
  else if (key === 'altitude') flight.systems.autopilot.altitude = Math.max(0, value);
  else return false;
  return true;
}

export function updateAircraftSystems(flight, input, dt, stall) {
  updateAircraftElectrical(flight, dt);
  const { trim, settings, autopilot, controls } = flight.systems;
  for (const key in trim) {
    trim[key] = axis(trim[key] + axis(input[trimInputs[key]]) * settings.trimRate * dt);
    controls[key] = axis(axis(input[key]) + trim[key] * settings.trimAuthority);
  }
  controls.brake = !!input.brake || flight.systems.parkingBrake;
  updatePowerSystems(flight, input, dt);
  if (autopilot.mode === 'off') return controls;
  const override = Number.isFinite(input.pilotOverride) ? Math.abs(axis(input.pilotOverride)) : Math.max(Math.abs(axis(input.pitch)), Math.abs(axis(input.roll)), Math.abs(axis(input.yaw)));
  const reason = flight.onGround ? 'ground' : flight.physics.mode !== 'assisted' ? 'mode' : !aircraftElectrical(flight).avionics ? 'electrical' : !flight.systems.engineOn ? 'engine' : flight.speed < stall * 1.1 ? 'stall' : Math.abs(flight.roll) > Math.PI / 3 || Math.abs(flight.pitch) > .55 ? 'attitude' : aircraftAirflow(flight).highAngle ? 'aoa' : override >= settings.overrideThreshold ? 'manual' : '';
  if (reason) {
    autopilot.mode = 'off';autopilot.reason = reason;flight.events.push('ap-disconnect');return controls;
  }
  controls.roll = 0;
  if (autopilot.mode === 'hold') {
    const error = Math.atan2(Math.sin(autopilot.heading - flight.heading), Math.cos(autopilot.heading - flight.heading));
    const bank = clamp(error * 1.6 * settings.apResponse, -settings.bankLimit * radians, settings.bankLimit * radians);
    controls.roll = clamp(bank / flight.performance.bankLimit, -.9, .9);
    const vertical = clamp((autopilot.altitude - flight.y) * .04 * settings.apResponse, -settings.climbRate, settings.climbRate);
    const compensation = 9.81 * flight.physics.gravity * (1 - Math.cos(flight.roll)) / flight.performance.flightPath;
    const pitch = Math.asin(clamp((vertical + (vertical - flight.verticalSpeed) * .4 + compensation) / Math.max(1, flight.speed), -.2, .2));
    controls.pitch = clamp((pitch - .018) / flight.performance.pitchLimit, -.8, .8);
    controls.yaw = 0;
  }
  return controls;
}
