import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT, createAircraftFlight, updateAircraftFlight, toggleAircraftGear, toggleAircraftPause } from '../../src/aviation/aircraft-flight.js';
import { AIRPORTS } from '../../src/aviation/airport.js';

test('touchdown preserves the actual sink speed for feedback after vertical motion stops', () => {
  for (const airport of AIRPORTS) for (const aircraft of AIRCRAFT) {
    const impacts = [.5, aircraft.sinkLimit * .7].map(sink => {
      const flight = createAircraftFlight(aircraft.id, false, { airport: airport.id });
      assert.equal(flight.touchdownSpeed, 0);
      Object.assign(flight, { status: 'running', onGround: false, hasFlown: true, y: flight.y + .001, speed: aircraft.stall, verticalSpeed: -sink });
      updateAircraftFlight(flight, {}, 1 / 60);
      assert.ok(flight.events.includes('touchdown'), `${airport.id}/${aircraft.id}`);
      assert.equal(flight.verticalSpeed, 0);
      const impact = flight.touchdownSpeed;
      assert.ok(Math.abs(impact - sink) < .2);
      updateAircraftFlight(flight, {}, 1 / 60);
      assert.equal(flight.events.includes('touchdown'), false);
      assert.equal(flight.touchdownSpeed, impact);
      return impact;
    });
    assert.ok(impacts[1] > impacts[0]);
  }
});

test('gear completion feedback occurs once at each endpoint, never for the initial state', () => {
  for (const aircraft of AIRCRAFT) {
    const parked = createAircraftFlight(aircraft.id);
    parked.status = 'running';updateAircraftFlight(parked, {}, .25);
    assert.deepEqual(parked.events, []);
    const flight = createAircraftFlight(aircraft.id, true), events = [];
    flight.y = 3000;
    const advance = seconds => {
      for (let i = 0; i < seconds * 60; i++) {
        updateAircraftFlight(flight, {}, 1 / 60);
        events.push(...flight.events.filter(event => event.startsWith('gear-')));
      }
      assert.equal(flight.status, 'running');
    };
    advance(.5);
    assert.deepEqual(events, []);
    assert.equal(toggleAircraftGear(flight), true);
    advance(1);
    toggleAircraftPause(flight);
    const position = flight.gearPosition;
    updateAircraftFlight(flight, {}, .25);
    assert.equal(flight.gearPosition, position);
    assert.deepEqual(flight.events, []);
    toggleAircraftPause(flight);
    advance(8);
    assert.equal(flight.gearPosition, 1);
    assert.deepEqual(events, ['gear-locked']);
    toggleAircraftGear(flight);
    advance(8);
    assert.equal(flight.gearPosition, 0);
    assert.deepEqual(events, ['gear-locked', 'gear-retracted']);
  }
});

test('reversing an unfinished gear movement does not announce a false down lock', () => {
  const flight = createAircraftFlight('j90', true), events = [];
  flight.y = 3000;
  toggleAircraftGear(flight);
  updateAircraftFlight(flight, {}, .25);
  assert.ok(flight.gearPosition > 0 && flight.gearPosition < 1);
  toggleAircraftGear(flight);
  for (let i = 0; i < 120; i++) {
    updateAircraftFlight(flight, {}, 1 / 60);
    events.push(...flight.events.filter(event => event.startsWith('gear-')));
  }
  assert.deepEqual(events, ['gear-retracted']);
});
