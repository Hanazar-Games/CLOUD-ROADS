import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshStandardMaterial, Vector3, type Scene } from 'three';
import type { BridgeSpan } from '../bridge/BridgeDetector';
import type { TunnelSpan } from '../tunnel/TunnelDetector';
import type { ServiceArea } from '../service/ServicePlanner';
import type { RoadTerrain } from './RoadGenerator';
import type { RoadSample } from './RoadSegment';
import type { RoadCorridor } from './RoadCorridor';
import type { WorldOptions } from '../world/WorldOptions';
import { hashSeed } from '../world/WorldSeed';
import { roadProfile } from './RoadProfile';
import { hasBridgeScreen } from './RoadProtection';

type Point = { x: number; y: number; z: number };

export class RoadsideScenery {
  readonly hardware = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0.65, metalness: 0.25 }), 24576);
  readonly foliage = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshStandardMaterial({ roughness: 1, flatShading: true }), 8192);
  readonly screens = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xa3c2c4, roughness: 0.35, metalness: 0.15 }), 16384);
  readonly wires = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: 0x343f43 }));
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private readonly profile;
  private version = -1;
  private x = 0; private z = 0;

  constructor(scene: Scene, private readonly seed: string, private readonly options: Readonly<WorldOptions>) {
    this.profile = roadProfile(options);
    for (const mesh of [this.hardware, this.foliage, this.screens]) { mesh.count = 0; mesh.castShadow = mesh.receiveShadow = true; }
    for (const mesh of [this.hardware, this.foliage, this.screens, this.wires]) { mesh.visible = false; scene.add(mesh); }
  }

  update(samples: readonly RoadSample[], bridges: readonly BridgeSpan[], tunnels: readonly TunnelSpan[], services: readonly ServiceArea[],
    corridor: RoadCorridor, terrain: RoadTerrain, version: number, originX: number, originZ: number, visible: boolean): void {
    if (version !== this.version) {
      this.version = version; this.x = samples[0]?.position.x ?? 0; this.z = samples[0]?.position.z ?? 0;
      this.hardware.count = this.foliage.count = this.screens.count = 0;
      const wireData: number[] = [], last = new Map<number, { sample: RoadSample; point: Point; high: boolean }>();
      for (let i = 1; i < samples.length; i++) {
        const s = samples[i], previous = samples[i - 1], d = s.distance;
        const tunnel = tunnels.some(b => b.start.routeId === s.routeId && d >= b.start.distance - 12 && d <= b.end.distance + 12);
        const access = s.opening !== undefined || services.some(site => site.sample.routeId === s.routeId && d >= site.start - 20 && d <= site.end + 20);
        if (s.routeId !== previous.routeId || tunnel || access) { last.clear(); continue; }
        const bridge = bridges.some(b => b.start.routeId === s.routeId && previous.distance >= b.start.distance && d <= b.end.distance);
        const cos = Math.cos(s.heading), sin = Math.sin(s.heading), width = this.profile.outerHalfWidth;
        if (bridge && hasBridgeScreen(this.seed, s, this.options)) {
          for (const side of [-1, 1]) {
            const offset = side * (width + 0.5), a = { x: previous.position.x + Math.cos(previous.heading) * offset,
              y: previous.position.y + 2.75, z: previous.position.z + Math.sin(previous.heading) * offset };
            const b = { x: s.position.x + cos * offset, y: s.position.y + 2.75, z: s.position.z + sin * offset };
            this.beam(this.screens, a, b, 0.16, 2.4, 0xffffff);
            if (Math.floor(d / 6) !== Math.floor(previous.distance / 6))
              this.box(this.hardware, { ...b, y: b.y - 0.2 }, 0.22, 2.8, 0.24, s.heading, 0x5c737b);
          }
        }
        if (bridge || this.options.roadType === 'mountain') { last.clear(); continue; }
        const ground = (offset: number): Point | undefined => {
          const x = s.position.x + cos * offset, z = s.position.z + sin * offset;
          if (corridor.serviceCover(x, z) || corridor.tunnelCover(x, z) || corridor.distance(x, z, width + 5) < width + 4) return;
          const y = corridor.height(x, z, terrain.sample(x, z));
          return Math.abs(y - s.position.y) < 22 ? { x, y, z } : undefined;
        };
        if (Math.floor(d / 32) !== Math.floor(previous.distance / 32)) for (const side of [-1, 1]) {
          if ((hashSeed(`${this.seed}:avenue-density:${s.routeId}:${Math.floor(d / 32)}:${side}`) % 1000) / 1000 >= Math.min(1, this.options.vegetationDensity)) continue;
          const p = ground(side * (width + 8));
          if (!p || Math.abs(p.y - s.position.y) > 7) continue;
          const arid = ['desert', 'dunes', 'badlands'].includes(this.options.terrain), variation = hashSeed(`${this.seed}:tree:${s.routeId}:${Math.floor(d / 32)}`) % 5;
          const height = arid ? 3.8 : 5.5 + variation * 0.3;
          this.box(this.hardware, { ...p, y: p.y + height / 2 }, 0.25, height, 0.25, s.heading, 0x75644e);
          this.box(this.foliage, { ...p, y: p.y + height }, arid ? 2.6 : 2.1, arid ? 1.3 : 2.8, 2.1, s.heading, arid ? 0x858d59 : variation % 2 ? 0x56754b : 0x668552);
        }
        const high = hashSeed(`${this.seed}:utility:${s.routeId}:${Math.floor(d / 1536)}`) % 3 === 0;
        const spacing = high ? 192 : 96;
        if (Math.floor(d / spacing) === Math.floor(previous.distance / spacing)) continue;
        const side = 1, p = ground(width + (high ? 27 : 17));
        if (!p) { last.delete(side); continue; }
        const height = high ? 28 : 11, previousPole = last.get(side);
        if (high) {
          for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
            const x = p.x + dx * 2.5, z = p.z + dz * 2.5, y = corridor.height(x, z, terrain.sample(x, z));
            this.box(this.hardware, { x, y: y + 0.1, z }, 1.3, 0.6, 1.3, 0, 0xa5a69b);
            this.beam(this.hardware, { x, y, z }, { x: p.x + dx * 0.8, y: p.y + height, z: p.z + dz * 0.8 }, 0.24, 0.24, 0x87918d);
            for (let level = 0; level < 4; level++) {
              const y = level * 6, extent = 2.5 - y / height * 1.7, next = 2.5 - (y + 6) / height * 1.7;
              this.beam(this.hardware, { x: p.x + dx * extent, y: p.y + y, z: p.z + dz * extent },
                { x: p.x - dx * next, y: p.y + y + 6, z: p.z + dz * next }, 0.1, 0.1, 0x87918d);
              this.beam(this.hardware, { x: p.x + dx * extent, y: p.y + y, z: p.z + dz * extent },
                { x: p.x + dx * next, y: p.y + y + 6, z: p.z - dz * next }, 0.1, 0.1, 0x87918d);
            }
          }
        } else this.box(this.hardware, { ...p, y: p.y + height / 2 }, 0.34, height, 0.34, s.heading, 0x8c8c7d);
        this.box(this.hardware, { ...p, y: p.y + height }, high ? 10 : 4.8, 0.24, 0.3, s.heading, 0x697e80);
        for (const offset of [-1, 0, 1]) this.box(this.hardware,
          { x: p.x + cos * offset * (high ? 4.4 : 2), y: p.y + height - 0.35, z: p.z + sin * offset * (high ? 4.4 : 2) }, 0.25, 0.8, 0.25, s.heading, 0xacc2b8);
        if (previousPole && previousPole.high === high && previousPole.sample.routeId === s.routeId && d - previousPole.sample.distance < spacing * 1.4) {
          for (const offset of [-1, 0, 1]) {
            const width = offset * (high ? 4.4 : 2), a = previousPole.point, heading = previousPole.sample.heading;
            const points = Array.from({ length: 9 }, (_, j) => {
              const t = j / 8;
              return { x: a.x + Math.cos(heading) * width + (p.x + cos * width - a.x - Math.cos(heading) * width) * t,
                y: a.y + (p.y - a.y) * t + height - 0.7 - (high ? 4 : 1.5) * 4 * t * (1 - t),
                z: a.z + Math.sin(heading) * width + (p.z + sin * width - a.z - Math.sin(heading) * width) * t };
            });
            if (points.every(q => corridor.distance(q.x, q.z, this.profile.outerHalfWidth + 2) > this.profile.outerHalfWidth + 1
              && q.y > corridor.height(q.x, q.z, terrain.sample(q.x, q.z)) + 6)) for (let j = 1; j < points.length; j++)
              for (const q of [points[j - 1], points[j]]) wireData.push(q.x - this.x, q.y, q.z - this.z);
          }
        }
        last.set(side, { sample: s, point: p, high });
      }
      const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(wireData, 3)); geometry.computeBoundingSphere();
      this.wires.geometry.dispose(); this.wires.geometry = geometry;
      for (const mesh of [this.hardware, this.foliage, this.screens]) {
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.hardware, this.foliage, this.screens, this.wires]) { mesh.position.set(this.x - originX, 0, this.z - originZ); mesh.visible = visible; }
  }

  private box(mesh: InstancedMesh, p: Point, w: number, h: number, l: number, heading: number, color: number): void {
    const c = Math.cos(heading), s = Math.sin(heading);
    this.matrix.set(c * w, 0, -s * l, p.x - this.x, 0, h, 0, p.y, s * w, 0, c * l, p.z - this.z, 0, 0, 0, 1);
    this.instance(mesh, color);
  }

  private beam(mesh: InstancedMesh, a: Point, b: Point, w: number, h: number, color: number): void {
    const z = new Vector3(a.x - b.x, a.y - b.y, a.z - b.z), length = z.length(); z.normalize();
    const x = new Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
    this.matrix.makeBasis(x.multiplyScalar(w), y.multiplyScalar(h), z.multiplyScalar(length + 0.08));
    this.matrix.setPosition((a.x + b.x) / 2 - this.x, (a.y + b.y) / 2, (a.z + b.z) / 2 - this.z);
    this.instance(mesh, color);
  }

  private instance(mesh: InstancedMesh, color: number): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Roadside instance capacity exceeded');
    mesh.setMatrixAt(mesh.count, this.matrix); mesh.setColorAt(mesh.count++, this.color.setHex(color));
  }

  dispose(): void {
    for (const mesh of [this.hardware, this.foliage, this.screens]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
    this.wires.removeFromParent(); this.wires.geometry.dispose(); this.wires.material.dispose();
  }
}
