import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, createAircraftFlight, updateAircraftFlight, aircraftEnvelope, setAircraftPhysics, toggleAircraftPause } from '../../src/aviation/aircraft-flight.js';

function advance(flight, seconds, input = {}, step = 1 / 60) {
  for (let time = 0; time < seconds - 1e-9; time += step) updateAircraftFlight(flight, input, Math.min(step, seconds - time));
}

test('ground rotation requires airflow and progressively returns as takeoff speed builds', () => {
  for (const aircraft of AIRCRAFT) {
    const pitches = [0, aircraft.takeoff * .25, aircraft.takeoff * .85].map(speed => {
      const flight = createAircraftFlight(aircraft.id);
      Object.assign(flight, { status: 'running', speed });
      advance(flight, .5, { pitch: 1 });
      assert.equal(flight.onGround, true);
      return flight.pitch;
    });
    assert.equal(pitches[0], 0, `${aircraft.id}: cannot lift the nose while stationary`);
    assert.ok(pitches[1] > 0 && pitches[1] < pitches[2] * .4);
  }
});

test('ground steering is useful for taxiing and gentler during a high-speed runway roll', () => {
  for (const aircraft of AIRCRAFT) {
    const turns = [15, Math.min(aircraft.maxSpeed, 100)].map(speed => {
      const flight = createAircraftFlight(aircraft.id);
      Object.assign(flight, { status: 'running', speed });
      advance(flight, .2, { yaw: .5 });
      assert.equal(flight.status, 'running');
      assert.equal(flight.trackHeading, flight.heading);
      return Math.abs(flight.heading);
    });
    assert.ok(turns[0] > .005);
    assert.ok(turns[1] < turns[0], aircraft.id);
  }
});

test('yaw preserves horizontal momentum and lateral response controls gradual track alignment', () => {
  for (const { id } of AIRCRAFT) {
    const flights = [.25, 3].map(lateralResponse => {
      const flight = createAircraftFlight(id, true, { physics: { mode: 'maneuver', stability: 0, lateralResponse } });
      Object.assign(flight, { y: 4000, heading: .4, trackHeading: 0 });
      const x = flight.x;
      updateAircraftFlight(flight, {}, 1 / 120);
      assert.ok(flight.trackHeading > 0 && flight.trackHeading < .4);
      assert.ok(flight.x - x < flight.speed / 120 * Math.sin(.4) * .1, `${id}: heading cannot instantly redirect momentum`);
      advance(flight, .5);
      return flight;
    });
    assert.ok(flights[1].trackHeading > flights[0].trackHeading, `${id}: lateral response affects real motion`);
    assert.ok(flights[1].x > flights[0].x);
  }
});

test('track alignment wraps across north, follows ground steering and freezes on pause', () => {
  const flight = createAircraftFlight('su30', true);
  Object.assign(flight, { y: 4000, heading: -Math.PI + .02, trackHeading: Math.PI - .02 });
  updateAircraftFlight(flight, {}, 1 / 120);
  assert.ok(flight.sideslip > 0 && flight.sideslip < .04, 'align along the shortest angular path');
  toggleAircraftPause(flight);const snapshot = structuredClone(flight);
  advance(flight, 1);assert.deepEqual(flight, { ...snapshot, events: [] });
  for (const runwayDirection of ['18', '36']) {
    const ground = createAircraftFlight('su30', false, { runwayDirection });
    ground.status = 'running';ground.speed = 15;
    advance(ground, .2, { yaw: .5 });
    assert.equal(ground.trackHeading, ground.heading);assert.equal(ground.sideslip, 0);
    const air = createAircraftFlight('su30', true, { runwayDirection });
    assert.equal(air.trackHeading, air.heading);
  }
});

test('sideslip dissipates energy and inertial turns remain consistent across frame rates', () => {
  for (const { id } of AIRCRAFT) {
    const flights = [0, .4].map(heading => {
      const flight = createAircraftFlight(id, true, { physics: { mode: 'maneuver', stability: 0, lateralResponse: .25 } });
      Object.assign(flight, { y: 4000, heading, throttle: 0, engineOutput: 0 });
      advance(flight, 1);return flight;
    });
    assert.ok(flights[1].speed < flights[0].speed - .01, `${id}: sideslip must not provide a free sideways turn`);
    const samples = [1 / 30, 1 / 60, 1 / 120].map(step => {
      const flight = createAircraftFlight(id, true);flight.y = 4000;
      advance(flight, 3, { yaw: .4, roll: .3 }, step);return flight;
    });
    for (const flight of samples) for (const key of ['x', 'z', 'speed', 'trackHeading', 'sideslip']) assert.ok(Math.abs(flight[key] - samples[0][key]) < .001, `${id}: ${key}`);
  }
});

