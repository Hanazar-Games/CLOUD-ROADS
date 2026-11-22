import { AIRPORTS, airportSurfaceHeight } from './airport.js';
import { Euler, Quaternion, Vector3 } from 'three';
import { createAircraftSystems, setSystemSettings, updateAircraftSystems, aircraftElectrical, deployArmedSpoilers } from './aircraft-systems.js';
import { bankLoad, aircraftAirflow, aircraftDensity, equivalentAirspeed, availableAcceleration } from './aircraft-envelope.js';
import { aircraftAimControls } from './aircraft-aim.js';
export { aircraftEnvelope } from './aircraft-envelope.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const axis = value => Number.isFinite(value) ? clamp(value, -1, 1) : 0;
const pose = new Quaternion(), rotation = new Quaternion(), angles = new Euler(0, 0, 0, 'YXZ');
const angular = new Vector3(), forward = new Vector3(), up = new Vector3(), right = new Vector3(), from = new Vector3();
const flow = { angle: 0, highAngle: false, separation: 0 };
export const AIRCRAFT_STEP = 1 / 120;
export const AIRCRAFT_PHYSICS_DEFAULTS = Object.freeze({ mode: 'assisted', pitchRate: 1, rollRate: 1, yawRate: 1, response: 1, stability: 1, gravity: 1, thrust: 1, engineResponse: 1, mass: 1, drag: 1, lift: 1, maxSpeed: 1, airBrake: 1, wheelBrake: 1, pitchLimit: 1, bankLimit: 1, flightPath: 1, lateralResponse: 1, stallAngle: 1, inducedDrag: 1, loadLimit: 1,
  negativeStall: 1, stallLiftLoss: .85, stallAuthority: .75, stallRecovery: 1, stallDrag: 1, airDensity: 0, thrustLapse: .65 });
export const AIRCRAFT_PHYSICS_LIMITS = Object.freeze({ pitchRate: [.2, 3], rollRate: [.2, 3], yawRate: [.2, 3], response: [.25, 3], stability: [0, 1], gravity: [.5, 1.5], thrust: [0, 3], engineResponse: [.25, 3], mass: [.5, 2], drag: [.25, 2], lift: [.5, 1.75], maxSpeed: [.5, 2], airBrake: [.25, 2], wheelBrake: [.5, 2], pitchLimit: [.4, 1.5], bankLimit: [.4, 1.25], flightPath: [.4, 1.8], lateralResponse: [.25, 3], stallAngle: [.6, 1.6], inducedDrag: [.25, 3], loadLimit: [.5, 1.5],
  negativeStall: [.6, 1.5], stallLiftLoss: [.4, .98], stallAuthority: [.25, 1], stallRecovery: [.25, 3], stallDrag: [.25, 3], airDensity: [0, 1], thrustLapse: [0, 1] });
export const AIRCRAFT_PRESETS = Object.freeze([
  { id: 'standard', name: '恢复标准', physics: {} },
  { id: 'agile', name: '灵活机动', physics: { mode: 'maneuver', pitchRate: 1.65, rollRate: 1.8, yawRate: 1.3, response: 1.5, stability: .12, thrust: 1.1, mass: .85, flightPath: 1.25 } },
  { id: 'power', name: '极速动力', physics: { thrust: 2.2, maxSpeed: 1.4, drag: .75, flightPath: 1.1 } },
  { id: 'cruise', name: '轻松巡航', physics: { thrust: .85, drag: .6, lift: 1.25, response: .8 } },
  { id: 'altitude', name: '高空气动', physics: { airDensity: 1 } },
].map(preset => Object.freeze({ ...preset, physics: Object.freeze({ ...AIRCRAFT_PHYSICS_DEFAULTS, ...preset.physics }) })));

