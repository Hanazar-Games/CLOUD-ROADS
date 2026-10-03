import { expect, it } from 'vitest';
import { parkingSlots, parkedAt } from '../src/service/ServiceParking';
import { ParkedFleet } from '../src/service/ParkedFleet';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';
import type { ServiceArea } from '../src/service/ServicePlanner';
import { constrainObstacle } from '../src/service/ServiceCollision';
import { Color, InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { ParkedVehicles } from '../src/service/ParkedVehicles';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { ModelLoadQueue } from '../src/render/ModelLoadQueue';

function loadModels(update: () => void, queue: ModelLoadQueue): void {
  for (let frame = 0; frame < 1000; frame++) {
    update(); queue.pump();
    if (!queue.pending) { update(); return; }
  }
  throw new Error('Parked models did not finish loading');
}

it('refreshes visible instances when different cars of the same kind swap across the draw boundary', () => {
  const scene = new Scene(), renderer = new ParkedVehicles(scene, 'boundary'), camera = new Vector3();
  for (const x of [-1590, 1610]) {
    const car = new VehiclePhysics('sedan'); car.reset(x, 0, 0, () => ({ height: 0, grip: 1 })); renderer.fleet.park(car);
  }
  renderer.update([], { x: 0, z: 0 }, camera);
  const mesh = scene.children.find(object => object.name.startsWith('sedan')) as InstancedMesh, matrix = new Matrix4();
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
  const scene = new Scene(), queue = new ModelLoadQueue(() => 0), renderer = new ParkedVehicles(scene, 'rest', 9.81, queue), camera = new Vector3(1000, 200, -15000);
  loadModels(() => renderer.update([site], { x: 0, z: 0 }, camera), queue);
  expect(renderer.drawBatches).toBeLessThanOrEqual(31); expect(renderer.drawBatches).toBeGreaterThan(5);
  const count = () => scene.children.reduce((n, mesh) => n + Number((mesh as unknown as { count: number }).count), 0);
  expect(count()).toBe(renderer.fleet.entries.reduce((n, e) => n + ('trailers' in vehicleProfiles[e.kind] ? 2 : 1), 0));
  for (const object of scene.children.filter(object => object !== renderer.fogLamps.mesh)) {
    const mesh = object as InstancedMesh, mask = mesh.geometry.getAttribute('paintMask'), colors = mesh.geometry.getAttribute('color');
    expect(mask.array.some(value => value === 1)).toBe(true);
    expect(mask.array.some(value => value === 0)).toBe(true);
    for (let i = 0; i < mask.count; i++) if (mask.getX(i)) expect(colors.getX(i)).toBe(1);
    const kind = mesh.name.split(':')[0], entries = renderer.fleet.entries.filter(e => e.kind === kind), color = new Color(), matrix = new Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); mesh.getColorAt(i, color);
      const entry = entries.find(e => {
        const car = renderer.fleet.vehicle(e), body = mesh.name.endsWith(':trailer') ? car.trailers[0] : car;
        return Math.abs(body.x - matrix.elements[12] - mesh.position.x) < 0.01 && Math.abs(body.z - matrix.elements[14] - mesh.position.z) < 0.01;
      });
      expect(entry).toBeDefined(); expect(color.getHex()).toBe(entry!.paint);
    }
  }
  const before = count(); renderer.fleet.take(renderer.fleet.entries[0].id); renderer.update([site], { x: 0, z: 0 }, camera);
  expect(count()).toBe(before - 1); renderer.dispose(); expect(scene.children).toHaveLength(0);
});
it('keeps the fleet visible during LOD construction and substantially reduces distant triangles', () => {
  const scene = new Scene(), queue = new ModelLoadQueue(() => 0), renderer = new ParkedVehicles(scene, 'rest', 9.81, queue), camera = new Vector3(1000, 200, -15000);
  renderer.detailLimit = 64;
  const update = () => renderer.update([site], { x: 0, z: 0 }, camera);
  const count = () => scene.children.reduce((sum, object) => sum + (object as InstancedMesh).count, 0);
  const vertices = () => scene.children.reduce((sum, object) => {
    const mesh = object as InstancedMesh; return sum + mesh.count * mesh.geometry.getAttribute('position').count;
  }, 0);
  loadModels(update, queue);
  const expected = count(), detailed = vertices();
  camera.x += 800;
  loadModels(() => { update(); expect(count()).toBe(expected); }, queue);
  expect(vertices()).toBeLessThan(detailed * 0.05);
  camera.x -= 800; update(); expect(count()).toBe(expected); expect(vertices()).toBe(detailed);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});

it('retains an articulated trailer pose when a borrowed semi is returned to the static fleet', () => {
  const scene = new Scene(), queue = new ModelLoadQueue(() => 0), renderer = new ParkedVehicles(scene, 'rest', 9.81, queue);
  renderer.fleet.sync([site]);
  const entry = renderer.fleet.entries.find(e => 'trailers' in vehicleProfiles[e.kind])!;
  const car = renderer.fleet.take(entry.id)!, trailer = car.trailers[0]!;
  trailer.heading = 1.2; trailer.x += 8; trailer.z += 4;
  renderer.fleet.park(car, entry.id);
  const camera = new Vector3(car.x, car.y + 10, car.z), matrix = new Matrix4();
  loadModels(() => renderer.update([site], { x: 0, z: 0 }, camera), queue);
  const mesh = scene.children.find(o => {
    if (!(o instanceof InstancedMesh) || o.name !== `${car.kind}:trailer` || !o.count) return false;
    o.getMatrixAt(o.count - 1, matrix);
    return Math.abs(matrix.elements[12] + o.position.x - trailer.x) < 0.01;
  }) as InstancedMesh;
  expect(mesh).toBeDefined(); mesh.getMatrixAt(mesh.count - 1, matrix);
  expect(matrix.elements[12] + mesh.position.x).toBeCloseTo(trailer.x, 3);
  expect(matrix.elements[14] + mesh.position.z).toBeCloseTo(trailer.z, 3);
  expect(Math.atan2(-matrix.elements[8], matrix.elements[10])).toBeCloseTo(trailer.heading, 3);
  renderer.dispose();
});

it('caps detailed parked bodies without removing proxy vehicles or their support surfaces', () => {
  const scene = new Scene(), queue = new ModelLoadQueue(() => 0), renderer = new ParkedVehicles(scene, 'rest', 9.81, queue), camera = new Vector3(1000, 200, -15000);
  renderer.detailDistance = 1000; renderer.detailLimit = 0;
  const update = () => renderer.update([site], { x: 0, z: 0 }, camera);
  loadModels(update, queue);
  const bodies = () => scene.children.filter(o => o instanceof InstancedMesh && o.name.endsWith(':vehicle')) as InstancedMesh[];
  const count = () => bodies().reduce((sum, mesh) => sum + mesh.count, 0);
  const total = count(); expect(total).toBe(renderer.fleet.entries.length);
  renderer.detailLimit = 2;
  loadModels(update, queue);
  expect(count()).toBe(total);
  expect(bodies().filter(m => m.geometry.getAttribute('position').count > 3000).reduce((sum, m) => sum + m.count, 0)).toBe(2);
  const car = renderer.fleet.vehicle(renderer.fleet.entries[0]);
  expect(renderer.fleet.support(car.x, car.z, Infinity)).toBeGreaterThan(car.y);
  renderer.dispose();
});
