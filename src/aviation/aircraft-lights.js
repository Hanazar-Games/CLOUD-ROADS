import * as THREE from 'three';
import { aircraftElectrical } from './aircraft-systems.js';

const transform = new THREE.Object3D();

export function createAircraftLights(aircraft, model = null) {
  const root = new THREE.Group(), L = aircraft.length, S = aircraft.span;
  root.name = 'aircraft-exterior-lights';
  let top = L * .045, bottom = -L * .025;
  const tips = [-1, 1].map(side => new THREE.Vector3(side * S / 2, 0, L * .1));
  if (model) {
    model.updateMatrixWorld(true);
    const inverse = model.matrixWorld.clone().invert(), matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const sums = [new THREE.Vector3(), new THREE.Vector3()], counts = [0, 0];
    const gear = new Set();
    for (const group of model.userData.gear ?? []) group.traverse(object => gear.add(object));
    model.traverse(object => {
      if (!object.isMesh || gear.has(object)) return;
      matrix.multiplyMatrices(inverse, object.matrixWorld);
      const positions = object.geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
        if (Math.abs(point.x) < S * .08 && Math.abs(point.z) < L * .22) { top = Math.max(top, point.y);bottom = Math.min(bottom, point.y); }
        if (Math.abs(point.x) < S * .492) continue;
        const side = point.x < 0 ? 0 : 1;sums[side].add(point);counts[side]++;
      }
    });
    tips.forEach((tip, index) => { if (counts[index]) tip.copy(sums[index]).divideScalar(counts[index]); });
  }
  const radius = Math.max(.07, Math.min(.22, L * .004));
  const fixtures = [
    { key: 'navLights', position: tips[0].toArray(), color: 0xff3525 },
    { key: 'navLights', position: tips[1].toArray(), color: 0x36ff9b },
    { key: 'navLights', position: [0, L * .015, L * .48], color: 0xffffff },
    { key: 'beaconLights', position: [0, top + radius, 0], color: 0xff4020 },
    { key: 'beaconLights', position: [0, bottom - radius, 0], color: 0xff4020 },
    ...[-1, 1].map(side => ({ key: 'landingLights', position: [side * S * .11, -L * .012, -L * .1], color: 0xfff2ce })),
    { key: 'taxiLights', position: [0, -aircraft.gearHeight + .8, -L * .29], color: 0xfff2ce },
  ];
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), fixtures.length);
  lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fixtures.forEach((fixture, index) => {
    transform.position.fromArray(fixture.position);transform.scale.setScalar(1);transform.updateMatrix();lamps.setMatrixAt(index, transform.matrix);
    lamps.setColorAt(index, new THREE.Color(fixture.color));
  });
  // Fixed bounds contain every fixture even while individual lamps are switched off.
  lamps.computeBoundingSphere();root.add(lamps);
  const beam = (name, height, nose, intensity, distance, angle) => {
    const light = new THREE.SpotLight(0xfff1d4, intensity, distance, angle, .65, 2);
    light.name = name;light.position.set(0, height, nose);light.target.position.set(0, height - distance * .12, nose - distance);
    light.visible = false;root.add(light, light.target);return light;
  };
  const landing = beam('landing-beam', -L * .012, -L * .1, 180000, 260, .22);
  const taxi = beam('taxi-beam', -aircraft.gearHeight + .8, -L * .29, 22000, 85, .48);
  root.userData = { lamps, landing, taxi, fixtures, states: [], time: 0 };
  return root;
}

export function updateAircraftLights(root, flight, dt, inside) {
  const data = root.userData, { lamps, landing, taxi, fixtures, states } = data;
  if (['ready', 'running'].includes(flight.status) && Number.isFinite(dt) && dt > 0) data.time = (data.time + Math.min(dt, .25)) % 1.2;
  const powered = aircraftElectrical(flight).powered;
  landing.visible = powered && flight.systems.landingLights;
  const gearLocked = flight.gearDown && flight.gearPosition >= .999;
  taxi.visible = powered && flight.systems.taxiLights && gearLocked;
  lamps.visible = powered && !inside;
  if (!lamps.visible) return;
  let changed = false, any = false;
  fixtures.forEach((fixture, index) => {
    const active = !!flight.systems[fixture.key] && (fixture.key !== 'beaconLights' || data.time < .16 || data.time > .29 && data.time < .39) && (fixture.key !== 'taxiLights' || gearLocked);
    any ||= active;
    if (states[index] === active) return;
    states[index] = active;transform.position.fromArray(fixture.position);transform.scale.setScalar(active ? 1 : 0);transform.updateMatrix();lamps.setMatrixAt(index, transform.matrix);changed = true;
  });
  lamps.visible = any;
  if (changed) lamps.instanceMatrix.needsUpdate = true;
}