export function setAircraftPhysics(flight, settings = {}) {
  const physics = { ...AIRCRAFT_PHYSICS_DEFAULTS, ...flight.physics, ...settings };
  if (!['assisted', 'limited', 'maneuver'].includes(physics.mode)) physics.mode = 'assisted';
  for (const key of Object.keys(AIRCRAFT_PHYSICS_LIMITS)) {
    const [low, high] = AIRCRAFT_PHYSICS_LIMITS[key];
    physics[key] = Number.isFinite(physics[key]) ? clamp(physics[key], low, high) : AIRCRAFT_PHYSICS_DEFAULTS[key];
  }
  flight.physics = physics;
  const aircraft = flight.aircraft, liftScale = Math.sqrt(physics.mass * physics.gravity / physics.lift);
  const stallAngle = (aircraft.cockpit === 'fighter' ? .42 : aircraft.cockpit === 'light' ? .3 : .26) * physics.stallAngle;
  flight.performance = {
    acceleration: aircraft.acceleration * physics.thrust / physics.mass, engineResponse: aircraft.engineResponse * physics.engineResponse, drag: aircraft.drag * physics.drag / physics.mass,
    stall: aircraft.stall * liftScale, takeoff: aircraft.takeoff * liftScale, landingSpeed: aircraft.landingSpeed * liftScale,
    maxSpeed: aircraft.maxSpeed * physics.maxSpeed, response: aircraft.response * physics.response / physics.mass,
    pitchLimit: aircraft.pitchLimit * physics.pitchLimit, bankLimit: aircraft.bankLimit * physics.bankLimit,
    flightPath: .8 * physics.flightPath / physics.mass, lateralResponse: aircraft.response * physics.lateralResponse / physics.mass,
    airBrake: 7 * physics.airBrake / physics.mass, wheelBrake: 18 * physics.wheelBrake / physics.mass,
    stallAngle, negativeStallAngle: stallAngle * .85 * physics.negativeStall,
    loadLimit: (aircraft.cockpit === 'fighter' ? 9 : aircraft.cockpit === 'light' ? 6 : aircraft.cockpit === 'airliner' ? 2.5 : 3.5) * physics.loadLimit,
  };
  return physics;
}