test('engines spool progressively in both directions and response tuning changes delivered thrust', () => {
  const flights = [.25, 3].map(engineResponse => {
    const flight = createAircraftFlight('su30', false, { physics: { engineResponse } });
    flight.status = 'running'; flight.throttle = 1; advance(flight, .5); return flight;
  });
  assert.ok(flights[0].engineOutput > 0 && flights[0].engineOutput < flights[1].engineOutput);
  assert.ok(flights[1].engineOutput < 1 && flights[1].speed > flights[0].speed);
  const flight = flights[1], previous = flight.engineOutput;
  flight.throttle = 0; updateAircraftFlight(flight, {}, 1 / 120);
  assert.ok(flight.engineOutput > 0 && flight.engineOutput < previous);
  flight.status = 'paused'; const snapshot = structuredClone(flight);
  advance(flight, 3); assert.deepEqual(flight, { ...snapshot, events: [] });
  setAircraftPhysics(flight, { engineResponse: 100 }); assert.equal(flight.physics.engineResponse, 3);
});

test('bank increases stall reference, consumes speed and recovers after levelling', () => {
  const flights = [0, Math.PI / 3].map(roll => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0 } });
    Object.assign(flight, { y: 3000, speed: 65, throttle: 0, engineOutput: 0, roll }); return flight;
  });
  const level = aircraftEnvelope(flights[0]), banked = aircraftEnvelope(flights[1]);
  assert.ok(banked.stall > level.stall * 1.35);
  advance(flights[0], .5); advance(flights[1], .5);
  assert.equal(flights[0].stalling, false); assert.equal(flights[1].stalling, true);
  assert.ok(flights[1].speed < flights[0].speed - .2);
  flights[1].roll = 0;
  assert.ok(Math.abs(aircraftEnvelope(flights[1]).stall - level.stall) < .001);
  updateAircraftFlight(flights[1], {}, 1 / 120); assert.equal(flights[1].stalling, false);
});

test('spooling and turning remain consistent across frame rates and pause cannot advance the engine', () => {
  for (const { id } of AIRCRAFT) {
    const flights = [1 / 30, 1 / 60, 1 / 120].map(step => {
      const flight = createAircraftFlight(id, true);
      flight.y = 3000; flight.throttle = 1;
      advance(flight, 4, { roll: .3 }, step); return flight;
    });
    for (const flight of flights) {
      assert.equal(flight.status, 'running');
      for (const key of ['speed', 'y', 'heading', 'engineOutput']) assert.ok(Math.abs(flight[key] - flights[0][key]) < .001, `${id} ${key}`);
      toggleAircraftPause(flight); const output = flight.engineOutput;
      advance(flight, 2); assert.equal(flight.engineOutput, output);
    }
  }
});

test('the fleet includes six distinct airliners with safe starts and working custom settings', () => {
  assert.equal(AIRCRAFT.length, 12);
  assert.equal(new Set(AIRCRAFT.map(aircraft => aircraft.id)).size, 12);
  assert.equal(AIRCRAFT.filter(aircraft => aircraft.cockpit === 'airliner').length, 6);
  for (const aircraft of AIRCRAFT) {
    assert.ok(aircraft.engines >= 1 && aircraft.engineResponse > 0 && aircraft.turnDrag > 0);
    for (const physics of [{}, { mass: 2, lift: .5 }, { maxSpeed: .5 }, { thrust: 0 }]) {
      const flight = createAircraftFlight(aircraft.id, true, { physics });
      const envelope = aircraftEnvelope(flight);
      assert.ok(flight.speed <= envelope.maxSpeed);
      if (envelope.stall * 1.4 <= envelope.maxSpeed * .85) assert.ok(flight.speed >= envelope.stall * 1.4);
      advance(flight, .5);
      assert.equal(flight.status, 'running');
      assert.ok(Number.isFinite(flight.engineOutput));
    }
  }
});

