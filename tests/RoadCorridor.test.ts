import { describe, expect, it } from 'vitest';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { RoadSpine } from '../src/road/RoadSpine';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { TerrainChunk } from '../src/terrain/TerrainChunk';
import { RoadMesh } from '../src/road/RoadMesh';
import { roadFrame } from '../src/road/RoadFrame';
import { MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';

describe('RoadCorridor', () => {
  it('cuts and fills a banked roadbed, blends slopes and preserves distant terrain', () => {
    const corridor = new RoadCorridor([{
      a: { x: 0, y: 200, z: 300, nx: -0.02, ny: 1, nz: 0, ground: 1 },
      b: { x: 0, y: 200, z: -300, nx: -0.02, ny: 1, nz: 0, ground: 1 },
    }]);
    for (const natural of [50, 500]) {
      expect(corridor.height(0, 0, natural)).toBeCloseTo(199.92, 5);
      expect(corridor.height(5, 0, natural)).toBeCloseTo(200.02, 5);
      expect(corridor.height(300, 0, natural)).toBe(natural);
      const transition = corridor.height(50, 0, natural);
      expect(transition).toBeGreaterThan(Math.min(200, natural));
      expect(transition).toBeLessThan(Math.max(202, natural));
    }
  });

  it('has identical coupled chunk boundaries and local subsets independent of load order', () => {
    const spine = new RoadSpine('CLOUD-ROAD-001');
    while (!spine.update(-400, 8)) { /* Load the corridor. */ }
    const corridor = RoadCorridor.fromSamples(spine.samples);
    const terrain = new TerrainGenerator('CLOUD-ROAD-001');
    const a = terrain.generate(0, -1, 64, corridor.forChunk(0, -1));
    const b = terrain.generate(0, 0, 64, corridor.forChunk(0, 0));
    for (let col = 0; col <= 64; col++) {
      const ai = (64 * 65 + col) * 3, bi = col * 3;
      expect(a.positions[ai + 1]).toBe(b.positions[bi + 1]);
      expect(a.normals.slice(ai, ai + 3)).toEqual(b.normals.slice(bi, bi + 3));
    }
    const copied = structuredClone(corridor.forChunk(0, -1));
    expect(terrain.generate(0, -1, 64, copied).positions).toEqual(a.positions);
    expect(corridor.needsDetail(0, -1)).toBe(true);
    expect(corridor.needsDetail(1000, 1000)).toBe(false);
    expect(corridor.forChunk(1000, 1000)).toEqual([]);
  });

  it.each(['CLOUD-ROAD-001', 'ROAD-TEST-002'])('supports the actual road triangles and shoulders for seed %s', (seed) => {
    const spine = new RoadSpine(seed);
    while (!spine.update(-800, 8)) { /* Load enough road to test both sides of chunk seams. */ }
    const corridor = RoadCorridor.fromSamples(spine.samples);
    const generator = new TerrainGenerator(seed);
    const road = new RoadMesh(new Scene());
    road.update(spine, 0, 0, true);
    road.mesh.updateMatrixWorld(true);
    const material = new MeshStandardMaterial();
    const chunks = new Map<string, TerrainChunk>();
    const ray = new Raycaster();
    for (let i = 13; i < spine.samples.length - 1; i += 13) {
      const sample = spine.samples[i], { right } = roadFrame(sample);
      for (const offset of [-5, 0, 5]) {
        const x = sample.position.x + right.x * offset, z = sample.position.z + right.z * offset;
        const cx = Math.floor(x / 256), cz = Math.floor(z / 256), key = `${cx},${cz}`;
        let chunk = chunks.get(key);
        if (!chunk) {
          chunk = new TerrainChunk(64, material);
          chunk.apply({ key, x: cx, z: cz, cells: 64 }, generator.generate(cx, cz, 64, corridor.forChunk(cx, cz)), 0, 0);
          chunk.mesh.updateMatrixWorld(true);
          chunks.set(key, chunk);
        }
        ray.set(new Vector3(x, sample.position.y + 10, z), new Vector3(0, -1, 0));
        const groundHit = ray.intersectObject(chunk.mesh)[0], roadHit = ray.intersectObject(road.mesh)[0];
        expect(groundHit).toBeDefined();
        expect(roadHit).toBeDefined();
        const gap = roadHit.point.y - groundHit.point.y;
        expect(gap).toBeGreaterThan(0.01);
        expect(gap).toBeLessThan(0.2);
      }
    }
    for (const chunk of chunks.values()) chunk.dispose();
    road.dispose();
    material.dispose();
  });
});