export const AIRCRAFT = Object.freeze([
  Object.freeze({ id: 'a380', engineType: 'jet', name: 'Airbus A380', subtitle: '新加坡航空 · 四发远程客机', role: '稳定巡航', configuration: '四发客机', cockpit: 'airliner', engines: 4, engineResponse: .65, reverseThrust: .35, turnDrag: 1.4, cruiseSpeed: 135, length: 72.7, span: 79.8, gearHeight: 8.2, takeoff: 78, stall: 65, flapLimit: 135, maxSpeed: 285, landingSpeed: 105, acceleration: 4.8, drag: .000045, pitchLimit: .38, bankLimit: .8, pitchRate: .22, rollRate: .48, response: 1.7, yawRate: .06, sinkLimit: 7 }),
  Object.freeze({ id: 'su30', engineType: 'fighter', name: 'Su-30', subtitle: '双发双座 · 原创低多边形模型', role: '高速机动', configuration: '双发战斗机', cockpit: 'fighter', engines: 2, engineResponse: 1.4, turnDrag: 1.8, cruiseSpeed: 220, length: 21.9, span: 14.7, gearHeight: 2.7, takeoff: 65, stall: 53, flapLimit: 165, maxSpeed: 650, landingSpeed: 135, acceleration: 16, drag: .000036, pitchLimit: .65, bankLimit: 1.18, pitchRate: .85, rollRate: 1.8, response: 2.9, yawRate: .16, sinkLimit: 10 }),
  Object.freeze({ id: 't6', engineType: 'propeller', name: '星雀 T-6', subtitle: '原创低翼教练机 · 轻巧慢飞', role: '入门练习', configuration: '单发螺旋桨', cockpit: 'light', engines: 1, engineResponse: 2.7, turnDrag: 1.1, cruiseSpeed: 52, length: 9.2, span: 11.8, gearHeight: 1.65, takeoff: 33, stall: 25, flapLimit: 55, maxSpeed: 105, landingSpeed: 48, acceleration: 3.9, drag: .0002, pitchLimit: .45, bankLimit: .9, pitchRate: .55, rollRate: 1.2, response: 2.8, yawRate: .2, sinkLimit: 5 }),
  Object.freeze({ id: 'b62', engineType: 'jet', name: '云帆 B-62', subtitle: '原创公务机 · 后置双发与翼梢小翼', role: '高速巡航', configuration: '双发公务机', cockpit: 'transport', engines: 2, engineResponse: 1.1, reverseThrust: .3, turnDrag: 1.5, cruiseSpeed: 140, length: 20.4, span: 21.1, gearHeight: 2.35, takeoff: 55, stall: 44, flapLimit: 110, maxSpeed: 285, landingSpeed: 82, acceleration: 8.5, drag: .00007, pitchLimit: .45, bankLimit: .95, pitchRate: .4, rollRate: .85, response: 2.2, yawRate: .1, sinkLimit: 6 }),
  Object.freeze({ id: 'c24', engineType: 'turboprop', name: '山海 C-24', subtitle: '原创运输机 · 高翼双涡桨与后货舱', role: '低空运输', configuration: '双发涡桨', cockpit: 'transport', engines: 2, engineResponse: 1.7, reverseThrust: .4, turnDrag: 1.6, cruiseSpeed: 90, length: 25.6, span: 29.2, gearHeight: 3.4, takeoff: 44, stall: 36, flapLimit: 85, maxSpeed: 175, landingSpeed: 70, acceleration: 6.2, drag: .0001, pitchLimit: .4, bankLimit: .8, pitchRate: .3, rollRate: .65, response: 1.9, yawRate: .09, sinkLimit: 6 }),
  Object.freeze({ id: 'd9', engineType: 'fighter', name: '岚影 D-9', subtitle: '原创三角翼战机 · 单发与前翼', role: '敏捷截击', configuration: '单发战斗机', cockpit: 'fighter', engines: 1, engineResponse: 1.8, turnDrag: 2.1, cruiseSpeed: 240, length: 15.6, span: 9.6, gearHeight: 2.2, takeoff: 62, stall: 50, flapLimit: 150, maxSpeed: 720, landingSpeed: 120, acceleration: 20, drag: .000035, pitchLimit: .7, bankLimit: 1.2, pitchRate: 1.05, rollRate: 2.1, response: 3.2, yawRate: .19, sinkLimit: 9 }),
  Object.freeze({ id: 'r220', engineType: 'jet', name: '云雀 R-220', subtitle: '原创窄体客机 · 双发短途与上扬翼梢', role: '短途客运', configuration: '双发窄体客机', cockpit: 'airliner', engines: 2, engineResponse: .95, reverseThrust: .32, turnDrag: 1.35, cruiseSpeed: 125, length: 38.7, span: 35.1, gearHeight: 4.1, takeoff: 60, stall: 47, flapLimit: 118, maxSpeed: 265, landingSpeed: 88, acceleration: 6.8, drag: .000055, pitchLimit: .4, bankLimit: .85, pitchRate: .3, rollRate: .65, response: 2.05, yawRate: .08, sinkLimit: 6 }),
  Object.freeze({ id: 'w350', engineType: 'jet', name: '远星 W-350', subtitle: '原创宽体客机 · 长航程与柔弯翼梢', role: '远程客运', configuration: '双发宽体客机', cockpit: 'airliner', engines: 2, engineResponse: .72, reverseThrust: .36, turnDrag: 1.45, cruiseSpeed: 145, length: 64.8, span: 60.1, gearHeight: 6.3, takeoff: 73, stall: 59, flapLimit: 130, maxSpeed: 295, landingSpeed: 98, acceleration: 5.5, drag: .000043, pitchLimit: .38, bankLimit: .8, pitchRate: .24, rollRate: .52, response: 1.8, yawRate: .065, sinkLimit: 7 }),
  Object.freeze({ id: 'p72', engineType: 'turboprop', name: '海燕 P-72', subtitle: '原创支线客机 · 高翼双涡桨与 T 形尾翼', role: '海岛通勤', configuration: '双发涡桨客机', cockpit: 'airliner', engines: 2, engineResponse: 1.9, reverseThrust: .38, turnDrag: 1.4, cruiseSpeed: 92, length: 27.2, span: 27.6, gearHeight: 3.2, takeoff: 42, stall: 33, flapLimit: 88, maxSpeed: 165, landingSpeed: 64, acceleration: 5.7, drag: .00011, pitchLimit: .42, bankLimit: .82, pitchRate: .35, rollRate: .75, response: 2.1, yawRate: .11, sinkLimit: 6 }),
  Object.freeze({ id: 'f26', engineType: 'fighter', name: '夜隼 F-26', subtitle: '原创双发战机 · 折线机翼与外倾双垂尾', role: '高速巡弋', configuration: '双发战斗机', cockpit: 'fighter', engines: 2, engineResponse: 1.55, turnDrag: 1.9, cruiseSpeed: 230, length: 19.4, span: 13.6, gearHeight: 2.6, takeoff: 64, stall: 51, flapLimit: 160, maxSpeed: 690, landingSpeed: 128, acceleration: 18, drag: .000037, pitchLimit: .68, bankLimit: 1.2, pitchRate: .95, rollRate: 1.95, response: 3, yawRate: .17, sinkLimit: 9 }),
  Object.freeze({ id: 'j90', engineType: 'jet', name: '银燕 J-90', subtitle: '原创支线喷气客机 · 后置双发与修长机身', role: '山地客运', configuration: '后置双发客机', cockpit: 'airliner', engines: 2, engineResponse: 1.05, reverseThrust: .32, turnDrag: 1.35, cruiseSpeed: 115, length: 35.8, span: 29.4, gearHeight: 3.6, takeoff: 55, stall: 43, flapLimit: 110, maxSpeed: 250, landingSpeed: 82, acceleration: 7.1, drag: .00006, pitchLimit: .42, bankLimit: .85, pitchRate: .33, rollRate: .7, response: 2.15, yawRate: .09, sinkLimit: 6 }),
  Object.freeze({ id: 'l440', engineType: 'jet', name: '天穹 L-440', subtitle: '原创四发宽体客机 · 四具涡扇与多轴主轮', role: '洲际客运', configuration: '四发宽体客机', cockpit: 'airliner', engines: 4, engineResponse: .68, reverseThrust: .38, turnDrag: 1.45, cruiseSpeed: 142, length: 72, span: 68.5, gearHeight: 7, takeoff: 76, stall: 62, flapLimit: 134, maxSpeed: 290, landingSpeed: 102, acceleration: 5.2, drag: .000044, pitchLimit: .38, bankLimit: .8, pitchRate: .23, rollRate: .5, response: 1.75, yawRate: .06, sinkLimit: 7 }),
]);

