import * as THREE from 'three';
import { airportHeight } from './airport.js';
import { cockpitSeat, cockpitSwitchSpacing, createAircraftCockpit, updateCockpitControls, drawCockpitDisplay, COCKPIT_SWITCHES } from './aircraft-cockpit.js';
import { disposeAircraftObject, loadAircraftModel, updateAircraftGearModel } from './aircraft-models.js';
import { createAircraftLights, updateAircraftLights } from './aircraft-lights.js';
import { aircraftElectrical } from './aircraft-systems.js';

export const AVIATION_ENVIRONMENT_DEFAULTS = Object.freeze({ viewDistance: 30000, detailDistance: 4500, groundDetail: 'low' });

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const forward = new THREE.Vector3(), offset = new THREE.Vector3(), target = new THREE.Vector3();
const cockpitLook = new THREE.Quaternion(), lookRotation = new THREE.Euler(0, 0, 0, 'YXZ');
const cockpitRay = new THREE.Raycaster(), pointer = new THREE.Vector2();
export const AVIATION_CAMERAS = ['追随机位', '近距跟随', '驾驶舱', '机首观察', '左翼观察', '俯视机位', '右翼观察', '尾部观察', '机场总览'];
export const AVIATION_VIEW_DEFAULTS = Object.freeze({
  cockpitFov: 68, exteriorFov: 55, chaseDistance: 1, chaseHeight: 1, orbitAngle: 0, orbitTilt: 0,
  followResponse: 5, lookResponse: 9, lookAngle: 55, speedFov: true, speedFovAmount: 18,
  seatHeight: 0, seatForward: 0, lookPitch: 0, panelScale: 1, panelHeight: 0, panelDistance: 0,
});
const CAMERA_OFFSETS = [[.4, .52, 1.8], [.15, .24, 1.05], null, [.08, .35, -1.8], [-1.8, .35, .08], [0, 2.4, .3], [1.8, .35, .08], [0, .2, 1.45]];

export class AviationWorld {
  constructor(container, host) {
    this.container = container;
    this.host = host; this.scene = host.scene; this.camera = host.camera; this.renderer = host.renderer;
    this.canvasParent = this.renderer.domElement.parentNode; this.canvasNext = this.renderer.domElement.nextSibling;
    this.savedCamera = { near: this.camera.near, far: this.camera.far, fov: this.camera.fov, up: this.camera.up.clone() };
    this.camera.near = 8;
    this.cockpitCamera = new THREE.PerspectiveCamera(68, 1, .06, 8);
    this.cockpitScene = new THREE.Scene();
    this.cockpitScene.add(new THREE.HemisphereLight(0xdbefff, 0x7b8070, 3));
    const cabinLight = new THREE.DirectionalLight(0xffe6c6, 2);
    cabinLight.position.set(-1, 2, 1); this.cockpitScene.add(cabinLight);
    container.append(this.renderer.domElement);
    this.aircraftRoot = new THREE.Group(); this.scene.add(this.aircraftRoot);
    this.cameraMode = 0;
    this.viewSettings = { ...AVIATION_VIEW_DEFAULTS };
    this.cameraLocked = false;
    this.displayHz = 10;
    this.lookTarget = 0; this.lookAngle = 0;
    this.quality = matchMedia('(any-pointer: coarse)').matches ? .75 : 1.25;
    this.buildEnvironment();
    this.setEnvironment();
    this.resize();
  }

