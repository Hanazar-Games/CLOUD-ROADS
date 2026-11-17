import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRCRAFT, createAircraftFlight } from '../../src/aviation/aircraft-flight.js';
import { createAircraftCockpit, updateCockpitControls, cockpitInstruments, cockpitSeat, COCKPIT_SWITCHES } from '../../src/aviation/aircraft-cockpit.js';
import { disposeAircraftObject } from '../../src/aviation/aircraft-models.js';
import { AviationWorld, AVIATION_VIEW_DEFAULTS } from '../../src/aviation/aviation-world.js';

test('narrow flight decks keep the center windshield post connected to its scaled frame', () => {
  for (const aircraft of AIRCRAFT.filter(aircraft => ['airliner', 'transport'].includes(aircraft.cockpit))) {
    const cockpit = createAircraftCockpit(aircraft);
    const width = aircraft.cockpit === 'transport' ? 3.4 : aircraft.length < 50 ? 3.6 : 4.2;
    cockpit.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(.6 * width / 4.2, .75, 0), new THREE.Vector3(0, 0, -1), 1.35, 1.65);
    assert.ok(ray.intersectObject(cockpit, true).length, aircraft.id);
    disposeAircraftObject(cockpit);
  }
});

test('rudder pedals move in opposite directions and retain unchanged instance transforms', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id, true), cockpit = createAircraftCockpit(aircraft);
    const pedals = cockpit.userData.controls.pedals;
    assert.equal(pedals?.count, 2);
    const positions = () => [0, 1].map(index => {
      const matrix = new THREE.Matrix4();pedals.getMatrixAt(index, matrix);
      return new THREE.Vector3().setFromMatrixPosition(matrix).z;
    });
    const rest = positions();
    updateCockpitControls(cockpit, flight, { yaw: 1 });
    const right = positions();
    assert.ok(right[0] > rest[0] && right[1] < rest[1]);
    const version = pedals.instanceMatrix.version;
    updateCockpitControls(cockpit, flight, { yaw: 1 });
    assert.equal(pedals.instanceMatrix.version, version);
    updateCockpitControls(cockpit, flight);
    assert.deepEqual(positions(), rest);
    disposeAircraftObject(cockpit);
  }
});

test('instrument housings and bezels leave the display content visible through panel adjustments', () => {
  for (const aircraft of AIRCRAFT) {
    const cockpit = createAircraftCockpit(aircraft), screen = cockpit.userData.display, panel = cockpit.userData.panel;
    const tiles = ['airliner', 'transport'].includes(aircraft.cockpit) ? 4 : 3;
    for (const scale of [.8, 1, 1.1]) {
      panel.scale.setScalar(scale);panel.position.set(0, -.2, .25);cockpit.updateMatrixWorld(true);
      for (let tile = 0; tile < tiles; tile++) for (const y of [-.2, 0, .2]) {
        const target = screen.localToWorld(new THREE.Vector3((tile + .5 - tiles / 2) * screen.geometry.parameters.width / tiles, y, 0));
        const ray = new THREE.Raycaster(target.clone().add(new THREE.Vector3(0, 0, .04)), new THREE.Vector3(0, 0, -1), .001, .1);
        assert.equal(ray.intersectObject(cockpit, true)[0]?.object, screen, aircraft.id);
      }
    }
    disposeAircraftObject(cockpit);
  }
});

test('each cockpit has a clear forward window, distinct controls and a seat inside its aircraft', () => {
  for (const aircraft of AIRCRAFT) {
    const cockpit = createAircraftCockpit(aircraft);
    cockpit.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), .01, 5);
    assert.equal(ray.intersectObject(cockpit, true).length, 0, 'forward eye line must remain unobstructed');
    assert.ok(cockpit.userData.controls.stick);
    assert.equal(cockpit.userData.controls.throttles.length, aircraft.engines);
    assert.ok(cockpitSeat(aircraft).every(Number.isFinite));
    assert.ok(Math.abs(cockpitSeat(aircraft)[2]) < aircraft.length / 2);
    if (aircraft.cockpit === 'transport') {
      const bounds = new THREE.Box3().setFromObject(cockpit);
      assert.ok(bounds.max.x < 1.9 && bounds.min.x > -1.9, 'copilot seat and console must fit inside the narrower cabin');
    }
    const meshes = []; cockpit.traverse(object => { if (object.isMesh) meshes.push(object); });
    assert.ok(meshes.length < 22, 'cockpit geometry must be batched');
    disposeAircraftObject(cockpit);
  }
});

