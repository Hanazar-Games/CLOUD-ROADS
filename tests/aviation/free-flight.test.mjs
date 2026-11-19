import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRPORTS, airportSurfaceHeight, navigateAirport } from '../../src/aviation/airport.js';
import { createAircraftFlight, updateAircraftFlight, runwayContact } from '../../src/aviation/aircraft-flight.js';

test('the main hub has two full length runways and a connected midfield apron', () => {
  const site = AIRPORTS[0];
  assert.equal(site.runways.length, 2);
  assert.ok(site.runways.every(runway => runway.length >= 4500 && runway.width >= 60));
  const east = site.runways[1];
  assert.ok(east.x >= 1500);
  assert.equal(airportSurfaceHeight(east.x, east.center, site), site.elevation + east.surfaceHeight);
  assert.ok(airportSurfaceHeight(1300, -500, site) > site.elevation);
  assert.ok(site.localBuildings.some(building => building.kind === 'terminal' && building.depth >= 1500));
});

test('flying to another real world airport preserves absolute position and allows landing', () => {
  const sites = AIRPORTS.map((site, index) => ({ ...site, worldX: index * 20000 + 4608, worldZ: -index * 19000 + 228 }));
  const flight = createAircraftFlight('t6', true, { airport: sites[0] });
  for (const next of [sites[1], sites[2], sites[0]]) {
    Object.assign(flight, { x: next.worldX - flight.airport.worldX, z: next.worldZ - flight.airport.worldZ + next.runway.center });
    const x = flight.airport.worldX + flight.x, z = flight.airport.worldZ + flight.z;
    assert.equal(navigateAirport(flight, sites), true);
    assert.equal(flight.airport, next);
    assert.equal(flight.airport.worldX + flight.x, x); assert.equal(flight.airport.worldZ + flight.z, z);
    Object.assign(flight, { gearDown: true, gearPosition: 1, speed: 30, verticalSpeed: -1, pitch: 0, roll: 0, heading: 0, trackHeading: 0 });
    assert.equal(runwayContact(flight, flight.aircraft), true);
  }
  flight.x = 10000; flight.z = 10000;
  assert.equal(navigateAirport(flight, sites), false);
});

test('landing and stopping keep the flight running and permit another takeoff', () => {
  const flight = createAircraftFlight('t6', true);
  Object.assign(flight, { x: 0, z: -400, y: flight.aircraft.gearHeight + .46, speed: 30, verticalSpeed: -1,
    throttle: 0, engineOutput: 0, gearDown: true, gearPosition: 1 });
  for (let i = 0; i < 600; i++) updateAircraftFlight(flight, { brake: true }, 1 / 60);
  assert.equal(flight.status, 'running'); assert.equal(flight.onGround, true);
  assert.ok(flight.speed < 2);
  flight.throttle = 1;
  for (let i = 0; i < 900 && flight.onGround; i++) updateAircraftFlight(flight, { pitch: 1 }, 1 / 60);
  assert.equal(flight.status, 'running'); assert.equal(flight.onGround, false);
});

test('unsafe impact recovers into controllable flight without a terminal state', () => {
  const flight = createAircraftFlight('su30', true);
  Object.assign(flight, { y: 1, verticalSpeed: -30, gearDown: false, elapsed: 90, distance: 10000, gates: 2 });
  updateAircraftFlight(flight, {}, 1 / 60);
  assert.equal(flight.status, 'running'); assert.ok(flight.events.includes('recovery'));
  assert.ok(flight.y >= 250); assert.equal(flight.onGround, false);
  assert.equal(flight.gates, 2); assert.ok(flight.distance >= 10000);
  const z = flight.z;
  for (let i = 0; i < 120; i++) updateAircraftFlight(flight, { pitch: .1 }, 1 / 60);
  assert.equal(flight.status, 'running'); assert.ok(Math.abs(flight.z - z) > 100);
});

test('secondary runway supports aligned landings and fast rollout never ends exploration', () => {
  const site = AIRPORTS[0], runway = site.runways[1];
  const departure = createAircraftFlight('a380', false, { runwayIndex: 1 });
  assert.equal(departure.x, runway.x); assert.equal(departure.runwayIndex, 1);
  const flight = createAircraftFlight('su30', true);
  Object.assign(flight, { x: runway.x, z: runway.center, gearDown: true, gearPosition: 1, speed: 60, verticalSpeed: -1 });
  assert.equal(runwayContact(flight, flight.aircraft), true);
  Object.assign(flight, { onGround: true, x: runway.x + 80, speed: 35 });
  updateAircraftFlight(flight, {}, 1 / 60);
  assert.equal(flight.status, 'running'); assert.ok(!flight.events.includes('recovery'));
});
