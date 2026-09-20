import { Matrix4, PerspectiveCamera, Raycaster, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { RoadFurniture } from '../src/road/RoadFurniture';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';

it('places reproducible lamp sections with dark gaps and keeps lights out of tunnels', () => {
  const start = new RoadGenerator('lamps', { sample: () => 200 }).start;
  const segment = new RoadSegment(start, 0, 0, 6000);
  const samples = Array.from({ length: 3001 }, (_, i) => segment.sample(i / 3000));
  const scene = new Scene(), furniture = new RoadFurniture(scene, 'lamps');
  furniture.update(samples, [], [], 1, 0, 0, true);
  expect(furniture.markers.count).toBeGreaterThan(100);
  scene.updateMatrixWorld(true);
  for (const [instance, y] of [[1, 0.4], [2, 0]]) {
    const matrix = new Matrix4(); furniture.markers.getMatrixAt(instance, matrix);
    const point = new Vector3(0, y, 10).applyMatrix4(matrix).add(furniture.markers.position);
    const hit = new Raycaster(point, new Vector3(0, 0, -1)).intersectObject(furniture.markers)[0];
    expect(hit.instanceId).toBe(instance);
  }
  const points = furniture.lampPositions.map(p => ({ ...p }));
  expect(points.length).toBeGreaterThan(10);
  expect(points.length).toBeLessThan(100);
  expect(points.some((p, i) => i > 0 && Math.abs(p.z - points[i - 1].z) > 200)).toBe(true);
  const tunnel = { start: samples[300], end: samples[1200], samples: samples.slice(300, 1201) };
  furniture.update(samples, [tunnel], [], 2, 0, 0, true);
  expect(furniture.lampPositions.every(p => p.z > tunnel.start.position.z || p.z < tunnel.end.position.z)).toBe(true);
  furniture.update(samples, [], [], 3, 0, 0, true);
  expect(furniture.lampPositions).toEqual(points);
  const camera = new PerspectiveCamera();
  camera.position.set(points[0].x, points[0].y - 5, points[0].z);
  furniture.illuminate(camera, 0, [], 0, 0);
  expect(furniture.localLights.every(light => light.intensity === 0)).toBe(true);
  furniture.illuminate(camera, 1, [], 0, 0);
  expect(furniture.localLights.some(light => light.intensity > 0)).toBe(true);
  furniture.enabled = false;
  furniture.illuminate(camera, 1, [], 0, 0);
  expect(furniture.localLights.every(light => light.intensity === 0)).toBe(true);
  furniture.illuminate(camera, 0, [{ x: points[0].x, y: points[0].y, z: points[0].z }], 0, 0);
  expect(furniture.localLights.some(light => light.intensity > 0)).toBe(true);
  furniture.dispose();
  expect(scene.children).toHaveLength(0);
});