test('cockpit controls reflect the aircraft and release independently from throttle', () => {
  const flight = createAircraftFlight('a380', true), cockpit = createAircraftCockpit(flight.aircraft);
  flight.throttle = .9; flight.gearDown = true;
  updateCockpitControls(cockpit, flight, { pitch: .5, roll: -.7 });
  const controls = cockpit.userData.controls;
  assert.ok(controls.stick.rotation.x > 0); assert.ok(controls.stick.rotation.z > 0);
  assert.ok(controls.throttles.every(lever => lever.rotation.x < 0));
  const angle = controls.throttles[0].rotation.x;
  updateCockpitControls(cockpit, flight, {});
  assert.ok(Math.abs(controls.stick.rotation.x) < 1e-9); assert.ok(Math.abs(controls.stick.rotation.z) < 1e-9);
  assert.equal(controls.throttles[0].rotation.x, angle);
  disposeAircraftObject(cockpit);
});

test('cockpit switches are clickable instances, show actual state and avoid unchanged color uploads', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id, true), cockpit = createAircraftCockpit(aircraft, null, new THREE.Texture());
    const switches = cockpit.userData.controls.switches;
    assert.equal(switches.count, COCKPIT_SWITCHES.length);
    updateCockpitControls(cockpit, flight);
    const version = switches.instanceColor.version;
    updateCockpitControls(cockpit, flight);assert.equal(switches.instanceColor.version, version);
    flight.systems.engineOn = false;updateCockpitControls(cockpit, flight);assert.equal(switches.instanceColor.version, version + 1);
    const camera = new THREE.PerspectiveCamera(68, 16 / 9, .06, 8);camera.rotation.x = -.08;camera.updateMatrixWorld();cockpit.updateMatrixWorld(true);
    const world = Object.assign(Object.create(AviationWorld.prototype), {
    host: { world: { origin: { x: 0, z: 0 } }, updateWorld() {}, configureEnvironment() {}, resize() {}, renderWorld() {} }, cameraMode: 2, cockpit, cockpitCamera: camera, renderer: { domElement: { getBoundingClientRect: () => ({ left: 40, top: 20, width: 1280, height: 720 }) } } });
    for (let index = 0; index < switches.count; index++) {
      const matrix = new THREE.Matrix4();switches.getMatrixAt(index, matrix);
      const point = new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(switches.matrixWorld);
      camera.lookAt(point);camera.updateMatrixWorld();point.project(camera);
      assert.equal(world.pickCockpitControl(40 + (point.x + 1) * 640, 20 + (1 - point.y) * 360), COCKPIT_SWITCHES[index].action);
    }
    world.cameraMode = 0;assert.equal(world.pickCockpitControl(640, 360), null);
    disposeAircraftObject(cockpit);
  }
});

test('instruments wrap headings and use the same units and warnings as the flight HUD', () => {
  const flight = createAircraftFlight('su30', true);
  Object.assign(flight, { heading: -Math.PI / 2, speed: 200, y: 750, verticalSpeed: -4, stalling: true, gearDown: true, throttle: .7, angleOfAttack: -.3, loadFactor: -2.25 });
  const data = cockpitInstruments(flight);
  assert.equal(data.speed, 720); assert.equal(data.altitude, 750); assert.equal(data.heading, '270');
  assert.equal(data.vertical, '-4.0'); assert.equal(data.throttle, 70); assert.equal(data.warning, 'STALL');
  assert.equal(data.engine, 65, 'engine output must remain distinct from the commanded throttle');
  assert.equal(data.aoa, '-17.2');assert.equal(data.load, '-2.3');
});

