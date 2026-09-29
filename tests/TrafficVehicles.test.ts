import { expect, it } from 'vitest';
import { InstancedMesh, Scene } from 'three';
import { TrafficVehicles } from '../src/traffic/TrafficVehicles';
import { MAX_TRAFFIC, TrafficSystem } from '../src/traffic/TrafficSystem';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

it('keeps every articulated side signal within the shared lamp budget at maximum traffic', () => {
  const scene = new Scene(), traffic = new TrafficSystem('lamps', DEFAULT_OPTIONS), renderer = new TrafficVehicles(scene, traffic);
  const car = new VehiclePhysics('roadTrain'); car.reset(0, 0, 0, () => ({ height: 0, grip: 1 }));
  for (let i = 0; i < MAX_TRAFFIC; i++) traffic.entries.push({ id: String(i), car, routeId: 'root', distance: 0, direction: 1, cruise: 15, lane: 0, offset: 0, signal: 1, cooldown: 0 });
  renderer.update({ x: 0, z: 0 }, 1);
  const lamps = scene.getObjectByName('traffic-lamps') as InstancedMesh;
  expect(lamps.count).toBeGreaterThan(MAX_TRAFFIC * 24);
  expect(lamps.count).toBeLessThanOrEqual(lamps.instanceMatrix.count);
  expect([...lamps.instanceMatrix.array].every(Number.isFinite)).toBe(true);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});

it('reduces distant traffic geometry without losing bodies or changing simulation state', () => {
  const scene = new Scene(), traffic = new TrafficSystem('lod', DEFAULT_OPTIONS), renderer = new TrafficVehicles(scene, traffic);
  for (const [i, kind] of (['sedan', 'semi20', 'minibus'] as const).entries()) {
    const car = new VehiclePhysics(kind); car.reset(i * 10, 0, 0, () => ({ height: 0, grip: 1 }));
    traffic.entries.push({ id: String(i), car, routeId: 'root', distance: 0, direction: 1, cruise: 15, lane: 0, offset: 0, signal: 0, cooldown: 0 });
  }
  const bodies = () => scene.children.filter(o => /^traffic-.+:(near|far)-/.test(o.name)) as InstancedMesh[];
  const count = () => bodies().reduce((n, m) => n + m.count, 0);
  const vertices = () => bodies().reduce((n, m) => n + m.count * m.geometry.getAttribute('position').count, 0);
  for (let i = 0; i < 3; i++) renderer.update({ x: 0, z: 0 }, 0);
  expect(count()).toBe(4); const detailed = vertices(), positions = traffic.entries.map(e => [e.car.x, e.car.y, e.car.z]);
  for (let i = 0; i < 3; i++) { renderer.update({ x: 0, z: 0 }, 0, { x: 800, z: 0 }); expect(count()).toBe(4); }
  expect(vertices()).toBeLessThan(detailed * 0.05);
  expect(traffic.entries.map(e => [e.car.x, e.car.y, e.car.z])).toEqual(positions);
  renderer.update({ x: 0, z: 0 }, 1); expect(count()).toBe(4); expect(vertices()).toBe(detailed);
  traffic.clear(); renderer.update({ x: 0, z: 0 }, 0); expect(scene.children.every(o => !o.visible)).toBe(true);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});
