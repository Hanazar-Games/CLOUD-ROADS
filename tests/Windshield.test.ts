import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Scene, SpotLight } from 'three';
import { expect, it } from 'vitest';
import { Windshield } from '../src/vehicle/Windshield';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

it('clears actual glass droplets within the swept area and freezes water when paused', () => {
  const test = (wipers: 'off' | 'high') => {
    const window = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), parent = new Group(); parent.add(window);
    const glass = new Windshield(window, 1.55, 0.81), systems = new VehicleSystems(); systems.wipers = wipers;
    for (let i = 0; i < 600; i++) { systems.update(1 / 60, 0, 1, 0); glass.update(1 / 60, systems, 0); }
    const drops = glass.root.children.find(child => child instanceof InstancedMesh) as InstancedMesh;
    const sizes = Array.from({ length: drops.count }, (_, i) => drops.instanceMatrix.array[i * 16]);
    const before = drops.instanceMatrix.array.slice(); glass.update(0, systems, 0);
    expect(drops.instanceMatrix.array).toEqual(before);
    expect(drops.visible).toBe(true);
    glass.dispose(); window.geometry.dispose(); window.material.dispose();
    expect(parent.children).toHaveLength(1);
    return sizes;
  };
  const off = test('off'), high = test('high');
  expect(high.filter((size, i) => size < off[i] * 0.5).length).toBeGreaterThan(25);
  expect(high.some((size, i) => size === off[i])).toBe(true);
});

it('changes physical beam distance and keeps brake lamps working with headlights off', () => {
  const scene = new Scene(), mesh = new VehicleMesh(scene), car = new VehiclePhysics(), systems = new VehicleSystems();
  const lights: SpotLight[] = []; scene.traverse(object => { if (object instanceof SpotLight) lights.push(object); });
  systems.lights = 'low'; systems.update(0, 0, 0, 0); mesh.sync(car, { x: 0, z: 0 }, systems);
  const distance = lights[0].distance, intensity = lights[0].intensity;
  systems.lights = 'high'; systems.update(0, 0, 0, 0); mesh.sync(car, { x: 0, z: 0 }, systems);
  expect(lights[0].distance).toBeGreaterThan(distance); expect(lights[0].intensity).toBeGreaterThan(intensity);
  systems.lights = 'off'; systems.update(0, 1, 1, 0); car.braking = true; mesh.sync(car, { x: 0, z: 0 }, systems);
  expect(lights[0].intensity).toBe(0);
  let brakeLight = false;
  scene.traverse(object => { if (object instanceof Mesh && !Array.isArray(object.material) && object.material.emissive?.getHex() === 0xff3020) brakeLight ||= object.material.emissiveIntensity > 1; });
  expect(brakeLight).toBe(true); mesh.dispose(); expect(scene.children).toHaveLength(0);
});
