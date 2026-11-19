import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRPORTS, AIRPORT_BUILDINGS, RUNWAY, TAXIWAYS } from '../../src/aviation/airport.js';
import { createAirport, createAirportLod, setAirportDetailDistance } from '../../src/aviation/airport-view.js';
import { createRunway } from '../../src/aviation/runway-view.js';
import { createAircraftFlight, updateAircraftFlight } from '../../src/aviation/aircraft-flight.js';
import { disposeAircraftObject } from '../../src/aviation/aircraft-models.js';

test('airport structures leave the runway, parallel taxiway and approach clear', () => {
  for (const building of AIRPORT_BUILDINGS) {
    assert.ok(Math.abs(building.x) - building.width / 2 > RUNWAY.width / 2 + 25);
    assert.ok(building.base >= 0 && building.height > building.base);
    for (const runway of AIRPORTS[0].runways) assert.ok(Math.abs(building.x - runway.x) - building.width / 2 > runway.width / 2 + 25);
  }
  assert.ok(TAXIWAYS.some(taxiway => taxiway.x === -170));
  assert.ok(TAXIWAYS.some(taxiway => taxiway.x === -85));
});

test('jetway corridors connect the terminal facade to their boarding cabins without gaps', () => {
  const terminals = AIRPORT_BUILDINGS.filter(building => building.kind === 'terminal');
  for (const corridor of AIRPORT_BUILDINGS.filter(building => building.kind === 'jetway' && building.width > 20)) {
    assert.ok(terminals.some(terminal => Math.abs(corridor.z - terminal.z) <= terminal.depth / 2 && corridor.x - corridor.width / 2 <= terminal.x + terminal.width / 2 && corridor.x + corridor.width / 2 >= terminal.x - terminal.width / 2), 'corridor must reach a terminal wall');
    const cabin = AIRPORT_BUILDINGS.find(building => building.kind === 'jetway' && building.width < 20 && building.z === corridor.z);
    assert.ok(cabin.x - cabin.width / 2 <= corridor.x + corridor.width / 2, 'boarding cabin must reach the corridor');
  }
});

test('airport modeling is batched, has named facilities and disposes resources once', () => {
  const airport = createAirport(), resources = new Set();
  assert.ok(airport.getObjectByName('airport-architecture'));
  assert.ok(airport.getObjectByName('airport-pavement'));
  for (const mesh of airport.getObjectByName('airport-pavement').children) {
    assert.equal(mesh.material.polygonOffset, true);
    assert.ok(mesh.material.polygonOffsetFactor <= 0 && mesh.material.polygonOffsetUnits < 0, 'airport surfaces must not fight terrain depth');
  }
  let meshes = 0;
  airport.traverse(object => {
    if (!object.isMesh) return;
    meshes++; resources.add(object.geometry); resources.add(object.material);
    assert.ok(object.geometry.attributes.position.array.every(Number.isFinite));
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      if (positions.getY(index) > 1) assert.ok(Math.abs(positions.getX(index)) > RUNWAY.width / 2 + 25, 'modeled geometry must leave the runway clear');
    }
  });
  assert.ok(meshes <= 20, `airport uses ${meshes} draw batches`);
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  disposeAircraftObject(airport);
  assert.equal(disposed.size, resources.size);
  assert.ok([...disposed.values()].every(count => count === 1));
});

test('elevated jetways collide at cabin height and permit flight above', () => {
  for (const building of AIRPORT_BUILDINGS.filter(item => item.kind === 'jetway')) {
    const hit = createAircraftFlight('su30', true);
    Object.assign(hit, { x: building.x, z: building.z, y: (building.base + building.height) / 2, speed: 0 });
    updateAircraftFlight(hit, {}, 1 / 120);
    assert.equal(hit.status, 'running'); assert.ok(hit.events.includes('recovery'));
    const above = createAircraftFlight('su30', true);
    Object.assign(above, { x: building.x, z: building.z, y: 200 });
    updateAircraftFlight(above, {}, 1 / 120);
    assert.equal(above.status, 'running');
  }
});

test('airport has three progressively cheaper levels with reversible hysteresis and no rebuild on tuning', () => {
  const airport = createAirportLod(), levels = airport.levels.map(level => level.object);
  const budgets = levels.map(root => {
    let meshes = 0, triangles = 0;
    root.traverse(object => { if (object.isMesh) { meshes++;triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3; } });
    return { meshes, triangles };
  });
  assert.equal(levels.length, 3);
  assert.ok(budgets[0].meshes <= 20);
  assert.ok(budgets[1].triangles < budgets[0].triangles / 4);
  assert.ok(budgets[2].triangles < budgets[1].triangles / 3);
  assert.ok(budgets[2].meshes <= 3);
  const camera = new THREE.PerspectiveCamera();
  setAirportDetailDistance(airport, 1500, 'low');airport.updateMatrixWorld(true);
  const near = airport.levels[1].distance, far = airport.levels[2].distance;
  assert.ok(far > near);
  for (const [distance, expected] of [[0, 0], [near * 1.01, 1], [near * .95, 1], [near * .8, 0], [far * 1.01, 2], [far * .95, 2], [far * .8, 1]]) {
    camera.position.set(0, distance, 0);camera.updateMatrixWorld();airport.update(camera);
    assert.equal(airport.getCurrentLevel(), expected);
  }
  setAirportDetailDistance(airport, 12000, 'high');
  assert.ok(airport.levels[1].distance > near);assert.ok(airport.levels[2].distance > far);
  assert.deepEqual(airport.levels.map(level => level.object), levels);
  disposeAircraftObject(airport);
});

test('runway uses shared dimensions, batched markings, approach and taxiway lights', () => {
  assert.equal(RUNWAY.length, 5000); assert.equal(RUNWAY.width, 60); assert.equal(RUNWAY.shoulder, 15);
  assert.equal(RUNWAY.start - RUNWAY.end, RUNWAY.length);
  assert.equal(RUNWAY.center, (RUNWAY.start + RUNWAY.end) / 2);
  const runway = createRunway(); runway.updateMatrixWorld(true);
  const surface = runway.getObjectByName('runway-surface');
  assert.ok(surface);
  const bounds = new THREE.Box3().setFromObject(surface);
  assert.equal(bounds.min.z, RUNWAY.end); assert.equal(bounds.max.z, RUNWAY.start);
  assert.equal(bounds.max.x - bounds.min.x, RUNWAY.width);
  for (const name of ['runway-markings', 'runway-shoulders', 'runway-approach-lights', 'runway-edge-lights', 'taxiway-edge-lights']) assert.ok(runway.getObjectByName(name), name);
  let meshes = 0;
  runway.traverse(object => { if (object.isMesh) { meshes++; assert.ok(object.geometry.attributes.position.array.every(Number.isFinite)); } });
  assert.ok(meshes <= 12 * AIRPORTS[0].runways.length, `runways need ${meshes} batches`);
  const resources = new Set(), disposed = new Map();
  runway.traverse(object => { if (object.isMesh) { resources.add(object.geometry); resources.add(object.material); } });
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  disposeAircraftObject(runway);
  assert.equal(disposed.size, resources.size); assert.ok([...disposed.values()].every(count => count === 1));
});
