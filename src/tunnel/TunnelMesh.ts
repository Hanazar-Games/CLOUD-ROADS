import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, type Scene } from 'three';
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
  readonly equipment = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0.72 }), 50000);
  readonly fans = new InstancedMesh(new CylinderGeometry(0.45, 0.45, 2.2, 12).rotateX(Math.PI / 2),
    new MeshStandardMaterial({ color: 0x748087, metalness: 0.6, roughness: 0.5 }), 1024);
  readonly lampPositions: TunnelLamp[] = [];
  private readonly profile;
  private readonly biomes;
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();

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
    this.equipment.count = this.fans.count = 0;
    for (const mesh of [this.lining, this.cover, this.portals, this.lights, this.equipment, this.fans]) {
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
      const uv: number[] = [], liningNormals: number[] = [];
      this.lights.count = 0;
      this.equipment.count = this.fans.count = 0;
      this.lampPositions.length = 0;
      const half = this.profile.halfWidth + 0.75;
      const arch: [number, number][] = [[-half, -0.2], [-half, 4.2]];
      for (let i = 1; i <= 24; i++) arch.push([-half * Math.cos(i * Math.PI / 24), 4.2 + Math.sin(i * Math.PI / 24) * 3.4]);
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
            const middle = { ...sample, position: { x: (sample.position.x + previous.position.x) / 2,
              y: (sample.position.y + previous.position.y) / 2, z: (sample.position.z + previous.position.z) / 2 } };
            const length = sample.distance - previous.distance + 0.05;
            for (const center of this.profile.centers) for (const side of [-1, 1]) {
              this.box(middle, center + side * (half - 0.35), 0.12, 0.7, 0.24, length, 0x92958d);
              this.box(middle, center + side * (half - 0.11), 3.45, 0.14, 0.14, length, 0x39474f);
            }
            for (const center of this.profile.centers) for (let j = 1; j < arch.length; j++) {
              const [ax, ay] = arch[j - 1], [bx, by] = arch[j];
              quad(lining, this.point(previous, center + ax, ay), this.point(previous, center + bx, by),
                this.point(sample, center + ax, ay), this.point(sample, center + bx, by));
              const a = previous.distance - span.start.distance, b = sample.distance - span.start.distance;
              uv.push(a, ay, a, by, b, ay, a, by, b, by, b, ay);
              const normal = (point: RoadSample, x: number, y: number): Point => {
                let nx = x / (half * half), ny = Math.max(0, y - 4.2) / (3.4 * 3.4);
                const length = Math.hypot(nx, ny); nx /= length; ny /= length;
                const frame = roadFrame(point);
                return [frame.right.x * nx + frame.normal.x * ny, frame.right.y * nx + frame.normal.y * ny, frame.right.z * nx + frame.normal.z * ny];
              };
              quad(liningNormals, normal(previous, ax, ay), normal(previous, bx, by), normal(sample, ax, ay), normal(sample, bx, by));
            }
            for (let j = 1; j < columns.length; j++) quad(cover, top(previous, columns[j - 1]), top(previous, columns[j]), top(sample, columns[j - 1]), top(sample, columns[j]));
          }
          if (sample.distance >= nextLamp) {
            nextLamp += 24;
            for (const center of this.profile.centers) {
              const [x, y, z] = this.point(sample, center, 7.35);
              this.lights.setMatrixAt(this.lights.count++, new Matrix4().makeRotationY(-sample.heading).setPosition(x, y, z));
              this.lampPositions.push({ x: x + this.anchorX, y: y - 0.3, z: z + this.anchorZ });
              for (const side of [-1, 1]) this.box(sample, center + side * (half - 0.08), 0.65, 0.12, 0.22, 0.38, 0xffe6a8);
            }
          }
          if (i > 0 && Math.floor(sample.distance / 96) !== Math.floor(rows[i - 1].distance / 96)) {
            for (const center of this.profile.centers) {
              this.box(sample, center + half - 0.22, 1.4, 0.35, 1.3, 0.65, 0xac3935);
              this.box(sample, center - half + 0.17, 2.2, 0.22, 0.4, 1.2, 0x46b78b);
              for (const offset of [-1.65, 1.65]) {
                const position = this.point(sample, center + offset, 6.45);
                this.matrix.makeRotationY(-sample.heading).setPosition(...position);
                this.fans.setMatrixAt(this.fans.count++, this.matrix);
              }
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
            const outerHeight = (height: number) => height < 0 ? height : height + 0.85;
            const innerA = this.point(sample, center + ax, ay, end * 2.6), innerB = this.point(sample, center + bx, by, end * 2.6);
            const outerA = this.point(sample, center + ax * 1.14, outerHeight(ay), end * 2.6), outerB = this.point(sample, center + bx * 1.14, outerHeight(by), end * 2.6);
            quad(portals, innerA, innerB, outerA, outerB);
            quad(portals, innerA, innerB, this.point(sample, center + ax, ay, -end * 0.4), this.point(sample, center + bx, by, -end * 0.4));
            quad(portals, outerA, outerB, this.point(sample, center + ax * 1.14, outerHeight(ay), -end * 0.4), this.point(sample, center + bx * 1.14, outerHeight(by), -end * 0.4));
          }
          for (const center of this.profile.centers) {
            this.box(sample, center, 8.65, half * 1.4, 0.5, 2.4, 0x667c7c);
            for (const side of [-1, 1]) {
              const wing = { ...sample, position: { x: sample.position.x + sample.tangent.x * end * 4,
                y: sample.position.y + sample.tangent.y * end * 4, z: sample.position.z + sample.tangent.z * end * 4 } };
              this.box(wing, center + side * (half + 0.55), 1.05, 0.6, 2.1, 8, 0xa7a697);
            }
          }
        }
      }
      for (const [mesh, data] of [[this.lining, lining], [this.cover, cover], [this.portals, portals]] as const) {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(data, 3));
        geometry.computeVertexNormals();
        if (mesh === this.lining) {
          geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
          geometry.setAttribute('normal', new Float32BufferAttribute(liningNormals, 3));
        }
        if (mesh === this.cover) {
          const colors: number[] = [], normals = geometry.getAttribute('normal');
          for (let i = 0; i < data.length; i += 3) colors.push(...this.biomes.sample(data[i] + this.anchorX, data[i + 2] + this.anchorZ, data[i + 1], Math.abs(normals.getY(i / 3))).color);
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        }
        geometry.computeBoundingSphere();
        mesh.geometry.dispose();
        mesh.geometry = geometry;
      }
      for (const mesh of [this.lights, this.equipment, this.fans]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.lining, this.cover, this.portals, this.lights, this.equipment, this.fans]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = nearRoute && spans.length > 0;
    }
  }

  private box(sample: RoadSample, offset: number, height: number, width: number, tall: number, length: number, color: number): void {
    if (this.equipment.count >= this.equipment.instanceMatrix.count) throw new Error('Tunnel equipment capacity exceeded');
    const { right: r, normal: n } = roadFrame(sample), p = this.point(sample, offset, height), t = sample.tangent;
    this.matrix.set(r.x * width, n.x * tall, -t.x * length, p[0], r.y * width, n.y * tall, -t.y * length, p[1],
      r.z * width, n.z * tall, -t.z * length, p[2], 0, 0, 0, 1);
    this.equipment.setMatrixAt(this.equipment.count, this.matrix);
    this.equipment.setColorAt(this.equipment.count++, this.color.setHex(color));
  }

  private point(sample: RoadSample, offset: number, height: number, along = 0): Point {
    const { right, normal } = roadFrame(sample), p = sample.position;
    return [p.x - this.anchorX + right.x * offset + normal.x * height + sample.tangent.x * along,
      p.y + right.y * offset + normal.y * height + sample.tangent.y * along,
      p.z - this.anchorZ + right.z * offset + normal.z * height + sample.tangent.z * along];
  }

  dispose(): void {
    for (const mesh of [this.lining, this.cover, this.portals, this.lights, this.equipment, this.fans]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.lights.dispose(); this.equipment.dispose(); this.fans.dispose();
  }
}
