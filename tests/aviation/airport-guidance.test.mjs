import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRPORTS } from '../../src/aviation/airport.js';
import { createAirport } from '../../src/aviation/airport-view.js';
import { createRunway } from '../../src/aviation/runway-view.js';
import { disposeAircraftObject } from '../../src/aviation/aircraft-models.js';

function hits(root, x, z, elevation = 0) {
  return new THREE.Raycaster(new THREE.Vector3(x, elevation + 2, z), new THREE.Vector3(0, -1, 0), 0, 3).intersectObject(root, true);
}

test('all taxiway pavement stays clear of airport buildings', () => {
  for (const airport of AIRPORTS) for (const taxiway of airport.taxiways) for (const building of airport.buildings) {
    assert.ok(Math.abs(taxiway.x - building.x) >= (taxiway.width + building.width) / 2
      || Math.abs(taxiway.z - building.z) >= (taxiway.depth + building.depth) / 2, `${airport.id}: taxiway overlaps ${building.kind} at ${building.x}, ${building.z}`);
  }
});

test('runway shoulders and side stripes leave every taxiway junction open', () => {
  for (const airport of AIRPORTS) {
    const model = createRunway(airport); model.updateMatrixWorld(true);
    airport.runways.forEach((runway, index) => {
      const strip = model.children[index];
      for (const taxiway of airport.taxiways.filter(item => item.width > item.depth)) for (const side of [-1, 1]) {
        const x = runway.x + side * (runway.width / 2 + runway.shoulder / 2);
        if (x <= taxiway.x - taxiway.width / 2 || x >= taxiway.x + taxiway.width / 2) continue;
        assert.equal(hits(strip.getObjectByName('runway-shoulders'), x, taxiway.z, airport.elevation).length, 0, `${airport.id}: shoulder blocks exit`);
        assert.equal(hits(strip.getObjectByName('runway-markings'), runway.x + side * (runway.width / 2 - .75), taxiway.z, airport.elevation).length, 0, `${airport.id}: stripe crosses exit`);
      }
    });
    disposeAircraftObject(model);
  }
});

test('taxiway edge lights stay outside other taxiways and aprons', () => {
  for (const airport of AIRPORTS) {
    const model = createRunway(airport); model.updateMatrixWorld(true);
    model.traverse(object => {
      if (object.name !== 'taxiway-edge-lights') return;
      for (const mesh of object.children) {
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const point = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i));
          assert.ok(!airport.pavements.some(pad => Math.abs(point.x - pad.x) < pad.width / 2 - .1 && Math.abs(point.z - pad.z) < pad.depth / 2 - .1), `${airport.id}: blue light inside active pavement`);
        }
      }
    });
    disposeAircraftObject(model);
  }
});

test('taxiway centerlines stay continuous and central terminal stands have lead-in guidance', () => {
  const model = createAirport(); model.updateMatrixWorld(true);
  const yellow = model.getObjectByName('airport-pavement').children.filter(mesh => mesh.material.color.getHex() === 0xceb161);
  const guidance = new THREE.Group(); guidance.add(...yellow.map(mesh => mesh.clone())); guidance.updateMatrixWorld(true);
  for (let z = -1780; z <= -1500; z += 3) assert.ok(hits(guidance, -170, z).length, `centerline gap at ${z}`);
  for (const z of [-1150, -850, -550, -250, 50]) {
    assert.ok(hits(guidance, 1380, z + 65).length, 'central stand needs a lead-in');
    assert.ok(hits(guidance, 1235, z + 65).length, 'central stand needs a stop line');
  }
  disposeAircraftObject(model);
});

test('runway paint uses flat geometry to keep both runways inexpensive', () => {
  const model = createRunway();
  model.traverse(object => {
    if (object.name !== 'runway-markings') return;
    for (const mesh of object.children) {
      const normals = mesh.geometry.attributes.normal;
      for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > .99, 'paint should not contain invisible side and bottom faces');
    }
  });
  disposeAircraftObject(model);
});
