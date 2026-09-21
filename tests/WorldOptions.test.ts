import { Matrix4, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { BiomeSystem } from '../src/biome/BiomeSystem';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadSpine } from '../src/road/RoadSpine';
import { RoadMesh } from '../src/road/RoadMesh';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { roadProfile } from '../src/road/RoadProfile';
import { SunSystem } from '../src/atmosphere/SunSystem';
import { RoadGenerator } from '../src/road/RoadGenerator';

describe('landscape and road choices', () => {
  it('generates distinct, deterministic terrain shapes and climates', () => {
    const heights = new Set<number>();
    for (const terrain of ['alpine', 'forest', 'desert', 'dunes'] as const) {
      const height = new HeightFunction('choices', terrain);
      const copy = new HeightFunction('choices', terrain);
      heights.add(height.sample(128, 128));
      for (let x = -100_000; x < 100_000; x += 731) {
        const y = height.sample(x, x * 0.37);
        expect(y).toBe(copy.sample(x, x * 0.37));
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(6000);
        expect(Math.abs(y - height.sample(x + 0.01, x * 0.37))).toBeLessThan(0.1);
      }
    }
    expect(heights.size).toBe(4);
    const desert = new BiomeSystem('choices', 'desert').sample(128, 128, 1000, 1);
    expect(desert.kind).toBe('desert');
    expect(desert.weights.desert).toBeGreaterThan(0.8);
    expect(desert.humidity).toBeLessThan(0.3);
    expect(Object.values(desert.weights).reduce((a, b) => a + b)).toBeCloseTo(1);
  });

  it('keeps desert and forest chunk borders identical across LODs', () => {
    for (const terrain of ['forest', 'desert', 'dunes'] as const) {
      const generator = new TerrainGenerator('choices', { ...DEFAULT_OPTIONS, terrain });
      const a = generator.generate(-1, 0, 64), b = generator.generate(0, 0, 8);
      const edge = (data: typeof a, x: number) => {
        const result = new Map<number, number[]>();
        for (let i = 0; i < data.positions.length; i += 3) if (data.positions[i] === x) {
          result.set(data.positions[i + 2], [data.positions[i + 1], ...data.normals.slice(i, i + 3), ...data.colors.slice(i, i + 3)]);
        }
        return result;
      };
      expect(edge(a, 256)).toEqual(edge(b, 0));
    }
  });

  it.each([6, 8, 10])('builds separate highway carriageways and a matching roadbed at %i m per direction', (roadWidth) => {
    const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, roadWidth, maxGrade: 0.04 };
    const profile = roadProfile(options);
    const spine = new RoadSpine('choices', new HeightFunction('choices'), options);
    while (!spine.update(128, 8)) { /* Complete the route. */ }
    expect(spine.segments.every(segment => segment.kind === 'cruise')).toBe(true);
    expect(spine.samples.every(sample => Math.abs(sample.grade) <= 0.04001 && Math.abs(sample.curvature) < 1 / 100)).toBe(true);
    const scene = new Scene(), road = new RoadMesh(scene, options);
    road.update(spine, 0, 0, true);
    const geometry = road.mesh.geometry, positions = geometry.getAttribute('position'), indices = geometry.getIndex()!;
    const point = (i: number) => new Vector3().fromBufferAttribute(positions, i);
    expect(point(0).distanceTo(point(1))).toBeCloseTo(roadWidth + 2.4, 3);
    expect(point(2).distanceTo(point(3))).toBeCloseTo(roadWidth + 2.4, 3);
    expect(point(1).distanceTo(point(2))).toBeCloseTo(4, 3);
    for (let i = 0; i < geometry.drawRange.count; i += 3) {
      const vertices = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
      expect(new Set(vertices.map(vertex => Math.floor(vertex % 4 / 2))).size).toBe(1);
      const [a, b, c] = vertices.map(point);
      expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
    }
    expect(road.barriers.count).toBeGreaterThan(0);
    const matrix = new Matrix4();
    road.barriers.getMatrixAt(0, matrix);
    expect(matrix.elements.every(Number.isFinite)).toBe(true);
    const corridor = new RoadCorridor([{ a: { x: 0, y: 100, z: 100, nx: 0, ny: 1, nz: 0, ground: 1 },
      b: { x: 0, y: 100, z: -100, nx: 0, ny: 1, nz: 0, ground: 1 } }], options);
    expect(corridor.height(profile.outerHalfWidth, 0, 700)).toBeCloseTo(99.92);
    expect(corridor.distance(0, 0, 50)).toBe(0);
    road.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('gives sunset an orange horizon and haze', () => {
    const sun = new SunSystem();
    sun.setTime(0.9);
    for (const color of [sun.horizon, sun.haze]) {
      expect(color.r).toBeGreaterThan(color.g * 1.4);
      expect(color.g).toBeGreaterThan(color.b * 1.25);
    }
  });

  it('keeps arid biome colors bounded and raises the snow line with the warmer climate', () => {
    for (const terrain of ['desert', 'dunes'] as const) {
      const biomes = new BiomeSystem('choices', terrain);
      expect(biomes.sample(128, 128, 1000, 1).snowLine).toBeGreaterThan(4500);
      for (let height = 0; height <= 6000; height += 100) {
        const sample = biomes.sample(128, 128, height, 1);
        expect(sample.color.every(value => value >= 0 && value <= 1)).toBe(true);
        expect(Object.values(sample.weights).reduce((a, b) => a + b)).toBeCloseTo(1);
      }
    }
  });

  it.each(['forest', 'desert', 'dunes'] as const)('keeps highway grades and curves bounded over 100 km of %s terrain', terrain => {
    const options = { ...DEFAULT_OPTIONS, terrain, roadType: 'highway' as const, roadWidth: 10 };
    const generator = new RoadGenerator('HIGHWAY-100KM', new HeightFunction('HIGHWAY-100KM', terrain), options);
    let point = generator.start;
    while (point.distance < 100_000) {
      const segment = generator.next(point);
      expect(segment.end.position.z).toBeLessThan(point.position.z);
      expect(segment.sample(0).position).toEqual(point.position);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const sample = segment.sample(t);
        expect(Object.values(sample.position).every(Number.isFinite)).toBe(true);
        expect(Math.abs(sample.grade)).toBeLessThanOrEqual(options.maxGrade + 0.000001);
        expect(Math.abs(sample.curvature)).toBeLessThan(1 / 100);
      }
      point = segment.end;
    }
  }, 30_000);
});
