import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT_STEP, createAircraftFlight, setAircraftPhysics, updateAircraftFlight } from '../../src/aviation/aircraft-flight.js';
import { aircraftAirflow, flightPathAngle } from '../../src/aviation/aircraft-envelope.js';

function advance(flight, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds / AIRCRAFT_STEP); i++) updateAircraftFlight(flight, input, AIRCRAFT_STEP);
}

test('rate-controlled flight respects optional pitch and bank limits in both directions', () => {
  for (const direction of [-1, 1]) {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'limited', stability: 0, pitchLimit: .4, bankLimit: .4 } });
    flight.y = 4000;
    advance(flight, 3, { pitch: direction, roll: direction, yaw: direction });
    assert.ok(Math.abs(flight.pitch - direction * flight.performance.pitchLimit) < 1e-8);
    assert.ok(Math.abs(flight.roll - direction * flight.performance.bankLimit) < 1e-8);
    assert.ok(Math.abs(flight.heading) > .1);
    setAircraftPhysics(flight, { mode: 'maneuver' });
    advance(flight, 1, { roll: direction });
    assert.ok(Math.abs(flight.roll) > flight.performance.bankLimit + .25);
  }
});

test('switching from inverted flight to angle limits recovers the attitude without snapping', () => {
  const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0 } });
  Object.assign(flight, { y: 5000, roll: 2.8 });
  setAircraftPhysics(flight, { mode: 'limited' });
  updateAircraftFlight(flight, {}, AIRCRAFT_STEP);
  assert.ok(flight.roll < 2.8 && flight.roll > 2.75);
  advance(flight, 4);
  assert.ok(flight.roll < flight.performance.bankLimit + .01);
});

test('banked sideslip changes local wing angle and negative stall has its own limit', () => {
  const flight = createAircraftFlight('su30', true);
  const angle = (flight.performance.stallAngle + flight.performance.negativeStallAngle) / 2;
  flight.pitch = angle;
  assert.equal(aircraftAirflow(flight).highAngle, false);
  flight.pitch = -angle;
  assert.equal(aircraftAirflow(flight).highAngle, true);
  flight.pitch = 0; flight.roll = Math.PI / 2; flight.trackHeading = .2;
  assert.ok(Math.abs(aircraftAirflow(flight).angle + .2) < 1e-8);
});

test('separated airflow recovers progressively after unloading and follows the selected recovery rate', () => {
  const flights = [.25, 3].map(stallRecovery => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, stallRecovery } });
    Object.assign(flight, { y: 5000, pitch: .9 });
    advance(flight, .2);
    assert.equal(flight.stallType, 'positive');
    assert.ok(flight.flowSeparation > .5);
    flight.pitch = flightPathAngle(flight);
    advance(flight, .25);
    return flight;
  });
  assert.ok(flights[0].flowSeparation > .5);
  assert.equal(flights[0].stallType, 'recovering');
  assert.ok(flights[1].flowSeparation < .15);
  assert.equal(flights[1].stallType, '');
});

test('stall lift, drag and remaining control authority tune separate effects', () => {
  const sample = physics => {
    const flight = createAircraftFlight('su30', true, { physics: { mode: 'maneuver', stability: 0, ...physics } });
    Object.assign(flight, { y: 5000, speed: 220, pitch: .85 });
    advance(flight, .1, { roll: 1 });
    return flight;
  };
  assert.ok(sample({ stallLiftLoss: .4 }).verticalSpeed > sample({ stallLiftLoss: .98 }).verticalSpeed + 1);
  assert.ok(sample({ stallDrag: .25 }).speed > sample({ stallDrag: 3 }).speed + 2);
  assert.ok(sample({ stallAuthority: 1 }).roll > sample({ stallAuthority: .25 }).roll * 3);
});
