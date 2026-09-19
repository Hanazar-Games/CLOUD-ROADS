import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { ServiceArea } from './ServicePlanner';
import { padPoint, type ServicePad, type ServicePoint } from './ServiceTerrain';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';

type Point = [number, number, number];
const quad = (data: number[], a: Point, b: Point, c: Point, d: Point) => data.push(...a, ...b, ...c, ...b, ...d, ...c);

function roofGeometry(): BufferGeometry {
  const geometry = new BufferGeometry(), data: number[] = [];
  quad(data, [-0.5, 0, 0.5], [0, 1, 0.5], [-0.5, 0, -0.5], [0, 1, -0.5]);
  quad(data, [0, 1, 0.5], [0.5, 0, 0.5], [0, 1, -0.5], [0.5, 0, -0.5]);
  data.push(-0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5);
  geometry.setAttribute('position', new Float32BufferAttribute(data, 3)); geometry.computeVertexNormals();
  return geometry;
}

export class ServiceMesh {
  readonly pavement = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: 0x41494a, roughness: 0.87 }));
  readonly buildings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0.78 }), 8000);
  readonly windows = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x395764, metalness: 0.3, roughness: 0.22, emissive: 0xffd6a1, emissiveIntensity: 0 }), 2000);
  readonly markings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xece7ce, roughness: 0.8 }), 4000);
  readonly lights = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xffebc7, emissive: 0xffd39a, emissiveIntensity: 1.6 }), 512);
  readonly roofs = new InstancedMesh(roofGeometry(), new MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }), 64);
  readonly landscaping = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ roughness: 1, flatShading: true }), 512);
  private readonly batches = [this.buildings, this.windows, this.markings, this.lights, this.roofs, this.landscaping];
  readonly lampPositions: ServicePoint[] = [];
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    for (const mesh of [this.pavement, ...this.batches]) {
      mesh.visible = false; mesh.receiveShadow = true; mesh.castShadow = mesh === this.buildings || mesh === this.roofs || mesh === this.landscaping;
      scene.add(mesh);
    }
    for (const mesh of this.batches) mesh.count = 0;
  }

  update(sites: readonly ServiceArea[], version: number, originX: number, originZ: number): void {
    if (this.version !== version) {
      this.version = version;
      this.anchorX = sites[0]?.sample.position.x ?? 0;
      this.anchorZ = sites[0]?.sample.position.z ?? 0;
      this.lampPositions.length = 0;
      for (const mesh of this.batches) mesh.count = 0;
      const data: number[] = [];
      const vertex = (point: ServicePoint, height = 0): Point => [point.x - this.anchorX, point.y + height, point.z - this.anchorZ];
      for (const site of sites) {
        for (const pad of site.ground.pads) {
          quad(data, vertex(padPoint(pad, -33, -75)), vertex(padPoint(pad, 33, -75)), vertex(padPoint(pad, -33, 75)), vertex(padPoint(pad, 33, 75)));
          this.build(pad);
        }
        for (const { a, b } of site.ground.access) {
          const length = Math.hypot(b.x - a.x, b.z - a.z), nx = (a.z - b.z) / length * 3.5, nz = (b.x - a.x) / length * 3.5;
          const ay = a.slopeX * nx + a.slopeZ * nz, by = b.slopeX * nx + b.slopeZ * nz;
          quad(data, vertex({ x: a.x - nx, y: a.y - ay, z: a.z - nz }, 0.015), vertex({ x: a.x + nx, y: a.y + ay, z: a.z + nz }, 0.015),
            vertex({ x: b.x - nx, y: b.y - by, z: b.z - nz }, 0.015), vertex({ x: b.x + nx, y: b.y + by, z: b.z + nz }, 0.015));
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(data, 3));
      geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      this.pavement.geometry.dispose(); this.pavement.geometry = geometry;
      for (const mesh of this.batches) {
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.pavement, ...this.batches]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = sites.length > 0;
    }
  }

  private build(pad: ServicePad): void {
    const box = (x: number, along: number, y: number, w: number, h: number, l: number, color: number, followGrade = false) =>
      this.box(this.buildings, pad, x * pad.side, along, y, w, h, l, color, followGrade);
    const stripe = (x: number, along: number, w: number, l: number) => this.box(this.markings, pad, x * pad.side, along, 0.025, w, 0.012, l, 0xffffff, true);
    const facade = this.options.terrain === 'desert' || this.options.terrain === 'dunes' ? 0xc7ac86 : 0xc1c3b5;
    box(0, 0, -0.8, 66, 1.3, 150, 0x7e827b, true);
    for (const x of [-33, 33]) box(x, 0, 0.14, 0.35, 0.28, 150, 0xb8b6a5, true);
    for (const along of [-75, 75]) box(6.5, along, 0.14, 53, 0.28, 0.35, 0xb8b6a5, true);
    box(15, 28, 0.25, 23, 0.8, 32, 0x98978d, true);
    box(15, 28, 2.8, 22, 5, 30, facade);
    const roofColor = this.options.terrain === 'desert' || this.options.terrain === 'dunes' ? 0x9b6244 : 0x35594f;
    this.box(this.roofs, pad, 15 * pad.side, 28, 5.25, 25, 2.2, 33, roofColor);
    box(15, 28, 7.47, 0.28, 0.12, 33.2, roofColor);
    for (const x of [2.5, 27.5]) box(x, 28, 5.25, 0.22, 0.28, 33, 0x8eaa9a);
    box(2, 28, 4.2, 5, 0.25, 30, 0x53695f);
    for (const along of [16, 20, 24, 28, 32, 36, 40]) {
      this.box(this.windows, pad, 3.94 * pad.side, along, 2.5, 0.1, 2.1, 3.4, 0xffffff);
      box(1, along, 2, 0.12, 4, 0.12, 0x6e756b);
      box(3.85, along - 1.8, 2.5, 0.16, 2.7, 0.12, 0x465952);
    }
    for (const y of [1.2, 3.8]) box(3.8, 28, y, 0.16, 0.12, 28, 0x465952);
    for (const along of [25.5, 30.5]) box(3.78, along, 1.8, 0.12, 3.6, 0.2, 0xc9cfbe);
    for (const along of [27.7, 28.3]) box(3.65, along, 1.7, 0.22, 0.65, 0.06, 0xd8dfcf);
    box(14, -38, 5.6, 26, 0.55, 23, 0x427b72);
    box(14, -38, 5.94, 26.6, 0.15, 23.6, 0xd5ded4);
    for (const along of [-49.6, -26.4]) box(14, along, 5.63, 26.5, 0.3, 0.12, 0xe4b45d);
    for (const x of [3, 25]) for (const along of [-47, -29]) box(x, along, 2.8, 0.4, 5.6, 0.4, 0xadb4a8);
    for (const along of [-43, -33]) {
      box(14, along, 0.15, 3.8, 0.3, 2.2, 0xb6b9ab);
      for (const x of [13, 15]) {
        box(x, along, 1.1, 0.7, 1.7, 0.65, 0xe0d9c5);
        box(x, along, 1.65, 0.73, 0.55, 0.7, 0x2f766a);
        this.box(this.windows, pad, x * pad.side, along - 0.34, 1.6, 0.4, 0.3, 0.05, 0xffffff);
        box(x + 0.46, along, 0.94, 0.08, 1.2, 0.08, 0x273334);
        box(x + 0.38, along, 1.48, 0.28, 0.14, 0.1, 0x273334);
      }
    }
    for (const x of [1, 27]) for (const along of [-50, -26]) {
      box(x, along, 0.5, 0.22, 1, 0.22, 0xd9b45a);
      box(x, along, 0.72, 0.24, 0.15, 0.24, 0x354345);
    }
    for (const along of [-46, -30]) {
      this.box(this.lights, pad, 14 * pad.side, along, 5.25, 12, 0.1, 0.5, 0xffffff);
      this.lampPositions.push(padPoint(pad, 14 * pad.side, along, 5));
    }
    for (let i = 0; i <= 12; i++) stripe(-10, -6 + i * 5, 6.5, 0.12);
    stripe(-13.2, 24, 0.12, 60);
    for (const along of [-3.5, 11.5, 36.5, 51.5]) {
      const tint = along < 0 ? 0xc4cbc8 : along < 20 ? 0x426477 : along < 40 ? 0xb9b0a0 : 0x966152;
      box(-10, along, 0.72, 4.2, 0.95, 1.85, tint);
      box(-10.3, along, 1.38, 2.25, 0.68, 1.7, tint);
      this.box(this.windows, pad, -10.3 * pad.side, along, 1.4, 2.28, 0.48, 1.72, 0xffffff);
      for (const x of [-11.4, -8.6]) for (const z of [-0.9, 0.9]) box(x, along + z, 0.34, 0.64, 0.58, 0.23, 0x22292a);
    }
    for (const along of [-11, -9, -7, -5, -3, -1]) stripe(-21, along, 6, 0.55);
    for (const along of [54, 64]) {
      box(15, along, 0.9, 4, 0.16, 1.5, 0x886c4e);
      for (const z of [-1.3, 1.3]) box(15, along + z, 0.5, 4.5, 0.16, 0.45, 0x967950);
      for (const x of [13.5, 16.5]) box(x, along, 0.4, 0.16, 0.8, 1.2, 0x54615b);
    }
    for (const x of [10, 21]) for (const along of [51, 68]) box(x, along, 1.9, 0.23, 3.8, 0.23, 0x8e7450);
    for (const x of [10, 21]) box(x, 59.5, 3.85, 0.3, 0.25, 18, 0x8e7450);
    for (let along = 51; along <= 68; along += 1.7) box(15.5, along, 4, 12, 0.18, 0.3, 0xb09770);
    for (const along of [-12, 4, 59]) {
      box(29, along, 0.25, 4, 0.5, 8, 0xafb2a1, true);
      box(29, along, 0.53, 3.7, 0.06, 7.7, 0x5d5943, true);
      box(29, along, 2, 0.2, 3, 0.2, 0x756044);
      this.box(this.landscaping, pad, 29 * pad.side, along, 4.1, 2.6, 2.2, 2.6, 0x637e43);
      for (const dz of [-2.5, 2.5]) this.box(this.landscaping, pad, 29 * pad.side, along + dz, 1.1, 1.6, 0.75, 1.5, 0x83964e);
    }
    for (const along of [11, 36]) {
      box(-17, along, 1.25, 0.7, 2.5, 0.65, 0xd0d7c8);
      box(-17, along, 1.8, 0.74, 0.65, 0.7, 0x4a977f);
      box(-17.46, along, 1.1, 0.1, 1.6, 0.1, 0x29383a);
      this.box(this.windows, pad, -17 * pad.side, along - 0.36, 1.8, 0.4, 0.35, 0.04, 0xffffff);
    }
    box(28, 50, 0.7, 1, 1.4, 1, 0x3b6257);
    for (const along of [-66, 64]) {
      box(-32, along, 3.8, 0.2, 7.6, 0.2, 0x58696d);
      this.box(this.lights, pad, -32 * pad.side, along, 7.6, 1.2, 0.15, 1.2, 0xffffff);
      this.lampPositions.push(padPoint(pad, -32 * pad.side, along, 7.4));
    }
  }

  private box(mesh: InstancedMesh, pad: ServicePad, x: number, along: number, y: number, w: number, h: number, l: number, color: number, followGrade = false): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Service area instance capacity exceeded');
    const p = padPoint(pad, x, along, y), cos = Math.cos(pad.heading), sin = Math.sin(pad.heading);
    this.matrix.set(cos * w, 0, -sin * l, p.x - this.anchorX, 0, h, followGrade ? -pad.grade * l : 0, p.y,
      sin * w, 0, cos * l, p.z - this.anchorZ, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count, this.matrix);
    mesh.setColorAt(mesh.count++, this.color.setHex(color));
  }

  dispose(): void {
    for (const mesh of [this.pavement, ...this.batches]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const mesh of this.batches) mesh.dispose();
  }
}
