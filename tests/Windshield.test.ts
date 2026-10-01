import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Raycaster, Scene, ShaderMaterial, SpotLight, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { Windshield } from '../src/vehicle/Windshield';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { wiperLayout } from '../src/vehicle/WiperLayout';

it.each([[1.55, 0.81], [2.2, 1.7]])('keeps detailed wipers on the swept glass envelope with two material batches (%s × %s)', (width, height) => {
  const window = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), parent = new Group(); parent.add(window);
  const glass = new Windshield(window, width, height), layout = wiperLayout(width, height);
  for (const pivot of glass.root.children.filter(child => child.name === 'wiper-pivot')) {
    expect(pivot.children).toHaveLength(2);
    const parts = pivot.children as Mesh[], arm = parts.find(part => (part.material as MeshStandardMaterial).metalness > 0.5)!;
    for (const part of parts) {
      const position = part.geometry.getAttribute('position');
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect((part.geometry.index?.count ?? position.count) / 3).toBeLessThan(500);
      part.updateMatrix(); part.geometry.computeBoundingBox(); const bounds = part.geometry.boundingBox!.clone().applyMatrix4(part.matrix);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-0.031);
      expect(bounds.max.x).toBeLessThanOrEqual(layout.radius + 0.001);
      expect(bounds.min.z).toBeGreaterThan(-0.09); expect(bounds.max.z).toBeLessThan(0.02);
    }
    arm.geometry.computeBoundingBox();
    expect(arm.geometry.boundingBox!.min.z).toBeLessThan(-0.04);
    expect(new Raycaster(new Vector3(0.025, 0.008, -0.1), new Vector3(0, 0, 1)).intersectObject(arm).length).toBeGreaterThan(0);
  }
  const systems = new VehicleSystems(); systems.wipers = 'high';
  for (let i = 0; i < 60; i++) {
    systems.update(1 / 60, 0, 1, 0); glass.update(1 / 60, systems, 0);
    for (const pivot of glass.root.children.filter(child => child.name === 'wiper-pivot'))
      expect(pivot.rotation.z).toBeCloseTo(layout.start + systems.sweep * layout.arc, 6);
  }
  glass.dispose(); window.geometry.dispose(); window.material.dispose();
});

it('clears actual glass droplets within the swept area and freezes water when paused', () => {
  const test = (wipers: 'off' | 'high') => {
    const window = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), parent = new Group(); parent.add(window);
    const glass = new Windshield(window, 1.55, 0.81), systems = new VehicleSystems(); systems.wipers = wipers;
    for (let i = 0; i < 600; i++) { systems.update(1 / 60, 0, 1, 0); glass.update(1 / 60, systems, 0); }
    const film = glass.root.children.find(child => child instanceof Mesh && child.material instanceof ShaderMaterial) as Mesh;
    const sizes = Array.from(glass.rain.data);
    const before = glass.rain.data.slice(); glass.update(0, systems, 0);
    expect(glass.rain.data).toEqual(before);
    expect(film.visible).toBe(true);
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
