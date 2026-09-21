import { describe, expect, it, vi } from 'vitest';
import { clearCrossing, planCrossings } from '../src/road/Crossings';
import { CrossingMesh } from '../src/road/CrossingMesh';
import { Matrix4, Scene } from 'three';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { CrossingPlanner } from '../src/road/CrossingPlanner';

const start = { position: { x: 0, y: 100, z: 0 }, heading: 0, grade: 0, distance: 1800, bank: 0, width: 8, nextMountain: 0, routeId: 'root' };
const samples = Array.from({ length: 49 }, (_, i) => new RoadSegment(start, 0, 0).sample(i / 48));
const valley = { sample: (x: number) => Math.abs(x) * 0.35 };

describe('valley crossings', () => {
  it('reuses stable anchors and rejected sites across moving windows while checking new route clearance', () => {
    const terrain = { sample: vi.fn(valley.sample) }, planner = new CrossingPlanner('test', terrain);
    const site = planner.plan([samples], new RoadCorridor([]))[0], calls = terrain.sample.mock.calls.length;
    expect(site).toBeDefined();
    expect(planner.plan([samples.slice(0, 30)], new RoadCorridor([]))[0]).toBe(site);
    expect(terrain.sample.mock.calls.length).toBe(calls);
    expect(planner.plan([samples], new RoadCorridor(site.edges))).toEqual([]);
    expect(terrain.sample.mock.calls.length).toBe(calls);
    const low = samples.map(p => ({ ...p, position: { ...p.position, y: 20 } }));
    expect(planner.plan([low], new RoadCorridor([]))).toEqual([]);
    const rejectedCalls = terrain.sample.mock.calls.length;
    expect(planner.plan([low.slice(0, 30)], new RoadCorridor([]))).toEqual([]);
    expect(terrain.sample.mock.calls.length).toBe(rejectedCalls);
    planner.plan([], new RoadCorridor([]));
    expect(planner.plan([samples], new RoadCorridor([]))[0]).toEqual(site);
    expect(terrain.sample.mock.calls.length).toBeGreaterThan(rejectedCalls);
  });
  it('anchors scenery to reproducible route locations with clearance and buried tunnel ends', () => {
    const sites = planCrossings('test', samples, valley, new RoadCorridor([]));
    expect(sites).toHaveLength(1);
    const site = sites[0];
    expect(site.anchor.position.y - site.samples[0].position.y).toBeGreaterThanOrEqual(18);
    expect(site.tunnels).toHaveLength(2);
    for (const end of [site.samples[0], site.samples.at(-1)!]) expect(valley.sample(end.position.x)).toBeGreaterThan(end.position.y + 8);
    expect(site.samples.every(p => p.grade === 0)).toBe(true);
    expect(planCrossings('test', samples.slice(0, 30), valley, new RoadCorridor([]))).toEqual(sites);
  });

  it('rejects flat terrain without natural approaches and roads without sufficient clearance', () => {
    expect(planCrossings('test', samples, { sample: () => 0 }, new RoadCorridor([]))).toEqual([]);
    expect(planCrossings('test', samples.map(p => ({ ...p, position: { ...p.position, y: 20 } })), valley, new RoadCorridor([]))).toEqual([]);
  });

  it('reserves the lower alignment for bridge pier avoidance', () => {
    const site = planCrossings('test', samples, valley, new RoadCorridor([]))[0];
    const corridor = new RoadCorridor(site.edges);
    expect(corridor.crossesBelow(site.anchor, 24)).toBe(true);
  });

  it('rejects new routes at the crossing level even when another deck is closer in plan view', () => {
    const site = planCrossings('test', samples, valley, new RoadCorridor([]))[0];
    const p = site.samples[Math.floor(site.samples.length / 2)].position;
    const point = { ...p, nx: 0, ny: 1, nz: 0, ground: 1 };
    const edges = [{ a: { ...point, z: p.z - 20, y: 100 }, b: { ...point, z: p.z + 20, y: 100 } },
      { a: { ...point, x: p.x + 4, z: p.z - 20 }, b: { ...point, x: p.x + 4, z: p.z + 20 } }];
    expect(clearCrossing(site, new RoadCorridor(edges))).toBe(false);
  });

  it('bounds instanced detail, rebases without rewriting geometry, and releases empty scenes', () => {
    const site = planCrossings('test', samples, valley, new RoadCorridor([]))[0];
    const scene = new Scene(), mesh = new CrossingMesh(scene, 'test'), corridor = new RoadCorridor(site.edges);
    mesh.update([site], corridor, valley, 0, 0, true);
    expect(mesh.parts.count).toBeGreaterThan(100);
    expect(mesh.parts.count).toBeLessThan(mesh.parts.instanceMatrix.count);
    const matrix = new Matrix4(); mesh.parts.getMatrixAt(0, matrix);
    expect(matrix.elements.every(Number.isFinite)).toBe(true);
    const version = mesh.parts.instanceMatrix.version, x = mesh.parts.position.x;
    mesh.update([site], corridor, valley, 5120, -5120, true);
    expect(mesh.parts.position.x).toBe(x - 5120);
    expect(mesh.parts.instanceMatrix.version).toBe(version);
    mesh.update([], corridor, valley, 5120, -5120, true);
    expect(mesh.parts.visible).toBe(false);
    expect(mesh.parts.count).toBe(0);
    mesh.dispose(); expect(scene.children).toHaveLength(0);
  });
});
