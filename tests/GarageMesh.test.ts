import { expect, it } from 'vitest';
import { Mesh, Raycaster, Scene, Vector3 } from 'three';
import { Garage } from '../src/garage/Garage';
import { GarageMesh } from '../src/garage/GarageMesh';
import { ParkedVehicles } from '../src/service/ParkedVehicles';

it('matches visible ramp and landing surfaces to physics, including their upward-facing normals', () => {
  const garage = new Garage('garage-mesh', { x: 5000, y: 100, z: -3000 }), scene = new Scene(), mesh = new GarageMesh(scene, garage);
  const origin = { x: 4096, z: -2048 }, camera = { x: 904, y: 140, z: -952 };
  mesh.update(origin, camera);
  mesh.root.traverse(object => { object.visible = true; }); mesh.root.updateMatrixWorld(true);
  const solids: Mesh[] = []; mesh.root.traverse(object => { if (object instanceof Mesh && object.name === 'garage-concrete') solids.push(object); });
  const ray = new Raycaster();
  const points = Array.from({ length: 5 }, (_, floor) => Array.from({ length: 32 }, (_, i) => garage.rampPoint(floor, (i + 0.5) / 32))).flat();
  points.push(garage.point(64, -60, 0), garage.point(64, 60, -30));
  for (const p of points) {
    ray.set(new Vector3(p.x - origin.x, p.y + 0.5, p.z - origin.z), new Vector3(0, -1, 0));
    const hit = ray.intersectObjects(solids, false)[0]; expect(hit).toBeDefined();
    expect(hit.point.y).toBeCloseTo(p.y, 2); expect(hit.face!.normal.y).toBeGreaterThan(0.993);
  }
  mesh.dispose(); expect(scene.children).toHaveLength(0);
});

it('culls distant rooms and releases every geometry and sign atlas on world replacement', () => {
  const garage = new Garage('garage-mesh', { x: 0, y: 100, z: 0 }), scene = new Scene(), model = new GarageMesh(scene, garage);
  model.update({ x: 0, z: 0 }, { x: 0, y: 71.65, z: 0 });
  expect(model.root.getObjectByName('garage-B1')!.visible).toBe(false);
  expect(model.root.getObjectByName('garage-B4')!.visible).toBe(true);
  expect(model.root.getObjectByName('garage-B5')!.visible).toBe(true);
  let count = 0, disposed = 0;
  model.root.traverse(object => { if (object instanceof Mesh) { count++; object.geometry.addEventListener('dispose', () => disposed++); } });
  model.update({ x: 0, z: 0 }, { x: 5000, y: 100, z: 0 }); expect(model.root.visible).toBe(false);
  model.dispose(); expect(disposed).toBe(count); expect(scene.children).toHaveLength(0);
});

it('still renders and supports a garage vehicle after it is driven out and parked on the road', () => {
  const garage = new Garage('garage-return', { x: 0, y: 100, z: 0 }), scene = new Scene(), renderer = new ParkedVehicles(scene, 'garage-return');
  garage.configure(100, 'sedan', true); renderer.fleet.sync([], garage.entries);
  const entry = renderer.fleet.entries[0], car = renderer.fleet.take(entry.id)!;
  car.reset(10000, 20000, 0, () => ({ height: 500, grip: 1 })); renderer.fleet.park(car, entry.id);
  renderer.update([], { x: 8192, z: 18432 }, new Vector3(1808, 503, 1568), garage);
  expect(renderer.drawBatches).toBe(1);
  expect(renderer.fleet.support(car.x, car.z, Infinity)).toBeGreaterThan(501);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});

it('loads all floor details on demand, releases inactive floors and keeps a bounded local light pool', () => {
  const garage = new Garage('loading', { x: 0, y: 100, z: 0 }), scene = new Scene(), model = new GarageMesh(scene, garage);
  const camera = { x: 0, y: 83.7, z: 0 }, origin = { x: 0, z: 0 };
  model.update(origin, camera); expect(model.loadedFloors).toBe(3);
  expect(model.root.getObjectByName('garage-B1')!.children).toHaveLength(0);
  garage.loading = 'all'; model.update(origin, camera); expect(model.loadedFloors).toBe(6);
  let disposed = 0;
  model.root.getObjectByName('garage-B1')!.traverse(object => { if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => disposed++); });
  garage.loading = 'floor'; model.update(origin, camera);
  expect(disposed).toBeGreaterThan(0); expect(model.loadedFloors).toBe(3);
  garage.light = 1.8; model.update(origin, camera);
  expect(scene.children.find(o => o.type === 'HemisphereLight')).toMatchObject({ intensity: 3.06, visible: true });
  expect(model.root.children.filter(o => o.type === 'PointLight' && o.visible)).toHaveLength(4);
  model.dispose(); expect(scene.children).toHaveLength(0);
});

it('renders every floor of the parked fleet in all-floor mode and culls it again in floor mode', () => {
  const garage = new Garage('all-cars', { x: 0, y: 100, z: 0 }), scene = new Scene(), renderer = new ParkedVehicles(scene, 'all-cars');
  garage.configure(100, 'sedan', true);
  const camera = new Vector3(0, 83.7, 0), origin = { x: 0, z: 0 };
  renderer.update([], origin, camera, garage);
  const count = () => scene.children.reduce((sum, o) => sum + ('count' in o ? Number(o.count) : 0), 0);
  expect(count()).toBe(99);
  garage.loading = 'all'; renderer.update([], origin, camera, garage); expect(count()).toBe(165);
  garage.loading = 'floor'; renderer.update([], origin, camera, garage); expect(count()).toBe(99);
  renderer.dispose();
});

it('grows a shared vehicle batch when all nearby garages exceed 256 vehicles of one kind', () => {
  const garage = new Garage('capacity', { x: 0, y: 100, z: 0 });
  const annex = new Garage('capacity', { x: 300, y: 100, z: 0 }, 3, 'annex');
  const scene = new Scene(), renderer = new ParkedVehicles(scene, 'capacity'); renderer.detailDistance = 600;
  for (const g of [garage, annex]) { g.configure(100, 'sedan', true); g.loading = 'all'; }
  for (let i = 0; i < 2; i++) renderer.update([], { x: 0, z: 0 }, new Vector3(0, 83.7, 0), garage, [annex]);
  expect(scene.children.reduce((sum, o) => sum + ('count' in o ? Number(o.count) : 0), 0)).toBe(264);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});
