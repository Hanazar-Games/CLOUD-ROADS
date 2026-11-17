import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRCRAFT, createAircraftFlight } from '../../src/aviation/aircraft-flight.js';
import { toggleAircraftSystem, restoreAircraftPreflight } from '../../src/aviation/aircraft-systems.js';
import { createAircraftLights, updateAircraftLights } from '../../src/aviation/aircraft-lights.js';
import { disposeAircraftObject } from '../../src/aviation/aircraft-models.js';

test('light commands survive preflight transfer and remain selectable without power', () => {
  const flight = createAircraftFlight('a380');
  for (const action of ['nav-lights', 'beacon-lights', 'landing-lights', 'taxi-lights']) {
    assert.equal(toggleAircraftSystem(flight, action), true);
    assert.equal(toggleAircraftSystem(flight, action), true);
  }
  toggleAircraftSystem(flight, 'landing-lights');toggleAircraftSystem(flight, 'taxi-lights');
  const next = createAircraftFlight('a380');restoreAircraftPreflight(next, flight);
  for (const key of ['navLights', 'beaconLights', 'landingLights', 'taxiLights']) assert.equal(next.systems[key], flight.systems[key]);
  flight.systems.batteryOn = false;flight.systems.generatorOn = false;
  assert.equal(toggleAircraftSystem(flight, 'nav-lights'), true);
  flight.status = 'crashed';assert.equal(toggleAircraftSystem(flight, 'landing-lights'), false);
});

test('external lights follow supply, gear and view with one lamp batch and local beam targets', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id, true), lights = createAircraftLights(aircraft);
    flight.gearDown = true;flight.gearPosition = 1;flight.systems.landingLights = true;flight.systems.taxiLights = true;
    updateAircraftLights(lights, flight, .01, false);
    const { lamps, landing, taxi } = lights.userData;
    assert.equal(landing.visible, true);assert.equal(taxi.visible, true);
    flight.gearPosition = .5;updateAircraftLights(lights, flight, 0, false);
    assert.equal(taxi.visible, false, 'selected down gear must lock before taxi lights illuminate');
    flight.gearPosition = 1;updateAircraftLights(lights, flight, 0, false);assert.equal(taxi.visible, true);
    assert.equal(landing.target.parent, lights);assert.equal(taxi.target.parent, lights);
    let meshes = 0;lights.traverse(object => { if (object.isMesh) meshes++; });assert.equal(meshes, 1);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < lamps.count; index++) {
      lamps.getMatrixAt(index, matrix);assert.ok(matrix.elements.every(Number.isFinite));
    }
    flight.gearDown = false;updateAircraftLights(lights, flight, .01, false);
    assert.equal(taxi.visible, false);assert.equal(landing.visible, true);
    updateAircraftLights(lights, flight, .01, true);
    assert.equal(lamps.visible, false);assert.equal(landing.visible, true, 'ground illumination must remain visible from the cockpit');
    flight.systems.batteryOn = false;flight.systems.generatorOn = false;
    updateAircraftLights(lights, flight, .01, false);
    assert.equal(lamps.visible, false);assert.equal(landing.visible, false);assert.equal(taxi.visible, false);
    flight.systems.batteryOn = true;updateAircraftLights(lights, flight, .01, false);
    assert.equal(landing.visible, true, 'selected lights resume after power restoration');
    disposeAircraftObject(lights);
  }
});

test('beacon timing freezes on pause and stable lamps do not upload matrices every frame', () => {
  const flight = createAircraftFlight('p72', true), lights = createAircraftLights(flight.aircraft);
  updateAircraftLights(lights, flight, .01, false);
  const version = lights.userData.lamps.instanceMatrix.version;
  updateAircraftLights(lights, flight, .01, false);
  assert.equal(lights.userData.lamps.instanceMatrix.version, version);
  flight.status = 'paused';const time = lights.userData.time;
  updateAircraftLights(lights, flight, .1, false);assert.equal(lights.userData.time, time);
  flight.status = 'running';updateAircraftLights(lights, flight, .2, false);
  assert.ok(lights.userData.lamps.instanceMatrix.version > version);
  disposeAircraftObject(lights);
});

test('fixtures use transformed wing tips and body clearance while ignoring extended landing gear', () => {
  const aircraft = AIRCRAFT.find(item => item.id === 'p72'), model = new THREE.Group(), body = new THREE.Group(), gear = new THREE.Group();
  body.position.set(0, .8, 0);body.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 10)));
  for (const side of [-1, 1]) { const wing = new THREE.Mesh(new THREE.BoxGeometry(1, .2, 2));wing.position.set(side * aircraft.span / 2, 2, 1);body.add(wing); }
  const wheel = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1));wheel.position.y = -7;gear.add(wheel);model.add(body, gear);model.userData.gear = [gear];
  model.position.set(100, 200, 300);model.rotation.y = .8;
  const lights = createAircraftLights(aircraft, model), fixtures = lights.userData.fixtures;
  assert.ok(Math.abs(fixtures[0].position[1] - 2.8) < 1e-6);
  assert.ok(fixtures[3].position[1] > 2.8);assert.ok(fixtures[4].position[1] > -2);
  assert.ok(fixtures[0].position[0] < -aircraft.span * .49);assert.ok(fixtures[1].position[0] > aircraft.span * .49);
  disposeAircraftObject(lights);disposeAircraftObject(model);
});
