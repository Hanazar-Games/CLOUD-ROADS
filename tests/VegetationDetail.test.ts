import { InstancedMesh, Matrix4, Scene } from 'three';
import { expect, it } from 'vitest';
import { VegetationMesh } from '../src/vegetation/VegetationMesh';
import { plantGeometry } from '../src/vegetation/PlantGeometry';
import { SeasonState } from '../src/season/SeasonState';

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

it('independently thins tree, grass, flower and rock instances with stable subsets and no terrain regeneration', () => {
  const scene = new Scene(), vegetation = new VegetationMesh(scene);
  const plants = new Float32Array(Array.from({ length: 60 }, (_, i) => [0, 5, 6, 7, 8, 9].flatMap(kind =>
    [i * 3 + 2, 0, kind * 10 + 1, 1, 0, kind, 1])).flat());
  vegetation.setChunk('0,0', 0, 0, plants); vegetation.update(0, 0);
  const matrices = () => new Set(scene.children.flatMap(child => child instanceof InstancedMesh ? Array.from({ length: child.count }, (_, i) => {
    const matrix = new Matrix4(); child.getMatrixAt(i, matrix); return `${child.name}:${matrix.elements[12]},${matrix.elements[14]}`;
  }) : []));
  const full = matrices();
  vegetation.configure({ trees: 0.5, ground: 0, flowers: 0, rocks: 0 }); vegetation.update(0, 0);
  const half = matrices(); expect(half.size).toBeGreaterThan(10); expect(half.size).toBeLessThan(50);
  expect(vegetation.groundCount).toBe(0); expect([...half].every(key => full.has(key))).toBe(true);
  vegetation.configure({ trees: 0.25 }); vegetation.update(0, 0);
  expect([...matrices()].every(key => half.has(key))).toBe(true);
  vegetation.configure({ trees: 0, flowers: 1 }); vegetation.update(0, 0);
  expect(vegetation.canopyCount).toBe(0); expect(vegetation.count).toBe(vegetation.flowerCount); expect(vegetation.flowerCount).toBe(120);
  vegetation.configure({ trees: 1, ground: 1, flowers: 1, rocks: 1 }); vegetation.update(0, 0);
  expect(matrices()).toEqual(full); expect(plants.length).toBe(2520);
  vegetation.dispose(); expect(scene.children).toHaveLength(0);
});

it('changes shadows and update budget without rebuilding settled vegetation or uploading transforms', () => {
  const scene = new Scene(), vegetation = new VegetationMesh(scene);
  for (let x = 0; x < 6; x++) vegetation.setChunk(`${x},0`, x, 0, new Float32Array([6, 0, 6, 1, 0, 0, 1]));
  vegetation.update(0, 0);
  const batches = scene.children as InstancedMesh[], versions = batches.map(mesh => mesh.instanceMatrix.version);
  vegetation.configure({ shadows: 0, budget: 1 });
  expect(vegetation.pending).toBe(0); vegetation.update(0, 0);
  expect(batches.every(mesh => !mesh.castShadow)).toBe(true);
  expect(batches.map(mesh => mesh.instanceMatrix.version)).toEqual(versions);
  vegetation.configure({ trees: 0 }); expect(vegetation.pending).toBe(6);
  vegetation.update(0, 0); expect(vegetation.pending).toBe(5);
  vegetation.configure({ budget: 2 }); expect(vegetation.pending).toBe(5);
  vegetation.update(0, 0); expect(vegetation.pending).toBe(3);
  vegetation.dispose();
});

it('keeps settled far vegetation out of the queue when only near detail changes', () => {
  const scene = new Scene(), vegetation = new VegetationMesh(scene);
  for (const x of [0, 1, 6, 8]) vegetation.setChunk(`${x},0`, x, 0, new Float32Array([6, 0, 6, 1, 0, 0, 1]));
  vegetation.update(0, 0); vegetation.setDetailLevel(0);
  expect(vegetation.pending).toBe(1);
  vegetation.update(0, 0); vegetation.setDetailLevel(1); expect(vegetation.pending).toBe(1);
  vegetation.dispose();
});

it('reprioritizes pending tiles after travel and never resurrects removed or replaced vegetation', () => {
  const scene = new Scene(), vegetation = new VegetationMesh(scene);
  const plant = (x: number) => new Float32Array([x, 0, 6, 1, 0, 0, 1]);
  const positions = () => scene.children.flatMap(child => {
    const mesh = child as InstancedMesh, matrix = new Matrix4();
    return Array.from({ length: mesh.count }, (_, i) => { mesh.getMatrixAt(i, matrix); return matrix.elements[12] + mesh.position.x; });
  }).sort((a, b) => a - b);
  vegetation.configure({ budget: 1 });
  for (const x of [3, 2, 1, 0]) vegetation.setChunk(`${x},0`, x, 0, plant(6));
  vegetation.update(0, 0); expect(positions()).toEqual([6]);
  vegetation.setViewCenter(3, 0); vegetation.removeChunk('2,0'); vegetation.setChunk('1,0', 1, 0, plant(12));
  vegetation.update(0, 0); expect(positions()).toEqual([6, 774]);
  vegetation.update(0, 0); expect(positions()).toEqual([6, 268, 774]);
  vegetation.update(0, 0); expect(vegetation.pending).toBe(0);
  expect(positions()).toEqual([6, 268, 774]);
  vegetation.dispose();
});

it.each(['moon', 'mars'] as const)('keeps %s rock color consistent across model distances', terrain => {
  const scene = new Scene(), vegetation = new VegetationMesh(scene);
  vegetation.setSeason(new SeasonState(terrain));
  vegetation.setChunk('0,0', 0, 0, new Float32Array([6, 0, 6, 1, 0, 5, 1])); vegetation.update(0, 0);
  const near = (scene.children[0] as InstancedMesh).material;
  vegetation.setViewCenter(2, 0); vegetation.update(0, 0);
  const middle = (scene.children[0] as InstancedMesh).material;
  expect(middle).not.toBe(near);
  expect(middle).toHaveProperty('color', Reflect.get(near, 'color'));
  vegetation.dispose();
});
