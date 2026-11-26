import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, AIRCRAFT_PHYSICS_DEFAULTS, AIRCRAFT_PHYSICS_LIMITS, AIRCRAFT_PRESETS, createAircraftFlight, setAircraftPhysics, aircraftEnvelope, setAircraftFlaps, toggleAircraftSpeedBrake, updateAircraftFlight } from '../../src/aviation/aircraft-flight.js';

function advance(flight, input, seconds, step = 1 / 60) {
  for (let time = 0; time < seconds - 1e-9; time += step) updateAircraftFlight(flight, input, Math.min(step, seconds - time));
}

function airborne(physics = {}, id = 'su30') {
  const flight = createAircraftFlight(id, true, { physics });
  flight.y = 3000;
  return flight;
}

test('thrust, weight and drag independently change acceleration and engine-out flight', () => {
  for (const id of ['a380', 'su30']) {
    for (const [key, values, faster] of [['thrust', [.5, 2.5], 1], ['mass', [.5, 2], 0], ['drag', [.25, 2], 0]]) {
      const flights = values.map(value => {
        const flight = airborne({ [key]: value }, id);
        flight.throttle = 1; flight.speed = 100;
        advance(flight, {}, 2);
        return flight;
      });
      assert.ok(flights[faster].speed > flights[1 - faster].speed + 1, `${id} ${key}`);
    }
    const ground = createAircraftFlight(id, false, { physics: { thrust: 0 } });
    ground.status = 'running'; ground.throttle = 1; advance(ground, {}, 3);
    assert.equal(ground.speed, 0);
    const glide = airborne({ thrust: 0 }, id), powered = airborne({}, id);
    advance(glide, {}, 3); advance(powered, {}, 3);
    assert.ok(glide.speed < powered.speed);
  }
});

test('lift and weight update stall, takeoff and landing references consistently with flaps', () => {
  const heavy = airborne({ mass: 2, lift: .5 }), light = airborne({ mass: .5, lift: 1.75 });
  const before = aircraftEnvelope(heavy);
  assert.ok(before.stall > aircraftEnvelope(light).stall * 2);
  assert.ok(before.takeoff > aircraftEnvelope(light).takeoff * 2);
  assert.ok(before.landing > aircraftEnvelope(light).landing * 2);
  for (const flight of [heavy, light]) { flight.speed = 80; flight.throttle = 0; }
  assert.equal(setAircraftFlaps(heavy, 2), true);
  assert.ok(aircraftEnvelope(heavy).stall < before.stall);
  assert.ok(aircraftEnvelope(heavy).takeoff < before.takeoff);
  advance(heavy, {}, .1); advance(light, {}, .1);
  assert.equal(heavy.stalling, true); assert.equal(light.stalling, false);
});

test('wheel braking and air braking tune the corresponding systems', () => {
  for (const [key, airborneStart] of [['wheelBrake', false], ['airBrake', true]]) {
    const flights = [.5, 2].map(value => {
      const flight = createAircraftFlight('su30', airborneStart, { physics: { [key]: value } });
      Object.assign(flight, { status: 'running', throttle: 0, speed: airborneStart ? 220 : 60 });
      if (airborneStart) { flight.y = 3000; toggleAircraftSpeedBrake(flight); }
      advance(flight, { brake: !airborneStart }, 1);
      return flight;
    });
    assert.ok(flights[1].speed < flights[0].speed - 10, key);
    assert.ok(flights.every(flight => flight.status === 'running'));
  }
});

test('actual touchdown uses the customized landing speed instead of the factory limit', () => {
  for (const [physics, safe] of [[{ mass: 2 }, true], [{ mass: .5, lift: 1.75 }, false]]) {
    const flight = airborne(physics);
    Object.assign(flight, { x: 0, y: flight.aircraft.gearHeight + .01, z: 0, gearDown: true, gearPosition: 1, verticalSpeed: -2, speed: 150, throttle: 0 });
    updateAircraftFlight(flight, {}, 1 / 60);
    assert.equal(flight.status, 'running');
    assert.equal(flight.onGround, safe);
    assert.equal(flight.events.includes('recovery'), !safe);
  }
});

