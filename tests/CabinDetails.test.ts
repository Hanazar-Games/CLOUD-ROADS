import { Mesh, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';

function complexity(model: VehicleMesh): { meshes: number; vertices: number } {
  let meshes = 0, vertices = 0;
  model.root.traverse(node => { if (node instanceof Mesh) { meshes++; vertices += node.geometry.getAttribute('position').count; } });
  return { meshes, vertices };
}

it('omits player cabin detailing from traffic templates without multiplying player draw calls', () => {
  for (const kind of ['sedan', 'camper', 'doubleDecker', 'roadTrain', 'touringMotorcycle'] as const) {
    const detailed = new VehicleMesh(new Scene(), vehicleProfiles[kind]);
    const traffic = new VehicleMesh(new Scene(), vehicleProfiles[kind], false);
    const a = complexity(detailed), b = complexity(traffic);
    expect(a.vertices, kind).toBeGreaterThan(b.vertices);
    expect(a.meshes, kind).toBeLessThanOrEqual(b.meshes + 2);
    detailed.dispose(); traffic.dispose();
  }
});

it.each(Object.values(vehicleProfiles))('keeps fittings outside the $name driving sightline', p => {
    const detailed = new VehicleMesh(new Scene(), p), traffic = new VehicleMesh(new Scene(), p, false);
    detailed.root.updateMatrixWorld(true); traffic.root.updateMatrixWorld(true);
    for (const side of [-0.12, 0, 0.12]) {
      const ray = new Raycaster(new Vector3(p.eye.x + side, p.eye.y, -p.eye.along), new Vector3(0, 0, -1), 0, 0.5);
      expect(ray.intersectObject(detailed.chassis, true).length, p.name).toBe(ray.intersectObject(traffic.chassis, true).length);
    }
    detailed.dispose(); traffic.dispose();
});

it.each(Object.values(vehicleProfiles))('keeps speed, gear and safety text visible from the $name driver seat', p => {
    const model = new VehicleMesh(new Scene(), p); model.root.updateMatrixWorld(true);
    const screen = model.root.getObjectByName('vehicle-display')!;
    const eye = new Vector3(p.eye.x, p.eye.y, -p.eye.along);
    for (const x of [-0.14, 0, 0.14]) for (const y of [0.065, 0.02, -0.03, -0.079]) {
      const target = screen.localToWorld(new Vector3(x, y, 0));
      const ray = new Raycaster(eye, target.clone().sub(eye).normalize(), 0, eye.distanceTo(target) + 0.001);
      const hit = ray.intersectObject(model.chassis, true).find(({ object }) => object instanceof Mesh
        && !(Array.isArray(object.material) ? object.material.every(m => m.transparent) : object.material.transparent));
      expect(hit?.object.uuid, `${p.name} at ${x},${y}`).toBe(screen.children[0].uuid);
    }
    model.dispose();
});