test('resized and repositioned panels keep switch picking aligned across all aircraft', () => {
  for (const aircraft of AIRCRAFT) {
    const cockpit = createAircraftCockpit(aircraft, null, new THREE.Texture());
    const panel = cockpit.userData.panel, switches = cockpit.userData.controls.switches;
    const camera = new THREE.PerspectiveCamera(68, 16 / 9, .06, 8);
    const world = Object.assign(Object.create(AviationWorld.prototype), {
    host: { world: { origin: { x: 0, z: 0 } }, updateWorld() {}, configureEnvironment() {}, resize() {}, renderWorld() {} }, cameraMode: 2, cockpit, cockpitCamera: camera, renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } } });
    for (const [scale, height, distance, eyeHeight, eyeForward] of [[.8, -.2, .25, .3, -.2], [1.1, .1, -.2, -.15, .35]]) {
      panel.scale.setScalar(scale);panel.position.set(0, height, distance);cockpit.updateMatrixWorld(true);camera.position.set(0, eyeHeight, eyeForward);
      for (let index = 0; index < switches.count; index++) {
        const matrix = new THREE.Matrix4();switches.getMatrixAt(index, matrix);
        const point = new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(switches.matrixWorld);
        camera.lookAt(point);camera.updateMatrixWorld();point.project(camera);
        assert.equal(world.pickCockpitControl((point.x + 1) * 640, (1 - point.y) * 360), COCKPIT_SWITCHES[index].action, `${aircraft.id}: ${index}`);
      }
    }
    disposeAircraftObject(cockpit);
  }
});

test('new cockpit switches show armed autobrake, active speed hold and unavailable reverse distinctly', () => {
  const flight = createAircraftFlight('a380', true), cockpit = createAircraftCockpit(flight.aircraft);
  const { switches, switchStates } = cockpit.userData.controls;
  const index = action => COCKPIT_SWITCHES.findIndex(control => control.action === action);
  assert.equal(COCKPIT_SWITCHES.length, 22);
  updateCockpitControls(cockpit, flight);
  const inactive = switchStates[index('autobrake')], unavailable = switchStates[index('reverse')];
  flight.systems.autoBrake = 'low';flight.systems.autothrottle.enabled = true;
  const version = switches.instanceColor.version;
  updateCockpitControls(cockpit, flight);
  assert.equal(switches.instanceColor.version, version + 1, 'batch all changed lamps in one upload');
  const armed = switchStates[index('autobrake')];assert.notEqual(armed, inactive);
  flight.systems.autoBrakeActive = true;flight.systems.reverse = true;
  updateCockpitControls(cockpit, flight);
  assert.notEqual(switchStates[index('autobrake')], armed);
  assert.notEqual(switchStates[index('reverse')], unavailable);
  const data = cockpitInstruments(flight);
  assert.equal(data.reverse, true);assert.equal(data.speedHold, true);assert.equal(data.autoBrake, 'LOW');
  disposeAircraftObject(cockpit);
});

