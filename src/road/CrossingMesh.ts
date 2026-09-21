import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, type Scene } from 'three';
import { TunnelMesh } from '../tunnel/TunnelMesh';
import type { RoadTerrain } from './RoadGenerator';
import type { RoadCorridor } from './RoadCorridor';
import type { RoadSample } from './RoadSegment';
import { CROSSING_OPTIONS, type Crossing } from './Crossings';
import type { WorldOptions } from '../world/WorldOptions';

export class CrossingMesh {
  readonly parts = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0.8 }), 16000);
  readonly tunnels;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private key = '';
  private anchorX = 0;
  private anchorZ = 0;
  private version = 0;

  constructor(scene: Scene, seed: string, options: Readonly<WorldOptions> = CROSSING_OPTIONS) {
    this.parts.count = 0;
    this.parts.castShadow = this.parts.receiveShadow = true;
    this.parts.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(this.parts);
    this.tunnels = new TunnelMesh(scene, seed, { ...options, roadType: 'mountain', roadWidth: 6 });
  }

  update(sites: readonly Crossing[], corridor: RoadCorridor, terrain: RoadTerrain, originX: number, originZ: number, visible: boolean): void {
    const key = sites.map(site => site.id).join('|');
    if (key !== this.key) {
      this.key = key; this.version++; this.parts.count = 0;
      this.anchorX = sites[0]?.anchor.position.x ?? 0; this.anchorZ = sites[0]?.anchor.position.z ?? 0;
      for (const site of sites) {
        const a = site.samples[0], b = site.samples.at(-1)!, length = b.distance;
        const at = (distance: number): RoadSample => ({ ...a, distance, position: {
          x: a.position.x + a.tangent.x * distance, y: a.position.y, z: a.position.z + a.tangent.z * distance,
        } });
        const middle = at(length / 2);
        this.box(middle, 0, -0.75, 8.4, 1.4, length, 0x929a98);
        this.box(middle, 0, -0.02, site.kind === 'rail' ? 3.6 : 6, 0.16, length, site.kind === 'rail' ? 0x7f8179 : 0x354149);
        if (site.kind === 'rail') {
          for (const side of [-1, 1]) {
            this.box(middle, side * 0.7175, 0.24, 0.07, 0.07, length, 0xc3c8c4);
            this.box(middle, side * 0.7175, 0.17, 0.05, 0.12, length, 0x755d4e);
            this.box(middle, side * 0.7175, 0.12, 0.15, 0.04, length, 0x687271);
          }
          for (let d = 0; d < length; d += 1.5) this.box(at(d), 0, 0.06, 2.65, 0.12, 0.25, 0xa5a69a);
        } else {
          for (const side of [-1, 1]) this.box(middle, side * 2.85, 0.07, 0.12, 0.015, length, 0xe2e0c7);
          for (let d = 0; d < length; d += 12) this.box(at(d + 2), 0, 0.07, 0.13, 0.015, Math.min(4, length - d), 0xd2c57e);
        }
        for (const side of [-1, 1]) {
          this.box(middle, side * 4, 0.12, 0.35, 0.32, length, 0xa9aca1);
          for (const y of [0.6, 1.05]) this.box(middle, side * 4, y, 0.09, 0.1, length, 0x8a9ca2);
          for (let d = 0; d < length; d += 8) this.box(at(d), side * 4, 0.55, 0.12, 1, 0.12, 0x72898d);
        }
        for (let d = 24; d < length; d += 40) {
          const p = at(d), natural = terrain.sample(p.position.x, p.position.z);
          const ground = corridor.height(p.position.x, p.position.z, natural), depth = p.position.y - ground;
          if (depth < 5) continue;
          this.box(p, 0, -1.65, 7.8, 0.8, 2.4, 0x8a9392);
          for (const side of [-1, 1]) {
            const base = Math.min(...[-1.65, 1.65].flatMap(across => [-1.8, 1.8].map(along => {
              const x = p.position.x + Math.cos(p.heading) * (side * 2.5 + across) + p.tangent.x * along;
              const z = p.position.z + Math.sin(p.heading) * (side * 2.5 + across) + p.tangent.z * along;
              return corridor.height(x, z, terrain.sample(x, z));
            })));
            const depth = p.position.y - base;
            this.box(p, side * 2.5, -depth / 2 - 0.8, 1.3, depth - 1.2, 1.8, 0x9da39d);
            this.box(p, side * 2.5, -depth - 0.35, 3.3, 1, 3.6, 0x858f8a);
          }
        }
      }
      this.parts.instanceMatrix.clearUpdateRanges(); this.parts.instanceMatrix.addUpdateRange(0, this.parts.count * 16);
      this.parts.instanceMatrix.needsUpdate = true;
      if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
      if (this.parts.count) this.parts.computeBoundingSphere();
    }
    this.parts.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
    this.parts.visible = visible && this.parts.count > 0;
    this.tunnels.update(sites.flatMap(site => site.tunnels), corridor, terrain, this.version, originX, originZ, visible);
  }

  private box(p: RoadSample, offset: number, y: number, width: number, height: number, length: number, color: number): void {
    if (this.parts.count >= this.parts.instanceMatrix.count) throw new Error('Crossing capacity exceeded');
    const cos = Math.cos(p.heading), sin = Math.sin(p.heading);
    this.matrix.set(cos * width, 0, -sin * length, p.position.x + cos * offset - this.anchorX,
      0, height, 0, p.position.y + y, sin * width, 0, cos * length, p.position.z + sin * offset - this.anchorZ, 0, 0, 0, 1);
    this.parts.setMatrixAt(this.parts.count, this.matrix);
    this.parts.setColorAt(this.parts.count++, this.color.setHex(color));
  }

  dispose(): void {
    this.parts.removeFromParent(); this.parts.dispose(); this.parts.geometry.dispose(); this.parts.material.dispose(); this.tunnels.dispose();
  }
}
