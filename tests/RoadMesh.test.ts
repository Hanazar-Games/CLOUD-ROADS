import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { RoadMesh } from '../src/road/RoadMesh';
import { RoadSpine } from '../src/road/RoadSpine';
import { RoadSegment } from '../src/road/RoadSegment';

describe('RoadMesh', () => {
  it('raises the outside shoulder on a right-hand curve', () => {
    const spine = new RoadSpine('test');
    spine.segments.push(new RoadSegment(spine.generator.start, Math.PI / 10, 0));
    const road = new RoadMesh(new Scene());
    road.update(spine, 0, 0, true);
    const positions = road.mesh.geometry.getAttribute('position');
    const lastLeft = 24 * 2;
    expect(positions.getY(lastLeft)).toBeGreaterThan(positions.getY(lastLeft + 1));
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
    const count = spine.segments.length * 24 + 1;
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
