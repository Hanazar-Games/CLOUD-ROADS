import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { RoadMesh } from '../src/road/RoadMesh';
import { RoadSpine } from '../src/road/RoadSpine';
import { ROAD_SAMPLES, RoadSegment } from '../src/road/RoadSegment';

describe('RoadMesh', () => {
  it('gives highway barriers a wider foot and a narrow crown within the reserved median', () => {
    const scene = new Scene(), road = new RoadMesh(scene, { ...DEFAULT_OPTIONS, roadType: 'highway' });
    const positions = road.barriers.geometry.getAttribute('position');
    let foot = 0, crown = 0;
    for (let i = 0; i < positions.count; i++) {
      const width = Math.abs(positions.getX(i));
      if (positions.getY(i) < -0.4) foot = Math.max(foot, width);
      if (positions.getY(i) > 0.4) crown = Math.max(crown, width);
      expect(width).toBeLessThanOrEqual(0.5);
    }
    expect(foot).toBeGreaterThan(crown * 1.5);
    road.dispose(); expect(scene.children).toHaveLength(0);
  });

  it.each([1560, 78000, 780000])('anchors 2 km arrows, dashes and grooves across the %i m window boundary', distance => {
    const spine = new RoadSpine('CLOUD-ROAD-001'), road = new RoadMesh(new Scene());
    const first = new RoadSegment({ ...spine.generator.start, distance: distance - 48 }, 0, 0);
    spine.segments.push(first, new RoadSegment(first.end, 0, 0));
    road.update(spine, 0, 0, true);
    const before = road.mesh.geometry.getAttribute('uv').getY(ROAD_SAMPLES * 2);
    spine.segments.shift(); spine.version++;
    road.update(spine, 0, 0, true);
    const after = road.mesh.geometry.getAttribute('uv').getY(0);
    for (const period of [12, 2000, 1.3]) expect((before - after) / period).toBeCloseTo(Math.round((before - after) / period), 4);
    road.dispose();
  });

  it('raises the outside shoulder on a right-hand curve', () => {
    const spine = new RoadSpine('test');
    spine.segments.push(new RoadSegment(spine.generator.start, Math.PI / 10, 0));
    const road = new RoadMesh(new Scene());
    road.update(spine, 0, 0, true);
    const positions = road.mesh.geometry.getAttribute('position');
    const middleLeft = ROAD_SAMPLES;
    expect(positions.getY(middleLeft)).toBeGreaterThan(positions.getY(middleLeft + 1));
    road.dispose();
  });

  it('preserves road width, finite attributes and upward winding', () => {
    const spine = new RoadSpine('CLOUD-ROAD-001');
    while (!spine.update(128, 8)) { /* Load the initial route. */ }
    const scene = new Scene();
    const road = new RoadMesh(scene);
    road.update(spine, 0, 0, true);
    const geometry = road.mesh.geometry;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const count = spine.samples.length;
    expect(geometry.drawRange.count).toBe((count - 1) * 6);
    for (let i = 0; i < count; i++) {
      const a = i * 2, b = a + 1;
      const width = Math.hypot(positions.getX(a) - positions.getX(b), positions.getY(a) - positions.getY(b), positions.getZ(a) - positions.getZ(b));
      expect(width).toBeCloseTo(10.4, 2);
      expect(normals.getY(a)).toBeGreaterThan(0.99);
      expect(uv.getY(a)).toBe(uv.getY(b));
      if (i > 0) expect(uv.getY(a)).toBeGreaterThan(uv.getY(a - 2));
    }
    const indices = geometry.getIndex()!;
    for (let i = 0; i < geometry.drawRange.count; i += 3) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      const areaY = (positions.getZ(b) - positions.getZ(a)) * (positions.getX(c) - positions.getX(a)) - (positions.getX(b) - positions.getX(a)) * (positions.getZ(c) - positions.getZ(a));
      expect(areaY).toBeGreaterThan(0);
    }
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    road.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('reuses geometry buffers when streaming, and rebases without changing their data', () => {
    const spine = new RoadSpine('test');
    const road = new RoadMesh(new Scene());
    while (!spine.update(128, 8)) { /* Load the initial route. */ }
    road.update(spine, 0, 0, true);
    const geometry = road.mesh.geometry;
    const positions = geometry.getAttribute('position');
    const oldX = road.mesh.position.x;
    const before = positions.array.slice();
    road.update(spine, 5120, -5120, true);
    expect(road.mesh.position.x).toBe(oldX - 5120);
    expect(positions.array).toEqual(before);
    while (!spine.update(-10_000, 8)) { /* Move the retained window. */ }
    road.update(spine, 5120, -5120, true);
    expect(road.mesh.geometry).toBe(geometry);
    expect(road.mesh.geometry.getAttribute('position')).toBe(positions);
    expect(positions.array).not.toEqual(before);
    road.update(spine, 5120, -5120, false);
    expect(road.mesh.visible).toBe(false);
    road.dispose();
  });
});