test('flight path response, rotational inertia and configurable limits change actual maneuvers', () => {
  const paths = [.4, 1.8].map(flightPath => {
    const flight = airborne({ mode: 'maneuver', stability: 0, flightPath });
    flight.pitch = .35; advance(flight, {}, 1);
    return flight;
  });
  assert.ok(paths[1].verticalSpeed > paths[0].verticalSpeed + 10);
  const inertia = [.5, 2].map(mass => {
    const flight = airborne({ mode: 'maneuver', stability: 0, mass });
    advance(flight, { roll: 1 }, .1); return flight;
  });
  assert.ok(inertia[0].roll > inertia[1].roll * 2);
  for (const [key, axis, mode] of [['pitchLimit', 'pitch', 'assisted'], ['bankLimit', 'roll', 'limited']]) {
    const flights = [.4, 1.25].map(value => {
      const flight = airborne({ mode, [key]: value });
      advance(flight, { [axis]: 1 }, 4); return flight;
    });
    assert.ok(flights[1][axis] > flights[0][axis] * 2, key);
  }
});

test('speed ceiling tuning increases attainable speed and reduces an existing overspeed smoothly', () => {
  const fast = airborne({ thrust: 3, drag: .25, maxSpeed: 1.8 });
  fast.speed = 640; fast.throttle = 1; advance(fast, {}, 3);
  assert.ok(fast.speed > 700); assert.ok(fast.speed <= fast.performance.maxSpeed);
  fast.status = 'paused';
  const before = [fast.x, fast.y, fast.z, fast.speed, fast.pitch, fast.roll];
  setAircraftPhysics(fast, { maxSpeed: .5 });
  assert.deepEqual([fast.x, fast.y, fast.z, fast.speed, fast.pitch, fast.roll], before);
  advance(fast, {}, 1); assert.equal(fast.speed, before[3]);
  fast.status = 'running'; updateAircraftFlight(fast, {}, 1 / 120);
  assert.ok(fast.speed < before[3] && fast.speed > before[3] - 2);
  advance(fast, {}, 15);
  assert.ok(fast.speed <= aircraftEnvelope(fast).maxSpeed + .1);
});

test('presets and every parameter boundary remain finite across the fleet and frame sizes', () => {
  for (const aircraft of AIRCRAFT) for (const preset of AIRCRAFT_PRESETS) {
    const flights = [1 / 30, 1 / 60, 1 / 120].map(step => {
      const flight = airborne(preset.physics, aircraft.id);
      advance(flight, { pitch: .3, roll: .2 }, 5, step); return flight;
    });
    for (const flight of flights) {
      assert.equal(flight.status, 'running', `${aircraft.id} ${preset.id}`);
      assert.ok(Math.abs(flight.y - flights[0].y) < .001);
      assert.ok(Math.abs(flight.speed - flights[0].speed) < .001);
    }
  }
  for (const { id } of AIRCRAFT) for (const end of [0, 1]) {
    const physics = Object.fromEntries(Object.entries(AIRCRAFT_PHYSICS_LIMITS).map(([key, range]) => [key, range[end]]));
    const flight = airborne({ ...physics, mode: 'maneuver' }, id);
    advance(flight, { pitch: 1, roll: -1, yaw: .7 }, 10);
    assert.ok(['x', 'y', 'z', 'speed', 'pitch', 'roll', 'heading'].every(key => Number.isFinite(flight[key])));
    assert.ok(Object.values(flight.performance).every(Number.isFinite));
  }
});

test('normalization bounds all custom parameters and leaves factory aircraft immutable', () => {
  const flight = airborne(), factory = JSON.stringify(AIRCRAFT);
  for (const [key, [low, high]] of Object.entries(AIRCRAFT_PHYSICS_LIMITS)) {
    setAircraftPhysics(flight, { [key]: -100 }); assert.equal(flight.physics[key], low);
    setAircraftPhysics(flight, { [key]: 100 }); assert.equal(flight.physics[key], high);
    setAircraftPhysics(flight, { [key]: NaN }); assert.equal(flight.physics[key], AIRCRAFT_PHYSICS_DEFAULTS[key]);
  }
  assert.equal(JSON.stringify(AIRCRAFT), factory);
  assert.notEqual(flight.physics, createAircraftFlight().physics);
});
