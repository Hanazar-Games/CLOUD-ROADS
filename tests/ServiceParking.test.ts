import { expect, it } from 'vitest';
import { parkingSlots, parkedAt } from '../src/service/ServiceParking';
import { ParkedFleet } from '../src/service/ParkedFleet';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';
import type { ServiceArea } from '../src/service/ServicePlanner';
import { constrainObstacle } from '../src/service/ServiceCollision';
import { Color, InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { ParkedVehicles } from '../src/service/ParkedVehicles';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

it('refreshes visible instances when different cars of the same kind swap across the draw boundary', () => {
  const scene = new Scene(), renderer = new ParkedVehicles(scene, 'boundary'), camera = new Vector3();
  for (const x of [-1590, 1610]) {
    const car = new VehiclePhysics('sedan'); car.reset(x, 0, 0, () => ({ height: 0, grip: 1 })); renderer.fleet.park(car);
  }
  renderer.update([], { x: 0, z: 0 }, camera);
  const mesh = scene.children[0] as InstancedMesh, matrix = new Matrix4();
  mesh.getMatrixAt(0, matrix); expect(matrix.elements[12] + mesh.position.x).toBe(-1590);
  camera.x = 20; renderer.update([], { x: 0, z: 0 }, camera);
  mesh.getMatrixAt(0, matrix); expect(mesh.count).toBe(1); expect(matrix.elements[12] + mesh.position.x).toBe(1610);
  renderer.dispose();
});

const site = { id: 1, sample: { routeId: 'root' }, ground: { pads: [{ x: 1000, y: 200, z: -15000, heading: 0.4, grade: 0.02, side: 1, halfWidth: 80, halfLength: 110 }] } } as ServiceArea;
it('provides large separated parking zones and reproducible occupied bays matching each vehicle class', () => {
  const slots = parkingSlots(); expect(slots.length).toBeGreaterThan(90);
  expect(new Set(slots.map(s => s.zone)).size).toBe(5);
  const cars = parkedAt('rest', site), again = parkedAt('rest', site);
  expect(cars).toEqual(again); expect(cars).not.toEqual(parkedAt('different', site));
  expect(cars.length).toBeGreaterThan(25); expect(cars.length).toBeLessThan(slots.length);
  expect(new Set(cars.map(car => car.paint)).size).toBeGreaterThan(5);
  for (const car of cars) {
    const slot = slots[car.slot]; expect(slot.kinds).toContain(car.kind);
    expect(vehicleProfiles[car.kind].length).toBeLessThan(slot.length);
    expect(vehicleProfiles[car.kind].width).toBeLessThan(slot.width);
  }
});
it('takes an exact parked vehicle once, retains a returned vehicle and clears runtime state with the world', () => {
  const fleet = new ParkedFleet('rest'); fleet.sync([site]);
  const entry = fleet.entries[0], car = fleet.vehicle(entry);
  expect(car.paint).toBe(entry.paint);
  const total = fleet.entries.length;
  expect(fleet.take(entry.id)).toBe(car); expect(fleet.entries).toHaveLength(total - 1);
  expect(fleet.take(entry.id)).toBeUndefined(); fleet.sync([site]); expect(fleet.entries).toHaveLength(total - 1);
  car.x += 15; car.trip = 123; fleet.park(car, entry.id);
  expect(fleet.entries.find(e => e.id === entry.id)?.paint).toBe(entry.paint);
  expect(fleet.take(entry.id)).toBe(car); expect(car.trip).toBe(123);
  expect(new ParkedFleet('rest').entries).toHaveLength(0);
});
it('blocks a vehicle or pedestrian entering a parked body but allows leaving an existing overlap', () => {
  const obstacle = { x: 10, z: 20, heading: Math.PI / 2, width: 2, front: 3, rear: -3 };
  const body = { x: 10, z: 20.5 };
  expect(constrainObstacle(body, 10, 23, 0.4, obstacle)).toBe(true); expect(body.z).toBeCloseTo(21.4);
  expect(constrainObstacle({ x: 10, z: 20.8 }, 10, 20.2, 0.4, obstacle)).toBe(false);
});
it('batches a populated parking lot by vehicle kind, removes claimed instances and releases GPU resources', () => {
  const scene = new Scene(), renderer = new ParkedVehicles(scene, 'rest'), camera = new Vector3(1000, 200, -15000);
  for (let i = 0; i < 32; i++) renderer.update([site], { x: 0, z: 0 }, camera);
  expect(renderer.drawBatches).toBeLessThanOrEqual(31); expect(renderer.drawBatches).toBeGreaterThan(5);
  const count = () => scene.children.reduce((n, mesh) => n + Number((mesh as unknown as { count: number }).count), 0);
  expect(count()).toBe(renderer.fleet.entries.reduce((n, e) => n + ('trailers' in vehicleProfiles[e.kind] ? 2 : 1), 0));
  for (const object of scene.children) {
    const mesh = object as InstancedMesh, mask = mesh.geometry.getAttribute('paintMask'), colors = mesh.geometry.getAttribute('color');
    expect(mask.array.some(value => value === 1)).toBe(true);
    expect(mask.array.some(value => value === 0)).toBe(true);
    for (let i = 0; i < mask.count; i++) if (mask.getX(i)) expect(colors.getX(i)).toBe(1);
    const kind = mesh.name.split(':')[0], entries = renderer.fleet.entries.filter(e => e.kind === kind), color = new Color();
    for (let i = 0; i < mesh.count; i++) { mesh.getColorAt(i, color); expect(color.getHex()).toBe(entries[i].paint); }
  }
  const before = count(); renderer.fleet.take(renderer.fleet.entries[0].id); renderer.update([site], { x: 0, z: 0 }, camera);
  expect(count()).toBe(before - 1); renderer.dispose(); expect(scene.children).toHaveLength(0);
});
it('keeps the fleet visible during LOD construction and substantially reduces distant triangles', () => {
  const scene = new Scene(), renderer = new ParkedVehicles(scene, 'rest'), camera = new Vector3(1000, 200, -15000);
  const update = () => renderer.update([site], { x: 0, z: 0 }, camera);
  const count = () => scene.children.reduce((sum, object) => sum + (object as InstancedMesh).count, 0);
  const vertices = () => scene.children.reduce((sum, object) => {
    const mesh = object as InstancedMesh; return sum + mesh.count * mesh.geometry.getAttribute('position').count;
  }, 0);
  for (let i = 0; i < 40; i++) update();
  const expected = count(), detailed = vertices();
  camera.x += 800;
  for (let i = 0; i < 40; i++) { update(); expect(count()).toBe(expected); }
  expect(vertices()).toBeLessThan(detailed * 0.05);
  camera.x -= 800; update(); expect(count()).toBe(expected); expect(vertices()).toBe(detailed);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});

it('retains an articulated trailer pose when a borrowed semi is returned to the static fleet', () => {
  const scene = new Scene(), renderer = new ParkedVehicles(scene, 'rest');
  renderer.fleet.sync([site]);
  const entry = renderer.fleet.entries.find(e => 'trailers' in vehicleProfiles[e.kind])!;
  const car = renderer.fleet.take(entry.id)!, trailer = car.trailers[0]!;
  trailer.heading = 1.2; trailer.x += 8; trailer.z += 4;
  renderer.fleet.park(car, entry.id);
  const camera = new Vector3(car.x, car.y + 10, car.z), matrix = new Matrix4();
  for (let i = 0; i < 32; i++) renderer.update([site], { x: 0, z: 0 }, camera);
  const mesh = scene.getObjectByName(`${car.kind}:trailer`) as InstancedMesh;
  expect(mesh).toBeDefined(); mesh.getMatrixAt(mesh.count - 1, matrix);
  expect(matrix.elements[12] + mesh.position.x).toBeCloseTo(trailer.x, 3);
  expect(matrix.elements[14] + mesh.position.z).toBeCloseTo(trailer.z, 3);
  expect(Math.atan2(-matrix.elements[8], matrix.elements[10])).toBeCloseTo(trailer.heading, 3);
  renderer.dispose();
});