test('cockpit lamps mark blocked operations and keep active automation available for disengagement', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createAircraftFlight(aircraft.id), cockpit = createAircraftCockpit(aircraft);
    const color = action => cockpit.userData.controls.switchStates[COCKPIT_SWITCHES.findIndex(control => control.action === action)];
    updateCockpitControls(cockpit, flight);
    for (const action of ['ap-level', 'ap-hold', 'autothrottle', 'gear']) assert.equal(color(action), 0x59646b, `${aircraft.id}: ${action} on the ground`);
    assert.equal(color('parking'), 0x29434c);
    flight.speed = 2;updateCockpitControls(cockpit, flight);
    assert.equal(color('parking'), 0x59646b);
    flight.systems.parkingBrake = true;updateCockpitControls(cockpit, flight);
    assert.equal(color('parking'), 0x4fd6ac, 'engaged parking remains available for release');
    Object.assign(flight, { status: 'running', onGround: false, speed: aircraft.cruiseSpeed, y: 2000, gearDown: false });
    updateCockpitControls(cockpit, flight);
    for (const action of ['ap-level', 'ap-hold', 'autothrottle', 'gear']) assert.equal(color(action), 0x29434c, `${aircraft.id}: ${action} in stable flight`);
    flight.systems.engineOn = false;updateCockpitControls(cockpit, flight);
    for (const action of ['ap-level', 'ap-hold', 'autothrottle', 'go-around']) assert.equal(color(action), 0x59646b);
    flight.systems.autopilot.mode = 'hold';flight.systems.autothrottle.enabled = true;
    updateCockpitControls(cockpit, flight);
    assert.equal(color('ap-hold'), 0x4fd6ac);assert.equal(color('autothrottle'), 0x4fd6ac);
    flight.systems.autopilot.mode = 'off';flight.systems.autothrottle.enabled = false;flight.systems.engineOn = true;
    flight.physics.mode = 'maneuver';updateCockpitControls(cockpit, flight);
    assert.equal(color('ap-level'), 0x59646b);assert.equal(color('ap-hold'), 0x59646b);
    flight.physics.mode = 'assisted';flight.speed = aircraft.stall * .5;updateCockpitControls(cockpit, flight);
    assert.equal(color('ap-level'), 0x59646b);assert.equal(color('ap-hold'), 0x59646b);
    flight.speed = aircraft.flapLimit + 1;updateCockpitControls(cockpit, flight);
    assert.equal(color('flaps'), 0x59646b);
    flight.flaps = 2;updateCockpitControls(cockpit, flight);
    assert.equal(color('flaps'), 0x4fd6ac, 'flaps can always retract at the last setting');
    disposeAircraftObject(cockpit);
  }
});

