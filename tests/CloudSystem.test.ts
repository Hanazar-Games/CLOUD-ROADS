import { PerspectiveCamera } from 'three';
import { expect, it, vi } from 'vitest';
import { CloudSystem } from '../src/atmosphere/CloudSystem';
import { SunSystem } from '../src/atmosphere/SunSystem';

it('keeps cloud phase and fog unchanged when the render origin moves', () => {
  const clouds = new CloudSystem('CLOUD-ROAD-001', new SunSystem()), camera = new PerspectiveCamera();
  camera.position.set(10128, 2050, -20000);
  clouds.update(0, camera, { x: 0, z: 0 });
  const sample = { ...clouds.sample }, phase = clouds.material.uniforms.phase.value.clone();
  camera.position.x -= 10240;
  camera.position.z += 19968;
  clouds.update(0, camera, { x: 10240, z: -19968 });
  expect(clouds.sample).toEqual(sample);
  expect(clouds.material.uniforms.phase.value).toEqual(phase);
  expect(clouds.fog.far).toBeLessThan(400);
  clouds.dispose();
});

it('freezes drift at zero delta, resets a seed and restores clear air when disabled', () => {
  const clouds = new CloudSystem('CLOUD-ROAD-001', new SunSystem()), camera = new PerspectiveCamera();
  camera.position.set(100, 2050, 200);
  clouds.update(0, camera, { x: 0, z: 0 });
  const sample = { ...clouds.sample }, phase = clouds.material.uniforms.phase.value.clone();
  clouds.update(1, camera, { x: 0, z: 0 });
  expect(clouds.material.uniforms.phase.value).not.toEqual(phase);
  const moved = clouds.material.uniforms.phase.value.clone();
  clouds.update(0, camera, { x: 0, z: 0 });
  expect(clouds.material.uniforms.phase.value).toEqual(moved);
  clouds.enabled = false;
  clouds.update(0, camera, { x: 0, z: 0 });
  expect([clouds.fog.near, clouds.fog.far]).toEqual([1000, 1950]);
  const texture = clouds.texture;
  clouds.setSeed('OTHER');
  clouds.setSeed('CLOUD-ROAD-001');
  expect(clouds.enabled).toBe(false);
  expect(clouds.texture).toBe(texture);
  clouds.enabled = true;
  clouds.update(0, camera, { x: 0, z: 0 });
  expect(clouds.sample).toEqual(sample);
  expect(clouds.material.uniforms.phase.value).toEqual(phase);
  clouds.dispose();
});

it('resizes the reusable render target and releases every GPU resource', () => {
  const clouds = new CloudSystem('CLOUD-ROAD-001', new SunSystem());
  const target = clouds.target, texture = clouds.texture, material = clouds.material;
  clouds.resize(1920, 1080);
  expect([target.width, target.height]).toEqual([1920, 1080]);
  const resizeDisposal = vi.fn();
  target.addEventListener('dispose', resizeDisposal);
  clouds.resize(1920, 1080);
  expect(resizeDisposal).not.toHaveBeenCalled();
  clouds.resize(1100, 720);
  expect(clouds.target).toBe(target);
  expect([target.width, target.height]).toEqual([1100, 720]);
  const released = [target, texture, material, clouds.quad.geometry].map((resource) => {
    const dispose = vi.fn();
    resource.addEventListener('dispose', dispose);
    return dispose;
  });
  clouds.dispose();
  for (const dispose of released) expect(dispose).toHaveBeenCalledOnce();
});
