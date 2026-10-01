import { Scene } from 'three';
import { expect, it } from 'vitest';
import { VegetationMesh } from '../src/vegetation/VegetationMesh';
import { plantGeometry } from '../src/vegetation/PlantGeometry';

it('keeps sculpted pine branches indexed, bounded and cheaper at each distance tier', () => {
  const counts: number[] = [];
  for (const detail of ['near', 'middle', 'distant'] as const) {
    const geometry = plantGeometry('pine', detail);
    geometry.computeBoundingBox(); const bounds = geometry.boundingBox!;
    expect(Math.max(-bounds.min.x, bounds.max.x, -bounds.min.z, bounds.max.z)).toBeLessThan(4.7);
    expect(bounds.max.y).toBeLessThan(14); expect(bounds.min.y).toBeGreaterThan(-0.35);
    for (const name of ['position', 'normal', 'color']) expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    const positions = geometry.getAttribute('position');
    expect(Array.from(geometry.index!.array).every(i => i < positions.count)).toBe(true);
    expect(geometry.groups).toHaveLength(0); counts.push(geometry.index!.count / 3); geometry.dispose();
  }
  expect(counts[0]).toBeLessThan(500);
  expect(counts[1]).toBeLessThan(counts[0] * 0.4);
  expect(counts[2]).toBeLessThan(counts[1] * 0.4);
});

it('budgets vegetation changes without dropping queued chunks and reduces distant geometry', () => {
  const scene = new Scene(), vegetation = new VegetationMesh(scene);
  vegetation.configure({ distance: 0.5, density: 1, shadows: 0, budget: 2 });
  for (let x = 0; x < 6; x++) vegetation.setChunk(`${x},0`, x, 0, new Float32Array([6, 19].flatMap(px => [6, 19].flatMap(pz => [px, 0, pz, 1, 0, 0, 1]))));
  vegetation.update(0, 0); expect(vegetation.pending).toBe(4);
  vegetation.update(0, 0); vegetation.update(0, 0); expect(vegetation.pending).toBe(0);
  expect(scene.children.every(mesh => !mesh.castShadow)).toBe(true);
  const near = scene.children.find(mesh => mesh.name === 'vegetation-pine');
  const far = scene.children.find(mesh => mesh.name === 'vegetation-pine-distant');
  expect(near).toBeDefined(); expect(far).toBeDefined();
  vegetation.configure({ distance: 1, density: 0, shadows: 1, budget: 8 });
  vegetation.update(0, 0); expect(vegetation.distantCount).toBe(0);
  vegetation.dispose(); expect(scene.children).toHaveLength(0);
});

it('changes cached near vegetation detail live and returns to the same plants without accumulation', () => {
  const scene = new Scene(), vegetation = new VegetationMesh(scene);
  for (let x = -2; x <= 2; x++) vegetation.setChunk(`${x},0`, x, 0,
    new Float32Array([10, 0, 10, 1, 0, 7, 1, 20, 0, 20, 1, 0, 8, 1, 30, 0, 30, 1, 0, 2, 1]));
  vegetation.update(0, 0);
  const standard = vegetation.count, flowers = vegetation.flowerCount;
  vegetation.setDetailLevel(2); vegetation.update(0, 0);
  expect(vegetation.count).toBeGreaterThan(standard);
  expect(vegetation.flowerCount).toBeGreaterThan(flowers);
  vegetation.setDetailLevel(0); vegetation.update(0, 0);
  expect(vegetation.count).toBeLessThan(standard);
  for (let i = 0; i < 4; i++) {
    vegetation.setDetailLevel(2); vegetation.update(0, 0);
    vegetation.setDetailLevel(1); vegetation.update(0, 0);
    expect(vegetation.count).toBe(standard);
    expect(vegetation.flowerCount).toBe(flowers);
  }
  vegetation.dispose(); expect(scene.children).toHaveLength(0);
});