test('cockpit camera follows the aircraft attitude and side looking preserves its bank', () => {
  const flight = createAircraftFlight('su30', true);
  flight.airport = { ...flight.airport, worldX: 0, worldZ: 0 };
  Object.assign(flight, { x: 800, y: 900, z: -1200, heading: 1.2, pitch: .2, roll: .6 });
  const model = new THREE.Group(); model.userData.gear = []; model.userData.propellers = [];
  const cockpit = createAircraftCockpit(flight.aircraft);
  const passes = [];
  const world = Object.assign(Object.create(AviationWorld.prototype), {
    host: { world: { origin: { x: 0, z: 0 } }, updateWorld() {}, configureEnvironment() {}, resize() {}, renderWorld() {} },
    environmentRoot: new THREE.Group(), aircraftRoot: new THREE.Group(), model, cockpit,
    scene: new THREE.Scene(), cockpitScene: new THREE.Scene(), cockpitCamera: new THREE.PerspectiveCamera(68, 1, .06, 8),
    camera: new THREE.PerspectiveCamera(68, 1, 8, 65000), gateMeshes: [], cameraMode: 2,
    shadow: new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()),
    displayTime: 0, resetCamera: false, lookTarget: 0, lookAngle: 0,
    cockpitTexture: {}, cockpitContext: new Proxy({ canvas: { width: 960, height: 320 } }, { get: (object, key) => object[key] ?? (() => {}) }),
    viewSettings: { ...AVIATION_VIEW_DEFAULTS }, displayHz: 10,
    renderer: { info: { reset() {} }, autoClear: true, clearDepth() {}, render(scene, camera) { passes.push({ scene, near: camera.near, far: camera.far }); } },
  });
  world.host.renderWorld = () => world.renderer.render(world.scene, world.camera);
  world.render(flight, 1 / 60);
  const expected = new THREE.Vector3(...cockpitSeat(flight.aircraft)).applyQuaternion(world.aircraftRoot.quaternion).add(world.aircraftRoot.position);
  assert.ok(world.camera.position.distanceTo(expected) < 1e-8);
  const local = world.aircraftRoot.quaternion.clone().invert().multiply(world.camera.quaternion);
  assert.ok(local.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.08, 0, 0, 'YXZ'))) < 1e-7);
  assert.equal(model.visible, false); assert.equal(cockpit.visible, true);
  assert.deepEqual(passes.map(pass => [pass.near, pass.far]), [[8, 65000], [.06, 8]], 'interior and distant terrain need separate depth ranges');
  assert.equal(world.renderer.autoClear, true);
  flight.systems.controls.roll = .45;world.render(flight, 0);
  assert.ok(cockpit.userData.controls.stick.rotation.z < 0, 'cockpit follows actual trim and autopilot commands');
  world.viewSettings.cockpitFov = 90; world.render(flight, 1 / 60);
  assert.equal(world.camera.fov, 90); assert.equal(world.cockpitCamera.fov, 90);
  assert.equal(world.camera.projectionMatrix.elements[5], world.cockpitCamera.projectionMatrix.elements[5]);
  world.render(flight, 1, .95);
  assert.ok(world.lookAngle > .9);
  flight.physics.mode = 'maneuver';
  for (const [pitch, roll] of [[Math.PI / 2 - .001, .3], [Math.PI / 2 + .001, .3], [0, Math.PI], [-Math.PI / 2, -.8]]) {
    Object.assign(flight, { pitch, roll }); world.lookAngle = 0; world.lookTarget = 0;
    world.render(flight, 1 / 60);
    const expected = world.aircraftRoot.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.08, 0, 0, 'YXZ')));
    assert.ok(world.camera.quaternion.angleTo(expected) < 1e-7, 'cockpit must preserve full loop and inverted attitudes');
  }
  world.setCameraMode(0); world.render(flight, 1 / 60);
  assert.equal(model.visible, true); assert.equal(cockpit.visible, false); assert.equal(world.camera.near, 8);
  assert.equal(world.lookTarget, 0);
  world.viewSettings.speedFov = false; world.render(flight, 1 / 60);
  assert.equal(world.camera.fov, 55);
  const close = world.camera.position.distanceTo(world.aircraftRoot.position);
  world.viewSettings.chaseDistance = 1.6; world.resetCamera = true; world.render(flight, 1 / 60);
  assert.ok(world.camera.position.distanceTo(world.aircraftRoot.position) > close * 1.5);
  world.viewSettings.speedFov = true; world.render(flight, 1 / 60);
  assert.ok(world.camera.fov > 55);
  world.viewSettings.chaseDistance = .7; world.setCameraMode(1); world.render(flight, 1 / 60);
  const clearance = Math.hypot(flight.aircraft.length, flight.aircraft.span) / 2 + world.camera.near + 2;
  assert.ok(world.camera.position.distanceTo(world.aircraftRoot.position) >= clearance - 1e-8, 'closest follow camera must not clip the fighter tail');
  for (let i = 0; i < 80; i++) {
    flight.roll += .1; world.render(flight, 1 / 60);
    assert.ok(world.camera.position.distanceTo(world.aircraftRoot.position) >= clearance - 1e-8, 'camera smoothing must retain clearance during rapid rolls');
    assert.ok(world.camera.up.dot(new THREE.Vector3(0, 1, 0).applyQuaternion(world.aircraftRoot.quaternion)) > .999);
  }
  Object.assign(flight, { y: 8, pitch: 0, roll: Math.PI }); world.resetCamera = true;
  world.render(flight, 1 / 60);
  assert.ok(world.camera.position.y >= 4, 'inverted low-altitude camera must stay above terrain');
  assert.ok(world.camera.position.distanceTo(world.aircraftRoot.position) >= clearance - 1e-8);
  const propeller = new THREE.Group(); model.userData.propellers.push(propeller);
  world.render(flight, .1); assert.ok(propeller.rotation.z > 0);
  flight.status = 'paused'; const propellerAngle = propeller.rotation.z;
  world.render(flight, .1); assert.equal(propeller.rotation.z, propellerAngle);
  disposeAircraftObject(cockpit); disposeAircraftObject(world.shadow);
});

test('cockpit unload releases its shared materials, geometry and display texture once', () => {
  const texture = new THREE.Texture(), labels = new THREE.Texture(), cockpit = createAircraftCockpit(AIRCRAFT[0], texture, labels), counts = new Map();
  const resources = new Set([texture, labels, cockpit.userData.controls.switches]);
  cockpit.traverse(object => { if (object.isMesh) { resources.add(object.geometry); resources.add(object.material); } });
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
  disposeAircraftObject(cockpit);
  assert.equal(counts.size, resources.size); assert.ok([...counts.values()].every(count => count === 1));
});
