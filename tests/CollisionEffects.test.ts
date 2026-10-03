import { Matrix4, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { CollisionEffects } from '../src/vehicle/CollisionEffects';

it('deduplicates bilateral contacts, bounds particles, freezes on pause and expires feedback', () => {
  const effects = new CollisionEffects(new Scene()), origin = { x: 0, z: 0 }, listener = { x: 0, y: 0, z: 0 };
  const collision = { x: 0, y: 1, z: 0, strength: 12 };
  effects.update(0.016, [{ collision }, { collision }], listener, origin, 9.81);
  const count = effects.mesh.count;
  expect(count).toBeGreaterThan(0); expect(count).toBeLessThan(24); expect(effects.soundImpact).toBeGreaterThan(0);
  effects.update(0, [{ collision }], listener, origin, 9.81);
  expect(effects.mesh.count).toBe(count);
  effects.update(0.016, [{ collision }], listener, { x: 512, z: 512 }, 9.81);
  expect(effects.mesh.count).toBe(count);
  const matrix = new Matrix4(); effects.mesh.getMatrixAt(0, matrix);
  expect(matrix.elements[12]).toBeCloseTo(-512, 0);
  for (let i = 0; i < 30; i++) effects.update(0.016, [{ collision: { ...collision } }], listener, origin, 9.81);
  expect(effects.mesh.count).toBeLessThanOrEqual(96);
  for (let i = 0; i < 40; i++) effects.update(0.1, [], listener, origin, 9.81);
  expect(effects.mesh.count).toBe(0); expect(effects.soundImpact).toBeLessThan(0.001);
  const geometry = vi.spyOn(effects.mesh.geometry, 'dispose'), material = vi.spyOn(effects.mesh.material, 'dispose');
  effects.dispose(); expect(effects.mesh.parent).toBeNull(); expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
});

it('ignores distant contacts without replaying them on approach', () => {
  const effects = new CollisionEffects(new Scene()), collision = { x: 1000, y: 0, z: 0, strength: 30 };
  effects.update(0.016, [{ collision }], { x: 0, y: 0, z: 0 }, { x: 0, z: 0 }, 9.81);
  effects.update(0.016, [{ collision }], collision, { x: 0, z: 0 }, 9.81);
  expect(effects.mesh.count).toBe(0); expect(effects.soundImpact).toBe(0); effects.dispose();
});
