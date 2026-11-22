import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT_STEP, createAircraftFlight, runwayContact, setAircraftFlaps, updateAircraftFlight } from '../../src/aviation/aircraft-flight.js';
import { aircraftDensity, equivalentAirspeed } from '../../src/aviation/aircraft-envelope.js';
import { autothrottleAvailability, setAutothrottle } from '../../src/aviation/aircraft-systems.js';

test('thinner air can cause a low-speed stall while distance still follows true airspeed', () => {
  const flights = [0, 1].map(airDensity => {
    const flight = createAircraftFlight('t6', true, { physics: { airDensity } });
    Object.assign(flight, { y: 10000, speed: 36 });
    updateAircraftFlight(flight, {}, AIRCRAFT_STEP);
    return flight;
  });
  assert.equal(flights[0].stallType, '');
  assert.equal(flights[1].stallType, 'slow');
  assert.ok(equivalentAirspeed(flights[1]) < flights[1].performance.stall);
  assert.ok(Math.abs(flights[1].distance / AIRCRAFT_STEP - 36) < .1);
  assert.ok(flights[1].verticalSpeed < flights[0].verticalSpeed);
});

test('flap limits and autothrottle use equivalent airspeed while the ceiling remains true airspeed', () => {
  const flight = createAircraftFlight('su30', true, { physics: { airDensity: 1 } });
  Object.assign(flight, { y: 9000, speed: 220 });
  assert.ok(flight.speed > flight.aircraft.flapLimit);
  assert.ok(setAircraftFlaps(flight, 1));
  assert.ok(setAutothrottle(flight, true));
  assert.equal(flight.systems.autothrottle.target, equivalentAirspeed(flight));
  assert.equal(autothrottleAvailability(flight).maximum, flight.performance.maxSpeed * Math.sqrt(aircraftDensity(flight)));
  const target = flight.systems.autothrottle.target;
  for (let i = 0; i < 240; i++) updateAircraftFlight(flight, {}, AIRCRAFT_STEP);
  assert.equal(flight.systems.autothrottle.target, target);
  assert.ok(Math.abs(equivalentAirspeed(flight) - target) < 5);
  assert.equal(flight.flaps, 1);
});

test('airport altitude raises the true speed needed for takeoff', () => {
  const flights = [0, 1].map(airDensity => {
    const flight = createAircraftFlight('t6', false, { airport: 'alpine', physics: { airDensity, thrustLapse: 0 } });
    Object.assign(flight, { status: 'running', throttle: 1, engineOutput: 1 });
    for (let i = 0; i < 3600 && flight.onGround; i++) updateAircraftFlight(flight, { pitch: 1 }, AIRCRAFT_STEP);
    return flight;
  });
  assert.ok(flights.every(flight => !flight.onGround));
  assert.ok(flights[1].speed > flights[0].speed + 1);
  assert.ok(Math.abs(equivalentAirspeed(flights[1]) - equivalentAirspeed(flights[0])) < .1);
});

test('high-airfield landing checks equivalent speed and keeps the runway alignment checks', () => {
  const flight = createAircraftFlight('t6', true, { airport: 'alpine', physics: { airDensity: 1 } });
  const { runway } = flight.airport;
  Object.assign(flight, { x: runway.x, y: flight.airport.elevation, z: runway.center, speed: 49, gearDown: true, gearPosition: 1, verticalSpeed: -2 });
  assert.ok(flight.speed > flight.performance.landingSpeed);
  assert.ok(runwayContact(flight, flight.aircraft));
  flight.trackHeading = .35;
  assert.equal(runwayContact(flight, flight.aircraft), false);
});
