import { BoxGeometry, BufferGeometry, DoubleSide, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { BiomeSystem } from '../biome/BiomeSystem';
import type { RoadCorridor } from '../road/RoadCorridor';
import { roadFrame } from '../road/RoadFrame';
import type { RoadTerrain } from '../road/RoadGenerator';
import { roadProfile } from '../road/RoadProfile';
import type { RoadSample } from '../road/RoadSegment';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import type { TunnelSpan } from './TunnelDetector';

type Point = [number, number, number];
export interface TunnelLamp { x: number; y: number; z: number }
const quad = (data: number[], a: Point, b: Point, c: Point, d: Point) => data.push(...a, ...b, ...c, ...b, ...d, ...c);

export class TunnelMesh {
  readonly lining = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: 0x939b9c, roughness: 0.91, side: DoubleSide }));
  readonly cover = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide }));
  readonly portals = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: 0xbcb8a8, roughness: 0.85, side: DoubleSide }));
  readonly lights = new InstancedMesh(new BoxGeometry(0.7, 0.12, 1.8),
    new MeshStandardMaterial({ color: 0xffdeb4, emissive: 0xffc982, emissiveIntensity: 2 }), 2048);
  readonly lampPositions: TunnelLamp[] = [];
  private readonly profile;
  private readonly biomes;
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene, seed: string, options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
    this.biomes = new BiomeSystem(seed, options.terrain);
    this.lining.material.onBeforeCompile = shader => {
      shader.vertexShader = `varying vec2 vTunnelUv;\n${shader.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\nvTunnelUv = uv;');
      shader.fragmentShader = `varying vec2 vTunnelUv;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `
        #include <color_fragment>
        float aa = max(fwidth(vTunnelUv.x), 0.015);
        float joint = 1.0 - smoothstep(0.02, 0.02 + aa, abs(mod(vTunnelUv.x + 6.0, 12.0) - 6.0));
        float band = 1.0 - smoothstep(0.12, 0.15, abs(vTunnelUv.y - 0.95));
        diffuseColor.rgb *= 1.0 - joint * 0.35;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.31, 0.075), band * 0.7);
      `);
    };
    this.lights.count = 0;
    for (const mesh of [this.lining, this.cover, this.portals, this.lights]) {
      mesh.visible = false;
      mesh.receiveShadow = true;
      mesh.castShadow = mesh !== this.lights;
      scene.add(mesh);
    }
  }

  update(spans: readonly TunnelSpan[], corridor: RoadCorridor, terrain: RoadTerrain, version: number,
    originX: number, originZ: number, nearRoute: boolean): void {
    if (this.version !== version) {
      this.version = version;
      this.anchorX = spans[0]?.start.position.x ?? 0;
      this.anchorZ = spans[0]?.start.position.z ?? 0;
      const lining: number[] = [], cover: number[] = [], portals: number[] = [];
      const uv: number[] = [];
      this.lights.count = 0;
      this.lampPositions.length = 0;
      const half = this.profile.halfWidth + 0.75;
      const arch: [number, number][] = [[-half, -0.2], [-half, 4.2]];
      for (let i = 1; i <= 12; i++) arch.push([-half * Math.cos(i * Math.PI / 12), 4.2 + Math.sin(i * Math.PI / 12) * 3.4]);
      arch.push([half, -0.2]);
      const columns = [...new Set([-160, -120, -80, -50, -this.profile.outerHalfWidth - 4,
        ...this.profile.centers.flatMap(center => [center - half - 0.01, ...arch.map(([x]) => center + x), center + half + 0.01]),
        this.profile.outerHalfWidth + 4, 50, 80, 120, 160])].sort((a, b) => a - b);
      for (const span of spans) {
        const rows = span.samples.filter((_, i) => i % 2 === 0 || i === span.samples.length - 1);
        let nextLamp = Math.ceil(span.start.distance / 24) * 24;
        const top = (sample: RoadSample, offset: number): Point => {
          const p = this.point(sample, offset, 0);
          const natural = terrain.sample(p[0] + this.anchorX, p[2] + this.anchorZ);
          const ground = corridor.height(p[0] + this.anchorX, p[2] + this.anchorZ, natural);
          const blend = Math.max(0, 1 - Math.max(0, Math.abs(offset) - this.profile.outerHalfWidth - 4) / 120);
          const approach = Math.min(1, (sample.distance - span.start.distance) / 80, (span.end.distance - sample.distance) / 80);
          const entrance = Math.max(ground, sample.position.y + 9.5);
          const roof = entrance + (Math.max(natural, entrance) - entrance) * approach * approach * (3 - 2 * approach);
          p[1] = ground + (roof - ground) * blend - (blend === 0 ? 0.3 : 0);
          return p;
        };
        for (let i = 0; i < rows.length; i++) {
          const sample = rows[i];
          if (i > 0) {
            const previous = rows[i - 1];
            for (const center of this.profile.centers) for (let j = 1; j < arch.length; j++) {
              const [ax, ay] = arch[j - 1], [bx, by] = arch[j];
              quad(lining, this.point(previous, center + ax, ay), this.point(previous, center + bx, by),
                this.point(sample, center + ax, ay), this.point(sample, center + bx, by));
              const a = previous.distance - span.start.distance, b = sample.distance - span.start.distance;
              uv.push(a, ay, a, by, b, ay, a, by, b, by, b, ay);
            }
            for (let j = 1; j < columns.length; j++) quad(cover, top(previous, columns[j - 1]), top(previous, columns[j]), top(sample, columns[j - 1]), top(sample, columns[j]));
          }
          if (sample.distance >= nextLamp) {
            nextLamp += 24;
            for (const center of this.profile.centers) {
              const [x, y, z] = this.point(sample, center, 7.35);
              this.lights.setMatrixAt(this.lights.count++, new Matrix4().makeRotationY(-sample.heading).setPosition(x, y, z));
              this.lampPositions.push({ x: x + this.anchorX, y: y - 0.3, z: z + this.anchorZ });
            }
          }
        }
        for (const sample of [span.start, span.end]) {
          const end = sample === span.end ? 1 : -1;
          const bottom = (offset: number): Point => {
            for (const center of this.profile.centers) {
              const x = offset - center;
              if (Math.abs(x) <= half + 0.0001) return this.point(sample, offset, 4.2 + Math.sqrt(Math.max(0, 1 - (x / half) ** 2)) * 3.4);
            }
            const p = this.point(sample, offset, -0.2);
            p[1] = corridor.height(p[0] + this.anchorX, p[2] + this.anchorZ, terrain.sample(p[0] + this.anchorX, p[2] + this.anchorZ)) - 0.4;
            return p;
          };
          for (let j = 1; j < columns.length; j++) quad(cover, bottom(columns[j - 1]), bottom(columns[j]), top(sample, columns[j - 1]), top(sample, columns[j]));
          for (const center of this.profile.centers) for (let j = 1; j < arch.length; j++) {
            const [ax, ay] = arch[j - 1], [bx, by] = arch[j];
            const innerA = this.point(sample, center + ax, ay, end * 0.8), innerB = this.point(sample, center + bx, by, end * 0.8);
            const outerA = this.point(sample, center + ax * 1.1, ay + 0.65, end * 0.8), outerB = this.point(sample, center + bx * 1.1, by + 0.65, end * 0.8);
            quad(portals, innerA, innerB, outerA, outerB);
            quad(portals, innerA, innerB, this.point(sample, center + ax, ay, -end * 0.4), this.point(sample, center + bx, by, -end * 0.4));
            quad(portals, outerA, outerB, this.point(sample, center + ax * 1.1, ay + 0.65, -end * 0.4), this.point(sample, center + bx * 1.1, by + 0.65, -end * 0.4));
          }
        }
      }
      for (const [mesh, data] of [[this.lining, lining], [this.cover, cover], [this.portals, portals]] as const) {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(data, 3));
        geometry.computeVertexNormals();
        if (mesh === this.lining) geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
        if (mesh === this.cover) {
          const colors: number[] = [], normals = geometry.getAttribute('normal');
          for (let i = 0; i < data.length; i += 3) colors.push(...this.biomes.sample(data[i] + this.anchorX, data[i + 2] + this.anchorZ, data[i + 1], Math.abs(normals.getY(i / 3))).color);
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        }
        geometry.computeBoundingSphere();
        mesh.geometry.dispose();
        mesh.geometry = geometry;
      }
      this.lights.instanceMatrix.needsUpdate = true;
      if (this.lights.count) this.lights.computeBoundingSphere();
    }
    for (const mesh of [this.lining, this.cover, this.portals, this.lights]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = nearRoute && spans.length > 0;
    }
  }

  private point(sample: RoadSample, offset: number, height: number, along = 0): Point {
    const { right, normal } = roadFrame(sample), p = sample.position;
    return [p.x - this.anchorX + right.x * offset + normal.x * height + sample.tangent.x * along,
      p.y + right.y * offset + normal.y * height + sample.tangent.y * along,
      p.z - this.anchorZ + right.z * offset + normal.z * height + sample.tangent.z * along];
  }

  dispose(): void {
    for (const mesh of [this.lining, this.cover, this.portals, this.lights]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.lights.dispose();
  }
}
