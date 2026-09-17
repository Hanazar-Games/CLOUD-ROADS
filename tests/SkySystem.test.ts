import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { SkySystem } from '../src/atmosphere/SkySystem';

it('aligns terrain lighting with the visible sun and keeps shadows stable through a rebase', () => {
  const scene = new Scene(), sky = new SkySystem(scene), camera = new PerspectiveCamera();
  camera.position.set(10128, 3000, -20000);
  sky.update(camera, { x: 0, z: 0 });
  const position = sky.light.position.clone(), target = sky.light.target.position.clone();
  expect(position.clone().sub(target).normalize().distanceTo(sky.sun.direction)).toBeLessThan(1e-10);
  camera.position.x -= 10240;
  camera.position.z += 19968;
  sky.update(camera, { x: 10240, z: -19968 });
  const origin = new Vector3(10240, 0, -19968);
  expect(sky.light.position.clone().add(origin).distanceTo(position)).toBeLessThan(1e-8);
  expect(sky.light.target.position.clone().add(origin).distanceTo(target)).toBeLessThan(1e-8);
  sky.sun.setTime(0.95);
  sky.update(camera, { x: 10240, z: -19968 });
  expect(sky.light.color).toEqual(sky.sun.sunColor);
  expect(sky.light.intensity).toBe(sky.sun.light.x);
  sky.dispose();
});

it('retains fixed shadow resources and releases lights with the sky', () => {
  const scene = new Scene(), sky = new SkySystem(scene), camera = new PerspectiveCamera();
  const shadow = sky.light.shadow, dispose = vi.spyOn(shadow, 'dispose');
  for (let distance = 0; distance <= 100000; distance += 500) {
    camera.position.set(distance % 4096, 3000, 0);
    sky.update(camera, { x: distance - camera.position.x, z: 0 });
    expect(sky.light.shadow).toBe(shadow);
    expect(sky.light.position.toArray().every(Number.isFinite)).toBe(true);
    expect(Math.abs(sky.light.position.x)).toBeLessThan(10000);
  }
  expect(shadow.mapSize.x).toBe(2048);
  expect(shadow.camera.far).toBeGreaterThan(shadow.camera.near);
  sky.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(scene.children).toHaveLength(0);
});