  mesh(geometry, color, position, scale = [1, 1, 1], materialOptions = {}) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .85, ...materialOptions }));
    mesh.position.set(...position); mesh.scale.set(...scale); this.environmentRoot.add(mesh);
    return mesh;
  }

  buildEnvironment() {
    const site = this.airportSite ??= this.host.world.airports.sites[0], RUNWAY = site.runway;
    this.environmentRoot = new THREE.Group(); this.scene.add(this.environmentRoot);
    this.gateMeshes = site.gates.map((gate, index) => {
      const mesh = this.mesh(new THREE.TorusGeometry(gate.radius, 5, 6, 56), index ? 0xe5cf91 : 0x57e4e3, [gate.x, gate.y, gate.z], [1, 1, 1], { emissive: index ? 0x463b16 : 0x146e72, emissiveIntensity: .5 });
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...gate.normal));
      return mesh;
    });
    this.shadow = this.mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), 0x1e3441, [0, .65, 0], [30, 1, 15], { transparent: true, opacity: .17, depthWrite: false });
    const beaconPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 160, 0)];
    this.beacon = new THREE.Line(new THREE.BufferGeometry().setFromPoints(beaconPoints), new THREE.LineBasicMaterial({ color: 0xa0f9ed, transparent: true, opacity: .65 }));
    this.beacon.position.set(0, site.elevation, RUNWAY.start - 180); this.environmentRoot.add(this.beacon);
    this.lastGates = undefined;
  }

  setAirport(id) {
    const site = this.host.world.airports.sites.find(airport => airport.id === id) ?? this.host.world.airports.sites[0];
    if (site === this.airportSite) return;
    disposeAircraftObject(this.environmentRoot);
    this.airportSite = site;
    this.buildEnvironment();this.setEnvironment();this.resetCamera = true;
  }

  setEnvironment(settings = {}) {
    const next = { ...AVIATION_ENVIRONMENT_DEFAULTS, ...this.environmentSettings, ...settings };
    for (const [key, low, high] of [['viewDistance', 30000, 160000], ['detailDistance', 1500, 12000]]) {
      next[key] = Number.isFinite(next[key]) ? Math.max(low, Math.min(high, next[key])) : AVIATION_ENVIRONMENT_DEFAULTS[key];
    }
    if (!['low', 'balanced', 'high'].includes(next.groundDetail)) next.groundDetail = 'low';
    if (this.camera.far !== next.viewDistance) { this.camera.far = next.viewDistance;this.camera.updateProjectionMatrix(); }
    this.host.configureEnvironment(next);
    this.environmentSettings = next;
  }

  async setAircraft(aircraft) {
    this.loadController?.abort();
    const controller = new AbortController(); this.loadController = controller;
    if (this.model) { disposeAircraftObject(this.model); this.model = null; }
    if (this.aircraftLights) { disposeAircraftObject(this.aircraftLights); this.aircraftLights = null; }
    if (this.cockpit) { disposeAircraftObject(this.cockpit); this.cockpit = null; }
    const model = await loadAircraftModel(aircraft, controller.signal);
    if (this.disposed || controller !== this.loadController) { disposeAircraftObject(model); return false; }
    this.model = model; this.aircraftRoot.add(model); this.resetCamera = true;
    this.aircraftLights = createAircraftLights(aircraft, model);this.aircraftRoot.add(this.aircraftLights);
    this.cockpitCanvas = document.createElement('canvas'); this.cockpitCanvas.width = ['airliner', 'transport'].includes(aircraft.cockpit) ? 1536 : 960; this.cockpitCanvas.height = 320;
    this.cockpitContext = this.cockpitCanvas.getContext('2d');
    this.cockpitTexture = new THREE.CanvasTexture(this.cockpitCanvas); this.cockpitTexture.colorSpace = THREE.SRGBColorSpace;
    const labels = document.createElement('canvas');labels.width = 128 * COCKPIT_SWITCHES.length;labels.height = Math.round(128 * .045 / (cockpitSwitchSpacing(aircraft) * .68));
    const context = labels.getContext('2d');context.fillStyle = '#14242c';context.fillRect(0, 0, labels.width, labels.height);
    context.fillStyle = '#e0f5ee';context.font = `bold ${Math.round(labels.height * .48)}px monospace`;context.textAlign = 'center';context.textBaseline = 'middle';
    COCKPIT_SWITCHES.forEach((control, index) => context.fillText(control.label, (index + .5) * labels.width / COCKPIT_SWITCHES.length, labels.height / 2));
    const labelsTexture = new THREE.CanvasTexture(labels);labelsTexture.colorSpace = THREE.SRGBColorSpace;
    this.cockpit = createAircraftCockpit(aircraft, this.cockpitTexture, labelsTexture); this.cockpit.visible = false; this.cockpitScene.add(this.cockpit);
    this.displayTime = 1; this.lookAngle = 0; this.lookTarget = 0;
    return true;
  }

  setCameraMode(mode) {
    this.cameraMode = AVIATION_CAMERAS[mode] ? mode : 0;
    this.cameraLocked = false; this.lockedOffset = null;
    this.resetCamera = true; this.lookTarget = 0; this.lookAngle = 0;
    this.viewSettings.orbitTilt = 0;
  }

  orbitCamera(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const view = this.viewSettings;
    if (this.cameraMode === 2) {
      this.lookTarget = THREE.MathUtils.clamp(this.lookTarget - dx * .005, -Math.PI * .85, Math.PI * .85);
      view.lookPitch = THREE.MathUtils.clamp(view.lookPitch - dy * .2, -60, 70);
    } else {
      this.cameraLocked = false; this.lockedOffset = null;
      view.orbitAngle = ((view.orbitAngle - dx * .25 + 180) % 360 + 360) % 360 - 180;
      view.orbitTilt = THREE.MathUtils.clamp(view.orbitTilt + dy * .004, -1.1, 1.1);
    }
  }

  zoomCamera(delta) {
    if (!Number.isFinite(delta)) return;
    if (this.cameraMode === 2) this.viewSettings.cockpitFov = THREE.MathUtils.clamp(this.viewSettings.cockpitFov + delta * .03, 40, 100);
    else this.viewSettings.chaseDistance = THREE.MathUtils.clamp(this.viewSettings.chaseDistance * Math.exp(THREE.MathUtils.clamp(delta * .001, -3, 3)), .6, 5);
  }

  toggleCameraLock() {
    if (this.cameraMode === 2 || this.cameraMode === 8) return false;
    this.cameraLocked = !this.cameraLocked;
    this.lockedOffset = this.cameraLocked && !this.resetCamera ? this.camera.position.clone().sub(this.aircraftRoot.position) : null;
    this.resetCamera = true;
    return this.cameraLocked;
  }

  pickCockpitControl(x, y) {
    if (this.cameraMode !== 2 || !this.cockpit?.visible) return null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height || x < bounds.left || y < bounds.top || x > bounds.left + bounds.width || y > bounds.top + bounds.height) return null;
    pointer.set((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2);
    this.cockpit.updateMatrixWorld(true);this.cockpitCamera.updateMatrixWorld(true);cockpitRay.setFromCamera(pointer, this.cockpitCamera);
    const hit = cockpitRay.intersectObject(this.cockpit.userData.controls.switches, false)[0];
    return hit ? COCKPIT_SWITCHES[hit.instanceId].action : null;
  }

  resize() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    const pixelRatio = Math.min(devicePixelRatio || 1, this.quality);
    const resized = width !== this.width || height !== this.height;
    if (!resized && pixelRatio === this.pixelRatio) return;
    this.renderer.setDrawingBufferSize(width, height, pixelRatio); this.host.resize(width * pixelRatio, height * pixelRatio);
    this.width = width; this.height = height; this.pixelRatio = pixelRatio;
    if (resized) {
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
      this.cockpitCamera.aspect = width / height; this.cockpitCamera.updateProjectionMatrix();
      this.resetCamera = true;
    }
  }

  render(flight, dt, look = null) {
    const length = flight.aircraft.length;
    const clearance = Math.hypot(length, flight.aircraft.span) / 2 + this.camera.near + 2;
    const view = this.viewSettings;
    const inside = this.cameraMode === 2 && flight.status !== 'ready';
    this.host.updateWorld(flight, dt);
    if (this.airportSite && this.airportSite !== flight.airport) this.setAirport(flight.airport.id);
    const origin = this.host.world.origin, site = flight.airport;
    const dx = site.worldX - origin.x, dz = site.worldZ - origin.z;
    this.environmentRoot.position.set(dx, 0, dz);
    if (this.beacon) {
      const runway = site.runways[flight.runwayIndex];
      this.beacon.visible = !!this.navigationHome;
      this.beacon.position.set(runway.x, site.elevation, runway.start - 180);
    }
    this.aircraftRoot.position.set(flight.x + dx, flight.y + (flight.onGround ? Math.max(0, Math.sin(flight.pitch)) * length * .12 : 0), flight.z + dz);
    this.aircraftRoot.rotation.set(flight.pitch, -flight.heading, -flight.roll, 'YXZ');
    if (this.aircraftLights) updateAircraftLights(this.aircraftLights, flight, dt, inside);
    if (this.model) {
      this.model.visible = !inside;
      updateAircraftGearModel(this.model, flight.gearPosition);
      if (flight.status === 'running') for (const propeller of this.model.userData.propellers) propeller.rotation.z = (propeller.rotation.z + flight.engineOutput * dt * 70) % (Math.PI * 2);
    }
    if (this.lastGates !== flight.gates || this.lastTraining !== this.trainingEnabled) {
      this.lastGates = flight.gates;
      this.lastTraining = this.trainingEnabled;
      this.gateMeshes.forEach((mesh, index) => {
        mesh.visible = !!this.trainingEnabled && index >= flight.gates;
        const active = index === flight.gates;
        mesh.material.color.set(active ? 0x57e4e3 : 0xe5cf91);
        mesh.material.emissive.set(active ? 0x146e72 : 0x463b16);
      });
    }
    const ground = airportHeight(flight.x, flight.z, flight.airport);
    this.shadow.position.set(flight.x, Math.max(-11.8, ground + .7), flight.z);
    this.shadow.scale.set(flight.aircraft.span * .48, 1, length * .35);
    this.shadow.rotation.y = -flight.heading;
    this.shadow.material.opacity = .18 * Math.max(0, 1 - (flight.y - ground) / 400);
    forward.set(0, 0, -1).applyQuaternion(this.aircraftRoot.quaternion);
    target.copy(this.aircraftRoot.position).addScaledVector(forward, length * .12);
    if (flight.status === 'ready') offset.set(length * 1.4, length * .5, -length * 1.1);
    else {
      offset.fromArray(CAMERA_OFFSETS[this.cameraMode] || CAMERA_OFFSETS[0]);
      offset.applyAxisAngle(RIGHT, view.orbitTilt);
      offset.y *= view.chaseHeight;
      offset.multiplyScalar(length * view.chaseDistance).applyAxisAngle(UP, view.orbitAngle * Math.PI / 180).clampLength(clearance, Infinity);
      if (flight.physics.mode === 'maneuver') offset.applyQuaternion(this.aircraftRoot.quaternion);
      else offset.applyAxisAngle(UP, -flight.heading);
    }
    if (this.cockpit) this.cockpit.visible = inside;
    if (inside && this.cockpit) {
      offset.set(...cockpitSeat(flight.aircraft)).applyQuaternion(this.aircraftRoot.quaternion);
      this.cockpit.position.copy(this.aircraftRoot.position).add(offset); this.cockpit.quaternion.copy(this.aircraftRoot.quaternion);
      offset.set(0, view.seatHeight, view.seatForward).applyQuaternion(this.aircraftRoot.quaternion);
      this.camera.position.copy(this.cockpit.position).add(offset);
      this.cockpit.userData.panel.scale.setScalar(view.panelScale);
      this.cockpit.userData.panel.position.set(0, view.panelHeight, view.panelDistance);
      this.lookAngle += ((look ?? this.lookTarget) - this.lookAngle) * (this.resetCamera ? 1 : 1 - Math.exp(-dt * view.lookResponse));
      this.lookPitchAngle ??= view.lookPitch;
      this.lookPitchAngle += (view.lookPitch - this.lookPitchAngle) * (this.resetCamera ? 1 : 1 - Math.exp(-dt * view.lookResponse));
      cockpitLook.setFromEuler(lookRotation.set(-.08 + this.lookPitchAngle * Math.PI / 180, this.lookAngle, 0));
      this.camera.quaternion.copy(this.aircraftRoot.quaternion).multiply(cockpitLook);
      updateCockpitControls(this.cockpit, flight, flight.systems.controls);
      const powered = aircraftElectrical(flight).avionics;
      this.displayTime = powered ? this.displayTime + dt : 0;
      const interval = 1 / this.displayHz;
      if (powered && (this.displayTime + 1e-9 >= interval || !this.displayPowered || this.resetCamera || flight.status !== 'running')) {
        drawCockpitDisplay(this.cockpitContext, flight); this.cockpitTexture.needsUpdate = true;
        this.displayTime = this.resetCamera || !this.displayPowered ? 0 : Math.max(0, this.displayTime - Math.floor((this.displayTime + 1e-9) / interval) * interval);
      }
      this.displayPowered = powered;
    } else if (this.cameraMode === 8) {
      target.set(dx + (site.id === 'coast' ? 1050 : 0), site.elevation, dz + site.runway.center);
      offset.set(0, 5800, 4500).applyAxisAngle(RIGHT, view.orbitTilt).applyAxisAngle(UP, view.orbitAngle * Math.PI / 180).multiplyScalar(Math.min(view.chaseDistance, this.camera.far / 10000));
      this.camera.position.copy(target).add(offset);
      this.camera.position.y = Math.max(this.camera.position.y, site.elevation + 1200, airportHeight(this.camera.position.x - dx, this.camera.position.z - dz, site) + 200);
      this.camera.up.copy(UP); this.camera.lookAt(target);
    } else {
      if (this.cameraLocked && flight.status !== 'ready') {
        this.lockedOffset ??= offset.clone();
        offset.copy(this.lockedOffset); target.copy(this.aircraftRoot.position);
      }
      const desired = offset.add(this.aircraftRoot.position);
      desired.y = Math.max(desired.y, Math.max(-12, airportHeight(desired.x - dx, desired.z - dz, flight.airport)) + 4);
      this.camera.position.lerp(desired, this.resetCamera || this.cameraLocked ? 1 : 1 - Math.exp(-dt * view.followResponse));
      offset.copy(this.camera.position).sub(this.aircraftRoot.position).clampLength(clearance, Infinity);
      this.camera.position.copy(this.aircraftRoot.position).add(offset);
      const floor = Math.max(-12, airportHeight(this.camera.position.x - dx, this.camera.position.z - dz, flight.airport)) + 4;
      if (this.camera.position.y < floor) this.camera.position.y = Math.max(floor, this.aircraftRoot.position.y + Math.sqrt(Math.max(0, clearance ** 2 - offset.x ** 2 - offset.z ** 2)));
      this.camera.up.set(0, 1, 0);
      if (!this.cameraLocked && flight.status !== 'ready' && flight.physics.mode === 'maneuver') this.camera.up.applyQuaternion(this.aircraftRoot.quaternion);
      this.camera.lookAt(target);
    }
    const fov = inside ? view.cockpitFov : view.exteriorFov + (view.speedFov ? Math.min(view.speedFovAmount, flight.speed / flight.performance.maxSpeed * view.speedFovAmount) : 0);
    if (Math.abs(this.camera.fov - fov) > .1) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (inside && Math.abs(this.cockpitCamera.fov - fov) > .1) { this.cockpitCamera.fov = fov; this.cockpitCamera.updateProjectionMatrix(); }
    this.resetCamera = false;
    this.host.renderWorld(dt, flight, this.cameraMode);
    if (inside && this.cockpit) {
      this.cockpitCamera.position.copy(this.camera.position); this.cockpitCamera.quaternion.copy(this.camera.quaternion);
      this.renderer.autoClear = false; this.renderer.clearDepth();
      this.renderer.render(this.cockpitScene, this.cockpitCamera); this.renderer.autoClear = true;
    }
  }

  dispose() {
    this.disposed = true; this.loadController?.abort();
    disposeAircraftObject(this.environmentRoot); disposeAircraftObject(this.aircraftRoot);
    disposeAircraftObject(this.cockpitScene);
    Object.assign(this.camera, { near: this.savedCamera.near, far: this.savedCamera.far, fov: this.savedCamera.fov });
    this.camera.up.copy(this.savedCamera.up); this.camera.updateProjectionMatrix();
    this.canvasParent.insertBefore(this.renderer.domElement, this.canvasNext?.parentNode === this.canvasParent ? this.canvasNext : null);
  }
}
