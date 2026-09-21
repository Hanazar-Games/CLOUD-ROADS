import { Scene } from 'three';
import { expect, it } from 'vitest';
import { VegetationMesh } from '../src/vegetation/VegetationMesh';

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