export const AIR_GATES = AIRPORTS[0].gates;

export function createAircraftFlight(id = 'a380', airborne = false, { runwayDirection = '36', runwayIndex = 0, airport = 'coast', departure = 'runway', physics, systems } = {}) {
  const aircraft = AIRCRAFT.find(item => item.id === id) ?? AIRCRAFT[0];
  const site = typeof airport === 'object' ? airport : AIRPORTS.find(item => item.id === airport) ?? AIRPORTS[0];
  runwayIndex = Number.isInteger(runwayIndex) && site.runways[runwayIndex] ? runwayIndex : 0;
  const RUNWAY = site.runways[runwayIndex];
  const south = runwayDirection === '18';
  const flight = {
    aircraft, airport: site, runwayIndex, status: airborne ? 'running' : 'ready', x: RUNWAY.x, y: site.elevation + (airborne ? 420 : aircraft.gearHeight + RUNWAY.surfaceHeight), z: airborne ? RUNWAY.center : south ? RUNWAY.end + 180 : RUNWAY.start - 180,
    heading: south ? Math.PI : 0, trackHeading: south ? Math.PI : 0, trackTurnRate: 0, sideslip: 0, pitch: 0, roll: 0, speed: 0,
    verticalSpeed: 0, throttle: airborne ? .65 : 0, engineOutput: airborne ? .65 : 0, gearDown: !airborne, gearPosition: airborne ? 0 : 1, onGround: !airborne,
    flaps: 0, speedBrake: false, runwayDirection: south ? '18' : '36',
    hasFlown: airborne, stalling: false, elapsed: 0, distance: 0, gates: 0, events: [], reason: '', touchdownSpeed: 0,
    pitchRate: 0, rollRate: 0, yawRate: 0, angleOfAttack: 0, flowSeparation: 0, stallType: '', loadFactor: airborne ? 1 : 0,
    systems: createAircraftSystems(systems),
  };
  setAircraftPhysics(flight, physics);
  setSystemSettings(flight);
  if (!airborne && departure === 'apron') {
    flight.x = -265 * site.side; flight.z = -295 + site.offsetZ;
    flight.heading = flight.trackHeading = site.side * Math.PI / 2;
    flight.y = airportSurfaceHeight(flight.x, flight.z, site) + aircraft.gearHeight;
    flight.systems.parkingBrake = true;
  }
  const airspeedScale = Math.sqrt(aircraftDensity(flight));
  if (airborne) flight.speed = Math.min(flight.performance.maxSpeed * .85, Math.max(aircraft.cruiseSpeed, flight.performance.stall * 1.4) / airspeedScale);
  flight.systems.autothrottle.target = Math.min(flight.performance.maxSpeed * airspeedScale, Math.max(aircraft.cruiseSpeed, flight.performance.stall * 1.3));
  return flight;
}

export function setAircraftFlaps(flight, level) {
  if (!['ready', 'running', 'paused'].includes(flight.status) || !Number.isInteger(level) || level < 0 || level > 2 || (level > 0 && equivalentAirspeed(flight) > flight.aircraft.flapLimit)) return false;
  flight.flaps = level;
  return true;
}

export function toggleAircraftSpeedBrake(flight) {
  if (!['running', 'paused'].includes(flight.status)) return false;
  flight.speedBrake = !flight.speedBrake;
  return true;
}

export function toggleAircraftGear(flight) {
  if (!['running', 'paused'].includes(flight.status) || flight.onGround) return false;
  flight.gearDown = !flight.gearDown;
  return true;
}

export function toggleAircraftPause(flight) {
  if (flight.status === 'running') flight.status = 'paused';
  else if (flight.status === 'paused') flight.status = 'running';
}

export function runwayContact(flight, aircraft) {
  const alignment = Math.abs(Math.sin(flight.heading));
  const extentY = Math.abs(Math.sin(flight.roll) * Math.cos(flight.pitch)) * aircraft.span * .42 + Math.abs(Math.sin(flight.pitch)) * aircraft.length * .35 + Math.abs(Math.cos(flight.roll) * Math.cos(flight.pitch)) * aircraft.gearHeight * .45;
  return flight.gearDown && flight.gearPosition >= .999 && flight.airport.runways.some(runway => Math.abs(flight.x - runway.x) < runway.width / 2 - aircraft.span * .12
    && flight.z > runway.end && flight.z < runway.start) && alignment < .28
    && Math.abs(Math.sin(flight.trackHeading)) < .28 && Math.cos(flight.trackHeading - flight.heading) > .98
    && Math.abs(flight.roll) < .2 && flight.pitch > -.12 && flight.pitch < .3
    && equivalentAirspeed(flight) <= flight.performance.landingSpeed && flight.verticalSpeed >= -aircraft.sinkLimit && extentY <= aircraft.gearHeight + .2;
}