test('steep braking cannot move farther than the integrated airspeed permits', () => {
  for (const vertical of [-1, 1]) {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, thrust: 0, airBrake: 2 } });
    Object.assign(flight, { y: 10000, speed: 150, verticalSpeed: 150 * vertical, pitch: vertical * Math.PI / 2, throttle: 0, engineOutput: 0, speedBrake: true });
    const before = { x: flight.x, y: flight.y, z: flight.z, speed: flight.speed }, dt = 1 / 120;
    updateAircraftFlight(flight, {}, dt);
    const distance = Math.hypot(flight.x - before.x, flight.y - before.y, flight.z - before.z);
    assert.ok(distance <= (before.speed + flight.speed) * .5 * dt + 1e-8, `${vertical}: displacement ${distance}`);
    assert.ok(Math.abs(flight.verticalSpeed) <= flight.speed);
  }
});

test('a high-angle pull stalls above the level-flight stall speed and unloading recovers', () => {
  for (const { id } of AIRCRAFT) {
    const flight = createAircraftFlight(id, true, { physics: { mode: 'maneuver', stability: 0 } });
    Object.assign(flight, { y: 3000, speed: flight.performance.stall * 2, pitch: .75 });
    updateAircraftFlight(flight, {}, 1 / 120);
    assert.equal(flight.stalling, true, `${id}: excessive angle of attack`);
    assert.ok(flight.angleOfAttack > flight.performance.stallAngle);
    flight.pitch = Math.asin(flight.verticalSpeed / flight.speed);
    updateAircraftFlight(flight, {}, 1 / 120);
    assert.equal(flight.stalling, false, `${id}: unloading restores attached flow`);
  }
});

test('gravity follows the actual descent path even with the nose above the horizon', () => {
  const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, thrust: 0, drag: .25, inducedDrag: .25 } });
  Object.assign(flight, { y: 3000, speed: 100, verticalSpeed: -60, pitch: .02 });
  updateAircraftFlight(flight, {}, 1 / 120);
  assert.ok(flight.speed > 100, 'descending exchanges height for speed despite nose-up attitude');
});

test('pitching the nose does not instantly redirect forward momentum', () => {
  const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0 } });
  Object.assign(flight, { y: 3000, speed: 220, pitch: .45, verticalSpeed: 0 });
  const z = flight.z;
  updateAircraftFlight(flight, {}, 1 / 120);
  assert.ok(z - flight.z > 220 / 120 * .99);
});

test('load limits and induced drag tuning affect pulling forces and speed loss', () => {
  const flights = [.5, 1.5].map(loadLimit => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, loadLimit } });
    Object.assign(flight, { y: 3000, speed: 300, pitch: .3 });
    updateAircraftFlight(flight, {}, 1 / 120);
    assert.ok(Math.abs(flight.loadFactor) <= flight.performance.loadLimit + .01);
    return flight;
  });
  assert.ok(flights[1].verticalSpeed > flights[0].verticalSpeed + .1);
  const drag = [.25, 3].map(inducedDrag => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, inducedDrag } });
    Object.assign(flight, { y: 3000, pitch: .25, throttle: 0, engineOutput: 0 });
    advance(flight, .5); return flight;
  });
  assert.ok(drag[1].speed < drag[0].speed - .5);
});

test('stall-angle tuning changes the attached-flow envelope and low-speed freefall cannot hover', () => {
  const flights = [.6, 1.6].map(stallAngle => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, stallAngle } });
    Object.assign(flight, { y: 3000, speed: 180, pitch: .4 });
    updateAircraftFlight(flight, {}, 1 / 120);return flight;
  });
  assert.equal(flights[0].stalling, true);assert.equal(flights[1].stalling, false);
  assert.ok(flights[1].verticalSpeed > flights[0].verticalSpeed);
  for (const speed of [0, .01, 5]) {
    const flight = createAircraftFlight('su30', true, { physics: { thrust: 0 } });
    Object.assign(flight, { y: 3000, speed, engineOutput: 0 });
    advance(flight, 3);
    assert.ok(flight.y < 2980 && flight.verticalSpeed < -10);
    assert.ok(Math.abs(flight.verticalSpeed) <= flight.speed);
  }
});