export function crossesAirGate(from, to, gate) {
  const before = (from.x - gate.x) * gate.normal[0] + (from.y - gate.y) * gate.normal[1] + (from.z - gate.z) * gate.normal[2];
  const after = (to.x - gate.x) * gate.normal[0] + (to.y - gate.y) * gate.normal[1] + (to.z - gate.z) * gate.normal[2];
  if (before === after || before * after > 0) return false;
  const fraction = before / (before - after);
  if (fraction < 0 || fraction > 1) return false;
  return Math.hypot(from.x + (to.x - from.x) * fraction - gate.x, from.y + (to.y - from.y) * fraction - gate.y, from.z + (to.z - from.z) * fraction - gate.z) < gate.radius - 12;
}

export function recoverAircraftFlight(flight, reason = '已恢复安全高度，可继续自由飞行。') {
  const site = flight.airport, aircraft = flight.aircraft;
  let floor = airportSurfaceHeight(flight.x, flight.z, site);
  for (const building of site.buildings) if (Math.abs(flight.x - building.x) < building.width / 2 + aircraft.span
    && Math.abs(flight.z - building.z) < building.depth / 2 + aircraft.length) floor = Math.max(floor, site.elevation + building.height);
  Object.assign(flight, { y: floor + Math.max(250, aircraft.length * 2), pitch: .04, roll: 0, pitchRate: 0, rollRate: 0, yawRate: 0,
    verticalSpeed: 0, trackHeading: flight.heading, trackTurnRate: 0, sideslip: 0, angleOfAttack: .04, loadFactor: 1, onGround: false,
    hasFlown: true, stalling: false, stallType: '', flowSeparation: 0,
    throttle: .7, engineOutput: .7, speedBrake: false, status: 'running' });
  flight.speed = Math.min(flight.performance.maxSpeed, Math.max(aircraft.cruiseSpeed, flight.performance.stall * 1.5) / Math.sqrt(aircraftDensity(flight)));
  const systems = flight.systems;
  systems.autopilot.mode = 'off'; systems.autopilot.reason = 'recovery';
  systems.autothrottle.enabled = false; systems.autothrottle.reason = 'recovery'; systems.autoBrakeActive = false;
  systems.trim.pitch = systems.trim.roll = systems.trim.yaw = 0;
  systems.reverse = false; systems.parkingBrake = false;
  systems.engineOn = true; systems.batteryOn = true; systems.generatorOn = true;
  flight.reason = reason;
  flight.events.push('recovery');
}

function limitAttitudeRate(angle, rate, limit, maxRate, dt) {
  // On a mode change outside the envelope, recover at the available angular rate.
  const error = angle - clamp(angle, -limit, limit);
  if (error > 0) rate = Math.min(rate, -Math.min(maxRate, error * 3));
  if (error < 0) rate = Math.max(rate, Math.min(maxRate, -error * 3));
  return clamp(rate, (Math.min(angle, -limit) - angle) / dt, (Math.max(angle, limit) - angle) / dt);
}

function stepFlight(flight, input, dt) {
  const aircraft = flight.aircraft, physics = flight.physics, performance = flight.performance, gravity = 9.81 * physics.gravity;
  const density = aircraftDensity(flight), airspeedScale = Math.sqrt(density), airspeed = flight.speed * airspeedScale;
  const previousTrack = flight.trackHeading;
  const site = flight.airport;
  const gearTarget = flight.gearDown ? 1 : 0, gearStep = dt / (aircraft.cockpit === 'airliner' ? 7 : 4);
  const previousGear = flight.gearPosition;
  flight.gearPosition += clamp(gearTarget - flight.gearPosition, -gearStep, gearStep);
  if (previousGear !== gearTarget && flight.gearPosition === gearTarget) flight.events.push(gearTarget ? 'gear-locked' : 'gear-retracted');
  from.set(flight.x, flight.y, flight.z);
  flight.elapsed += dt;
  if (flight.flaps && airspeed > aircraft.flapLimit + 5) { flight.flaps = 0; flight.events.push('flaps-limit'); }
  const baseStall = performance.stall * (1 - flight.flaps * .1), takeoff = performance.takeoff * (1 - flight.flaps * .07);
  let stall = baseStall * Math.sqrt(bankLoad(flight));
  const aim = input.aim && !axis(input.pitch) && !axis(input.roll) && !axis(input.yaw) ? aircraftAimControls(flight, input.aim, baseStall, gravity, density, airspeed) : null;
  const controls = updateAircraftSystems(flight, input, dt, stall, aim?.override, density);
  const aiming = aim && flight.systems.autopilot.mode === 'off';
  if (aiming) {
    controls.pitch = axis(controls.pitch + aim.pitch);
    controls.roll = axis(controls.roll + aim.roll);
    controls.yaw = axis(controls.yaw + aim.yaw);
  } else if (!flight.onGround && flight.systems.yawDamper && aircraftElectrical(flight).avionics) {
    controls.yaw = axis(controls.yaw - clamp(flight.sideslip * 3, -.7, .7) * (1 - Math.abs(axis(input.yaw))));
  }
  const throttleRate = Number.isFinite(input.throttleRate) ? clamp(input.throttleRate, .05, 1) : .3;
  flight.throttle = clamp(flight.throttle + axis(input.throttle) * dt * throttleRate, 0, 1);
  flight.engineOutput += ((flight.systems.engineOn ? flight.throttle : 0) - flight.engineOutput) * (1 - Math.exp(-performance.engineResponse * dt));
  const airflow = aircraftAirflow(flight, flow);
  const authority = clamp((airspeed / stall) ** 2, .03, 1) * (1 - Math.max(airflow.separation, flight.flowSeparation) * (1 - physics.stallAuthority));
  const pitchInput = controls.pitch, rollInput = controls.roll, yawInput = controls.yaw;
  if (flight.onGround) {
    const rotationAuthority = clamp((airspeed / takeoff) ** 2, 0, 1);
    flight.pitch += (pitchInput * performance.pitchLimit * rotationAuthority - flight.pitch) * (1 - Math.exp(-performance.response * dt));
    flight.pitch = clamp(flight.pitch, -.02, .13); flight.roll = 0;
    flight.pitchRate = 0; flight.rollRate = 0; flight.yawRate = 0;
  } else {
    const maneuver = physics.mode !== 'assisted' && !aiming;
    const pitchLimit = aircraft.pitchRate * physics.pitchRate * authority;
    const rollLimit = aircraft.rollRate * physics.rollRate * authority;
    let pitchTarget = maneuver ? pitchInput * pitchLimit - (1 - Math.abs(pitchInput)) * flight.pitch * physics.stability : (pitchInput * performance.pitchLimit + .018 - flight.pitch) * aircraft.response * (aiming || pitchInput || flight.systems.autopilot.mode === 'hold' ? 1 : physics.stability);
    pitchTarget -= Math.sin(airflow.angle) * airflow.separation * aircraft.pitchRate * .12;
    const rollTarget = maneuver ? rollInput * rollLimit - (1 - Math.abs(rollInput)) * flight.roll * physics.stability : (rollInput * performance.bankLimit - flight.roll) * aircraft.response * 1.5 * (aiming || rollInput || flight.systems.autopilot.mode !== 'off' ? 1 : physics.stability);
    const response = 1 - Math.exp(-performance.response * 3 * dt);
    flight.pitchRate += (clamp(pitchTarget, -pitchLimit, pitchLimit) - flight.pitchRate) * response;
    flight.rollRate += (clamp(rollTarget, -rollLimit, rollLimit) - flight.rollRate) * response;
    flight.yawRate += (yawInput * aircraft.yawRate * physics.yawRate * authority - flight.yawRate) * response;
    if (physics.mode === 'limited') {
      flight.pitchRate = limitAttitudeRate(flight.pitch, flight.pitchRate, performance.pitchLimit, pitchLimit, dt);
      flight.rollRate = limitAttitudeRate(flight.roll, flight.rollRate, performance.bankLimit, rollLimit, dt);
      flight.pitch += flight.pitchRate * dt;
      flight.roll += flight.rollRate * dt;
      flight.heading += flight.yawRate * dt;
    } else {
      pose.setFromEuler(angles.set(flight.pitch, -flight.heading, -flight.roll));
      angular.set(flight.pitchRate, -flight.yawRate, -flight.rollRate);
      const rate = angular.length();
      if (rate > 1e-10) pose.multiply(rotation.setFromAxisAngle(angular.multiplyScalar(1 / rate), rate * dt));
      angles.setFromQuaternion(pose);
      flight.pitch = angles.x; flight.heading = -angles.y; flight.roll = -angles.z;
    }
  }
  const load = bankLoad(flight);
  stall = baseStall * Math.sqrt(load);
  aircraftAirflow(flight, flow);
  const separationRate = flow.separation > flight.flowSeparation ? 16 : 3.5 * physics.stallRecovery;
  flight.flowSeparation = flight.onGround ? 0 : flight.flowSeparation + (flow.separation - flight.flowSeparation) * -Math.expm1(-separationRate * dt);
  const separation = Math.max(flow.separation * .55, flight.flowSeparation);
  const lift = Math.min(1, (airspeed / stall) ** 2);
  const normal = clamp((gravity + flight.speed * density * performance.flightPath * Math.sin(flow.angle)) * lift * (1 - separation * physics.stallLiftLoss), -performance.loadLimit * gravity, performance.loadLimit * gravity);
  const aerodynamicLoad = Math.max(load, Math.abs(normal / gravity));
  const inducedDrag = flight.onGround ? 0 : aircraft.turnDrag * physics.inducedDrag * (
    .35 * (aerodynamicLoad ** 2 - 1) * Math.min(4, (baseStall / Math.max(airspeed, 1)) ** 2)
    + (3 * separation * physics.stallDrag + 1.5 * Math.sin(flight.sideslip) ** 2) * Math.min(4, (airspeed / baseStall) ** 2));
  const drag = performance.drag * (1 + flight.gearPosition * .55) * (1 + flight.flaps * .35 + (flight.speedBrake ? .8 * physics.airBrake : 0)) * airspeed ** 2 + inducedDrag;
  const braking = flight.onGround ? controls.wheelBrake * performance.wheelBrake : (controls.brake || flight.speedBrake ? performance.airBrake * density : 0);
  const bankCos = Math.cos(flight.roll), bankSin = Math.sin(flight.roll);
  const pitchCos = Math.cos(flight.pitch), pitchSin = Math.sin(flight.pitch);
  const verticalAcceleration = normal * bankCos * pitchCos - gravity;
  const pathSine = clamp((flight.verticalSpeed + verticalAcceleration * dt * .5) / Math.max(flight.speed, .01), -1, 1);
  const thrust = availableAcceleration(flight, density) * flight.engineOutput * (flight.systems.reverse ? -aircraft.reverseThrust * flight.systems.settings.reversePower : 1);
  const acceleration = thrust - drag - (flight.onGround ? .45 : gravity * pathSine) - braking;
  const ceiling = Math.max(performance.maxSpeed, flight.speed - Math.min(60, Math.max(0, flight.speed - performance.maxSpeed) * 2) * dt);
  const nextSpeed = flight.onGround && flight.systems.parkingBrake ? 0 : clamp(flight.speed + acceleration * dt, 0, ceiling);
  const speed = (flight.speed + nextSpeed) * .5;
  flight.speed = nextSpeed;
  if (flight.onGround) {
    const steering = clamp(yawInput + rollInput * .75, -1, 1) * .82 / (1 + (speed / 18) ** 2);
    flight.heading += clamp(Math.tan(steering) * speed / Math.max(3, aircraft.length * .3), -.8, .8) * dt;
    if (speed * airspeedScale >= takeoff && flight.pitch > .045 && !controls.brake && !flight.speedBrake && !flight.systems.reverse) {
      flight.onGround = false;
      flight.verticalSpeed = Math.max(1, speed * Math.sin(flight.pitch) * .4);
      flight.events.push('takeoff');
    }
  } else {
    // Bank tilts the same lift vector that supports the aircraft vertically.
    const horizontalSpeed = Math.sqrt(Math.max(0, speed ** 2 - flight.verticalSpeed ** 2));
    const turn = normal * bankSin / Math.max(horizontalSpeed, 35) * dt;
    flight.heading += turn;
    flight.trackHeading += turn;
  }
  flight.heading = Math.atan2(Math.sin(flight.heading), Math.cos(flight.heading));
  if (flight.onGround) flight.trackHeading = flight.heading;
  else {
    const slip = Math.atan2(Math.sin(flight.heading - flight.trackHeading), Math.cos(flight.heading - flight.trackHeading));
    flight.trackHeading += slip * (1 - Math.exp(-performance.lateralResponse * authority * dt));
    flight.trackHeading = Math.atan2(Math.sin(flight.trackHeading), Math.cos(flight.trackHeading));
  }
  flight.sideslip = Math.atan2(Math.sin(flight.heading - flight.trackHeading), Math.cos(flight.heading - flight.trackHeading));
  const trackChange = flight.trackHeading - previousTrack;
  flight.trackTurnRate = flight.onGround ? 0 : Math.atan2(Math.sin(trackChange), Math.cos(trackChange)) / dt;
  const nextVertical = flight.onGround ? 0 : clamp(flight.verticalSpeed + verticalAcceleration * dt, -flight.speed, flight.speed);
  const verticalSpeed = flight.onGround ? 0 : (flight.verticalSpeed + nextVertical) * .5;
  const horizontalSpeed = Math.sqrt(Math.max(0, speed ** 2 - verticalSpeed ** 2));
  flight.x += Math.sin(flight.trackHeading) * horizontalSpeed * dt;
  flight.z -= Math.cos(flight.trackHeading) * horizontalSpeed * dt;
  if (!flight.onGround) {
    flight.y += verticalSpeed * dt;
    flight.verticalSpeed = nextVertical;
  }
  flight.angleOfAttack = aircraftAirflow(flight, flow).angle;
  flight.loadFactor = flight.onGround ? 0 : normal / gravity;
  const surface = Math.max(-12, airportSurfaceHeight(flight.x, flight.z, site));
  const sideways = aircraft.span * .42, lengthwise = aircraft.length * .35, depth = aircraft.gearHeight * .45;
  const extentY = Math.abs(bankSin * pitchCos) * sideways + Math.abs(pitchSin) * lengthwise + Math.abs(bankCos * pitchCos) * depth;
  const contactHeight = surface + (flight.onGround ? aircraft.gearHeight : Math.max(depth + (aircraft.gearHeight - depth) * flight.gearPosition, extentY));
  if (flight.onGround) flight.y = contactHeight;
  flight.stallType = flight.onGround ? '' : flow.highAngle ? flight.angleOfAttack < 0 ? 'negative' : 'positive'
    : speed * airspeedScale < stall ? 'slow' : flight.flowSeparation > .25 ? 'recovering' : '';
  flight.stalling = !!flight.stallType;
  if (flight.y > surface + aircraft.gearHeight + 20) flight.hasFlown = true;
  if (Math.abs(flight.x) < site.bounds.x && Math.abs(flight.z) < site.bounds.z) {
    pose.setFromEuler(angles.set(flight.pitch, -flight.heading, -flight.roll));
    forward.set(0, 0, -1).applyQuaternion(pose); up.set(0, 1, 0).applyQuaternion(pose); right.set(1, 0, 0).applyQuaternion(pose);
    const extentX = Math.abs(right.x) * sideways + Math.abs(forward.x) * lengthwise + Math.abs(up.x) * depth;
    const extentZ = Math.abs(right.z) * sideways + Math.abs(forward.z) * lengthwise + Math.abs(up.z) * depth;
    for (const building of site.buildings) {
      if (flight.y - extentY < site.elevation + building.height && flight.y + extentY > site.elevation + building.base && Math.abs(flight.x - building.x) < building.width / 2 + extentX && Math.abs(flight.z - building.z) < building.depth / 2 + extentZ) {
        recoverAircraftFlight(flight, '建筑碰撞 · 已恢复安全高度，继续飞行。');
        return;
      }
    }
  }
  if (flight.y <= contactHeight) {
    flight.y = contactHeight;
    if (!flight.onGround) {
      if (!runwayContact(flight, aircraft)) {
        recoverAircraftFlight(flight, surface < -1 ? '触水保护 · 已恢复安全高度。' : !flight.gearDown || flight.gearPosition < .999 ? '未放轮接地 · 已恢复安全高度；着陆前按 G 放轮锁定。' : '接地保护 · 已恢复安全高度；减小下降率并对准跑道。');
        return;
      }
      flight.events.push('touchdown');
      flight.touchdownSpeed = Math.max(0, -flight.verticalSpeed);
      flight.onGround = true;
      flight.trackTurnRate = 0;
      flight.runwayIndex = site.runways.findIndex(runway => Math.abs(flight.x - runway.x) < runway.width / 2 && flight.z >= runway.end && flight.z <= runway.start);
      deployArmedSpoilers(flight);
      flight.verticalSpeed = 0;
      flight.loadFactor = 0;
      flight.flowSeparation = 0; flight.stallType = ''; flight.stalling = false;
    }
  }
  flight.distance += Math.hypot(flight.x - from.x, flight.y - from.y, flight.z - from.z);
  if (site.gates[flight.gates] && crossesAirGate(from, flight, site.gates[flight.gates])) {
    flight.gates++;
    flight.events.push('gate');
  }
}

export function updateAircraftFlight(flight, input = {}, dt) {
  flight.events.length = 0;
  if (flight.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, .25);
  while (remaining > 1e-10 && flight.status === 'running') {
    const step = Math.min(remaining, AIRCRAFT_STEP);
    stepFlight(flight, input, step);
    if (flight.events.includes('recovery')) break;
    remaining -= step;
  }
  if (flight.status !== 'running' && flight.systems.autopilot.mode !== 'off') {
    flight.systems.autopilot.mode = 'off';flight.systems.autopilot.reason = 'status';
  }
  if (flight.status !== 'running') {
    flight.systems.autothrottle.enabled = false;flight.systems.autothrottle.reason = 'status';flight.systems.autoBrakeActive = false;
  }
}