test('stall, recovery, load and trajectory remain consistent across frame rates and freeze on pause', () => {
  for (const { id } of AIRCRAFT) {
    const flights = [1 / 30, 1 / 60, 1 / 120].map(step => {
      const flight = createAircraftFlight(id, true, { physics: { mode: 'maneuver', stability: 0 } });
      Object.assign(flight, { y: 3000, pitch: .6 });
      advance(flight, 3, { pitch: -.5, roll: .2 }, step);return flight;
    });
    for (const flight of flights) {
      assert.equal(flight.status, 'running', id);
      for (const key of ['x', 'y', 'z', 'speed', 'angleOfAttack', 'loadFactor', 'verticalSpeed']) {
        assert.ok(Number.isFinite(flight[key]) && Math.abs(flight[key] - flights[0][key]) < .001, `${id}: ${key}`);
      }
      toggleAircraftPause(flight);const snapshot = structuredClone(flight);
      advance(flight, 1);assert.deepEqual(flight, { ...snapshot, events: [] });
    }
  }
});

test('airbrakes still dissipate energy in a vertical descent', () => {
  const flights = [false, true].map(speedBrake => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, thrust: 0 } });
    Object.assign(flight, { y: 3000, speed: 120, verticalSpeed: -120, pitch: -Math.PI / 2, speedBrake });
    advance(flight, .2);return flight;
  });
  assert.ok(flights[1].speed < flights[0].speed - 1);
});

test('airbrake drag in a steep glide acts along the actual flight path', () => {
  const path = -.7;
  const [clean, braked] = [false, true].map(speedBrake => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, thrust: 0 } });
    Object.assign(flight, { y: 3000, speed: 160, pitch: path + .05, verticalSpeed: 160 * Math.sin(path), speedBrake });
    updateAircraftFlight(flight, {}, 1 / 120);
    return flight;
  });
  assert.ok(braked.speed < clean.speed);
  assert.ok(braked.verticalSpeed > clean.verticalSpeed);
  assert.ok(Math.abs((braked.verticalSpeed - clean.verticalSpeed) / (braked.speed - clean.speed) - Math.sin(path)) < .003);
});

test('a steep established climb is safe at low angle of attack while a negative-angle push stalls', () => {
  for (const { id } of AIRCRAFT) {
    const climb = createAircraftFlight(id, true, { physics: { mode: 'maneuver', stability: 0 } });
    Object.assign(climb, { y: 3000, speed: climb.performance.stall * 2, pitch: .65 });
    climb.verticalSpeed = climb.speed * Math.sin(climb.pitch);
    updateAircraftFlight(climb, {}, 1 / 120);
    assert.equal(climb.stalling, false, `${id}: attitude alone must not trigger angle-of-attack stall`);
    assert.ok(Math.abs(climb.angleOfAttack) < .01);
    const push = createAircraftFlight(id, true, { physics: { mode: 'maneuver', stability: 0 } });
    Object.assign(push, { y: 3000, speed: push.performance.stall * 2, pitch: -.65 });
    updateAircraftFlight(push, {}, 1 / 120);
    assert.equal(push.stalling, true);assert.ok(push.angleOfAttack < -push.performance.stallAngle);
    assert.ok(push.loadFactor < 0 && push.loadFactor >= -push.performance.loadLimit);
  }
});

test('pilot counter-pitch and power recover every aircraft from a high-angle stall without resetting its pose', () => {
  for (const { id } of AIRCRAFT) {
    const flight = createAircraftFlight(id, true, { physics: { mode: 'maneuver', stability: 0 } });
    Object.assign(flight, { y: 3000, speed: flight.performance.stall * 2, pitch: .65, throttle: 1, engineOutput: 1 });
    updateAircraftFlight(flight, {}, 1 / 120);
    assert.equal(flight.stalling, true);
    let recovered = false;
    for (let time = 0; time < 8; time += 1 / 120) {
      updateAircraftFlight(flight, { pitch: -.8 }, 1 / 120);
      if (!flight.stalling && Math.abs(flight.angleOfAttack) < flight.performance.stallAngle * .7) { recovered = true;break; }
    }
    assert.equal(flight.status, 'running', id);assert.equal(recovered, true, id);
    assert.ok(flight.distance > 0 && flight.y > 2800);
  }
});
