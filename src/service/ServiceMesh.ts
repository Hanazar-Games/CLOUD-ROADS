import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector2, type Scene } from 'three';
import { RoadIndex } from '../road/RoadIndex';
import type { ServiceArea } from './ServicePlanner';
import { padPoint, type ServicePad, type ServicePoint, type ServiceCrossover } from './ServiceTerrain';
import type { WorldOptions } from '../world/WorldOptions';
import type { RoadTerrain } from '../road/RoadGenerator';
import { createConcreteMaterial } from '../bridge/ConcreteMaterial';
import { serviceArchitecture, type ServiceArchitecture } from './ServiceArchitecture';
import { parkingSlots } from './ServiceParking';
import { chargingBays, chargingPosts, chargingPostColumns } from './ServiceAmenities';
import { serviceDetails } from './ServiceDetails';
import { addRetroreflection } from '../render/ReflectiveMaterial';
import { accessQuads } from '../road/SurfaceRibbon';
import type { RoadCorridor } from '../road/RoadCorridor';
import { createPavementMaterial } from '../road/PavementMaterial';
import type { PavementTextures } from '../road/PavementTextures';
import { NearbyDetails } from '../render/NearbyDetails';
import { chargerDetailGeometry, picnicDetailGeometry } from '../render/InfrastructureGeometry';

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
  private readonly materialOrigin = new Vector2();
  readonly structures = new InstancedMesh(new BoxGeometry(), createConcreteMaterial(this.materialOrigin), 8000);
  readonly railings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xaebdc0, metalness: 0.6, roughness: 0.45 }), 16000);
  private readonly pavementOrigin = new Vector2();
  readonly pavement: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly buildings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0.78 }), 8000);
  readonly windows = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x395764, metalness: 0.3, roughness: 0.22, emissive: 0xffd6a1, emissiveIntensity: 0 }), 2000);
  readonly markings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xece7ce, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 16000);
  readonly lights = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xffebc7, emissive: 0xffd39a, emissiveIntensity: 1.6 }), 512);
  readonly roofs = new InstancedMesh(roofGeometry(), new MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 }), 64);
  readonly landscaping = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ roughness: 1, flatShading: true }), 512);
  readonly treeTrunks = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 1 }), 128);
  private readonly batches = [this.buildings, this.windows, this.markings, this.lights, this.roofs, this.landscaping, this.treeTrunks, this.structures, this.railings];
  readonly lampPositions: (ServicePoint & { covered?: boolean })[] = [];
  readonly chargerDetails: NearbyDetails;
  readonly picnicDetails: NearbyDetails;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene, private readonly options: Readonly<WorldOptions>, private readonly terrain: RoadTerrain, textures?: PavementTextures) {
    this.pavement = new Mesh(new BufferGeometry(), createPavementMaterial(this.pavementOrigin, textures));
    this.chargerDetails = new NearbyDetails(scene, chargerDetailGeometry(), 'service-charger-details', 24);
    this.picnicDetails = new NearbyDetails(scene, picnicDetailGeometry(), 'service-picnic-details', 24);
    this.picnicDetails.mesh.material.metalness = 0; this.picnicDetails.mesh.material.roughness = 0.9;
    addRetroreflection(this.markings.material);
    for (const mesh of [this.pavement, ...this.batches]) {
      mesh.visible = false; mesh.receiveShadow = true; mesh.castShadow = mesh === this.buildings || mesh === this.roofs || mesh === this.landscaping || mesh === this.treeTrunks || mesh === this.structures;
      scene.add(mesh);
    }
    for (const mesh of this.batches) mesh.count = 0;
  }

  update(sites: readonly ServiceArea[], version: number, originX: number, originZ: number, vegetation = true, corridor?: RoadCorridor): void {
    if (this.version !== version) {
      this.version = version;
      this.anchorX = sites[0]?.sample.position.x ?? 0;
      this.anchorZ = sites[0]?.sample.position.z ?? 0;
      this.chargerDetails.clear(this.anchorX, this.anchorZ); this.picnicDetails.clear(this.anchorX, this.anchorZ);
      this.pavementOrigin.set(this.anchorX % 40, this.anchorZ % 40);
      this.lampPositions.length = 0;
      for (const mesh of this.batches) mesh.count = 0;
      const data: number[] = [];
      const vertex = (point: ServicePoint, height = 0): Point => [point.x - this.anchorX, point.y + height, point.z - this.anchorZ];
      for (const site of sites) {
        const underpass = new RoadIndex(site.ground.crossover?.kind === 'under' ? site.ground.crossover.access : []);
        for (const pad of site.ground.pads) {
          quad(data, vertex(padPoint(pad, -pad.halfWidth, -pad.halfLength)), vertex(padPoint(pad, pad.halfWidth, -pad.halfLength)), vertex(padPoint(pad, -pad.halfWidth, pad.halfLength)), vertex(padPoint(pad, pad.halfWidth, pad.halfLength)));
          this.build(pad, serviceArchitecture(this.options.terrain, site.id), site);
          if (site.ground.elevated) for (let along = -Math.floor((pad.halfLength - 20) / 30) * 30; along < pad.halfLength; along += 30) {
            this.box(this.structures, pad, 0, along, -1.7, pad.halfWidth * 2, 0.6, 2, 0xffffff, true);
            for (let x = -Math.floor((pad.halfWidth - 12) / 32) * 32; x < pad.halfWidth; x += 32) this.column(pad, x, along, -2);
          }
        }
        const ribbons = accessQuads(site.ground.access);
        for (const [index, { a, b }] of site.ground.access.entries()) {
          const length = Math.hypot(b.x - a.x, b.z - a.z), nx = (a.z - b.z) / length, nz = (b.x - a.x) / length;
          const aw = a.halfWidth ?? 3.5, bw = b.halfWidth ?? 3.5;
          const ay = a.slopeX * nx + a.slopeZ * nz, by = b.slopeX * nx + b.slopeZ * nz;
          const q = ribbons[index];
          quad(data, vertex(q.leftA, 0.015), vertex(q.rightA, 0.015), vertex(q.leftB, 0.015), vertex(q.rightB, 0.015));
          const insidePad = site.ground.pads.some(pad => Math.abs((a.x - pad.x) * Math.cos(pad.heading) + (a.z - pad.z) * Math.sin(pad.heading)) < pad.halfWidth
            && Math.abs((a.x - pad.x) * Math.sin(pad.heading) - (a.z - pad.z) * Math.cos(pad.heading)) < pad.halfLength);
          if (!insidePad) {
            this.edge(this.structures, a, b, Math.max(aw, bw) * 2 + 0.6, 1.4, -0.75, (a.slopeX + b.slopeX) / 2 * nx + (a.slopeZ + b.slopeZ) / 2 * nz);
            if (site.ground.elevated && !underpass.nearest(a.x, a.z, 7) && index % 8 === 4
              && !corridor?.crossesBelow({ ...site.sample, position: a, routeId: 'service-access', distance: index * 4 }, 12))
              this.column({ ...site.ground.pads[0], x: a.x, y: a.y, z: a.z, heading: 0, grade: 0 }, 0, 0, -1.45);
          }
          if (!insidePad) for (const side of [-1, 1]) {
            if (a.merge && side !== a.side && Math.floor(Math.hypot(a.x - site.sample.position.x, a.z - site.sample.position.z) / 4) % 3 !== 0) continue;
            const wa = Math.max(0.05, aw - (a.merge && side === a.side ? 0.7 : 0.08)), wb = Math.max(0.05, bw - (a.merge && side === a.side ? 0.7 : 0.08));
            this.edge(this.markings, { x: a.x + nx * side * wa, y: a.y + ay * side * wa, z: a.z + nz * side * wa },
              { x: b.x + nx * side * wb, y: b.y + by * side * wb, z: b.z + nz * side * wb }, 0.14, 0.018, 0.04);
          }
          if (site.accessWindows && index % 10 === 5) {
            for (const direction of a.direction ? [a.direction] : [-1, 1]) {
              const offset = a.direction ? 0 : direction * 3;
              const p = (along: number, lateral = 0) => ({ x: a.x + (b.x - a.x) / length * along * direction + nx * (offset + lateral),
                y: a.y + (b.y - a.y) / length * along * direction + ay * (offset + lateral),
                z: a.z + (b.z - a.z) / length * along * direction + nz * (offset + lateral) });
              this.edge(this.markings, p(-2), p(2), 0.18, 0.02, 0.045);
              for (const wing of [-1, 1]) this.edge(this.markings, p(0.7, wing * 0.7), p(2), 0.18, 0.02, 0.045);
            }
          }
        }
        if (site.mergeEnd) for (const side of this.options.oneWay ? [1] : [-1, 1]) for (const distance of [300, 475, 555]) {
          const direction = this.options.oneWay ? site.sample.routeId === 'back' ? -1 : 1 : side;
          const edge = site.ground.access.find(({ a }) => a.merge && a.side === side
            && Math.abs((a.x - site.sample.position.x) * Math.sin(site.sample.heading) - (a.z - site.sample.position.z) * Math.cos(site.sample.heading) - direction * distance) < 3);
          if (!edge) continue;
          const { a, b } = edge, length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length * direction, dz = (b.z - a.z) / length * direction;
          const nx = (a.z - b.z) / length * side, nz = (b.x - a.x) / length * side;
          const point = (along: number, lateral: number) => {
            const x = a.x + dx * along + nx * lateral, z = a.z + dz * along + nz * lateral;
            return { x, z, y: a.y + a.slopeX * (x - a.x) + a.slopeZ * (z - a.z) };
          };
          const end = point(3, distance > 400 ? -0.8 : 0);
          this.edge(this.markings, point(-3, 0), end, 0.2, 0.025, 0.045);
          for (const wing of [-1, 1]) this.edge(this.markings, point(1.3, (distance > 400 ? -0.8 : 0) + wing * 0.65), end, 0.18, 0.025, 0.045);
        }
        if (site.ground.crossover) this.crossover(site.ground.crossover, site.ground.pads[0], data, vertex);
        const rails = [...site.ground.barriers, ...site.ground.crossover?.barriers ?? []], joins = new Map<string, number>();
        const key = (p: ServicePoint) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)},${Math.round(p.z * 10)}`;
        for (const rail of rails) for (const p of [rail.a, rail.b]) joins.set(key(p), (joins.get(key(p)) ?? 0) + 1);
        for (const { a, b } of rails) {
          for (const [end, other] of [[a, b], [b, a]]) if (joins.get(key(end)) === 1) {
            const length = Math.hypot(other.x - end.x, other.z - end.z), t = Math.min(0.45, 1.2 / length);
            this.edge(this.markings, end, { x: end.x + (other.x - end.x) * t, y: end.y + (other.y - end.y) * t, z: end.z + (other.z - end.z) * t }, 0.18, 0.24, 0.95, 0, 0xe6bb5e);
          }
          for (const height of [0.45, 0.95, 1.4]) this.edge(this.railings, a, b, 0.14, 0.14, height);
          const reflectorLength = Math.hypot(b.x - a.x, b.z - a.z);
          if (reflectorLength > 0.1) {
            const t = Math.min(0.5, 0.25 / reflectorLength);
            this.edge(this.markings, a, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, 0.19, 0.1, 0.95, 0, 0xffd67c);
          }
          const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
          for (let i = 0; i <= count; i++) {
            const t = i / count;
            this.box(this.railings, { ...site.ground.pads[0], x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
              z: a.z + (b.z - a.z) * t, heading: 0, grade: 0 }, 0, 0, 0.75, 0.17, 1.5, 0.17, 0xffffff);
          }
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
    this.materialOrigin.set(originX % 4096, originZ % 4096);
    for (const mesh of [this.pavement, ...this.batches]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = sites.length > 0;
    }
    this.landscaping.visible = this.treeTrunks.visible = sites.length > 0 && vegetation;
  }

  private crossover(cross: ServiceCrossover, pad: ServicePad, data: number[], vertex: (p: ServicePoint, lift?: number) => Point): void {
    const points = [cross.access[0].a, ...cross.access.map(e => e.b)];
    const rims = points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], length = Math.hypot(b.x - a.x, b.z - a.z);
      return [-1, 1].map(side => ({ x: p.x + (a.z - b.z) / length * 3.5 * side, y: p.y, z: p.z + (b.x - a.x) / length * 3.5 * side }));
    });
    for (const [i, { a, b }] of cross.access.entries()) {
      quad(data, vertex(rims[i][0], 0.015), vertex(rims[i][1], 0.015), vertex(rims[i + 1][0], 0.015), vertex(rims[i + 1][1], 0.015));
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
      const shift = (p: ServicePoint, x: number) => ({ x: p.x + nx * x, y: p.y, z: p.z + nz * x });
      this.edge(this.structures, a, b, 8.2, 1.2, -0.65);
      for (const side of [-1, 1]) {
        this.edge(this.markings, shift(a, side * 3.2), shift(b, side * 3.2), 0.15, 0.02, 0.04);
        this.edge(this.markings, shift(a, side * 0.12), shift(b, side * 0.12), 0.1, 0.02, 0.04, 0, 0xf0ca71);
        if (i % 12 === 6) {
          const p = shift(a, side * 1.65), end = { x: p.x + dx * side * 0.75, y: p.y + (b.y - a.y) * side * 0.75, z: p.z + dz * side * 0.75 };
          this.edge(this.markings, p, end, 0.17, 0.02, 0.045);
          for (const wing of [-1, 1]) this.edge(this.markings,
            { x: end.x - dx * side * 0.3 + nx * wing * 0.55, y: end.y - (b.y - a.y) * side * 0.3, z: end.z - dz * side * 0.3 + nz * wing * 0.55 }, end, 0.17, 0.02, 0.045);
        }
        if (cross.kind === 'under') {
          const covered = Math.abs(a.y - cross.deck) < 0.01 && Math.abs(b.y - cross.deck) < 0.01;
          const top = covered ? cross.roof! : Math.min(cross.roof!, Math.max(this.terrain.sample(a.x, a.z), this.terrain.sample(b.x, b.z)) + 0.3);
          const height = Math.max(0, top - Math.min(a.y, b.y));
          if (height > 0.4) this.edge(this.structures, shift(a, side * 4.3), shift(b, side * 4.3), 0.65, height, height / 2);
        }
      }
      if (cross.roof !== undefined && Math.abs(a.y - cross.deck) < 0.01 && Math.abs(b.y - cross.deck) < 0.01) {
        this.edge(this.structures, { ...a, y: cross.roof }, { ...b, y: cross.roof }, 9.3, 1.4, 0.7);
        if (i % 6 === 0) {
          this.edge(this.lights, { ...a, y: cross.roof }, { ...b, y: cross.roof }, 0.22, 0.06, -0.05);
          this.lampPositions.push({ x: (a.x + b.x) / 2, y: cross.roof - 0.25, z: (a.z + b.z) / 2, covered: true });
        }
      }
    }
    for (const p of cross.supports) if (p.y - this.terrain.sample(p.x, p.z) > 5) this.column({ ...pad, ...p, heading: 0, grade: 0 }, 0, 0, -1.25);
  }

  private column(pad: ServicePad, x: number, along: number, top: number): void {
    const p = padPoint(pad, x, along, top), gap = p.y - this.terrain.sample(p.x, p.z), width = gap > 100 ? 5 : 3;
    let bottom = Math.min(this.terrain.sample(p.x, p.z), p.y - 1);
    for (const dx of [-width, width]) for (const dz of [-width, width]) bottom = Math.min(bottom, this.terrain.sample(p.x + dx, p.z + dz));
    bottom -= 4;
    const height = p.y - bottom;
    this.box(this.structures, pad, x, along, top - height + 1.5, width + 2, 3, width + 2, 0xffffff);
    this.box(this.structures, pad, x, along, top - height / 2 + 1, width, height - 2, width, 0xffffff);
  }

  private edge(mesh: InstancedMesh, a: ServicePoint, b: ServicePoint, width: number, height: number, lift: number, crossSlope = 0, color = 0xffffff): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Service structure capacity exceeded');
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, length = Math.hypot(dx, dz), overlap = 1 + 0.03 / length;
    this.matrix.set(-dz / length * width, 0, -dx * overlap, (a.x + b.x) / 2 - this.anchorX,
      crossSlope * width, height, -dy * overlap, (a.y + b.y) / 2 + lift,
      dx / length * width, 0, -dz * overlap, (a.z + b.z) / 2 - this.anchorZ, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count, this.matrix); mesh.setColorAt(mesh.count++, this.color.setHex(color));
  }

  private build(pad: ServicePad, architecture: ServiceArchitecture, site: ServiceArea): void {
    const box = (x: number, along: number, y: number, w: number, h: number, l: number, color: number, followGrade = false) =>
      this.box(this.buildings, pad, x * pad.side, along, y, w, h, l, color, followGrade);
    const facade = architecture === 'courtyard' ? 0xc7ac86 : architecture === 'lodge' ? 0x8c7357 : 0xc1cbd0;
    box(0, 0, -0.8, pad.halfWidth * 2, 1.3, pad.halfLength * 2, 0x7e827b, true);
    for (const x of [-pad.halfWidth, pad.halfWidth]) {
      if (x > 0 && site.garages?.some(g => g.id.endsWith(`:${pad.side}`))) {
        for (const a of [-1, 1]) box(x, a * (pad.halfLength + 32) / 2, 0.14, 0.35, 0.28, pad.halfLength - 32, 0xb8b6a5, true);
      } else box(x, 0, 0.14, 0.35, 0.28, pad.halfLength * 2, 0xb8b6a5, true);
    }
    for (const along of [-pad.halfLength, pad.halfLength]) box(5.5, along, 0.14, pad.halfWidth * 2 - 11, 0.28, 0.35, 0xb8b6a5, true);
    box(15, 28, 0.25, 23, 0.8, 32, 0x98978d, true);
    box(15, 28, 2.8, 22, 5, 30, facade);
    const roofColor = architecture === 'courtyard' ? 0x9b6244 : 0x35594f;
    if (architecture === 'lodge') {
      this.box(this.roofs, pad, 15 * pad.side, 28, 5.25, 25, 2.2, 33, roofColor);
      box(15, 28, 7.47, 0.28, 0.12, 33.2, roofColor);
      box(22, 38, 7, 1.5, 5, 1.7, 0x837e73); box(22, 38, 9.55, 2, 0.25, 2.2, 0x484e4b);
      for (let y = 0.65; y < 5.2; y += 0.48) box(3.82, 28, y, 0.18, 0.12, 29, 0xb39770);
      for (const along of [14, 42]) box(3.65, along, 2.7, 0.3, 5, 0.4, 0x4f5847);
    } else if (architecture === 'modern') {
      box(14.5, 28, 5.5, 27, 0.5, 35, 0xd4d9d0);
      box(18, 30, 6.45, 13, 1.4, 19, 0x768989);
      box(18, 30, 7.3, 16, 0.3, 22, 0xd2d9d6);
      for (const along of [21, 27, 33, 39]) {
        box(17.5, along, 7.55, 12, 0.16, 4.5, 0x284b65);
        for (const x of [12, 17.5, 23]) box(x, along, 7.65, 0.05, 0.035, 4.5, 0x92aeba);
      }
      for (const along of [17, 39]) this.box(this.windows, pad, 7 * pad.side, along, 5.75, 6, 1.7, 0.12, 0xffffff);
    } else {
      box(15, 28, 5.45, 24, 0.4, 32, 0xd5bc8e);
      for (const x of [3, 27]) box(x, 28, 6.1, 0.45, 1.2, 32, 0xc7a77b);
      for (const along of [12, 44]) box(15, along, 6.1, 24, 1.2, 0.45, 0xc7a77b);
      for (const along of [16, 24, 32, 40]) {
        box(1, along, 2.3, 0.6, 4.6, 0.6, 0xcab88e);
        this.box(this.roofs, pad, 1 * pad.side, along, 4.65, 6, 0.7, 7.8, 0xad7952);
      }
      box(22, 37, 6.5, 3.2, 2, 3.2, 0xe0d1ad);
      box(22, 37, 7.55, 3.7, 0.15, 3.7, 0x9e7f5b);
    }
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
    box(14, -38, 5.6, 26, 0.55, 23, 0x427b72, true);
    box(14, -38, 5.94, 26.6, 0.15, 23.6, 0xd5ded4, true);
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
    this.facility(pad, site);
    this.parking(pad, architecture);
    this.amenities(pad);
    serviceDetails(architecture, box,
      (x, a, y, w, h, l, color) => this.box(this.windows, pad, x * pad.side, a, y, w, h, l, color),
      (x, a, y, w, h, l, color) => this.box(this.lights, pad, x * pad.side, a, y, w, h, l, color));
    for (const along of [54, 64]) {
      this.detailAt(this.picnicDetails, pad, 15, along, 0);
      box(15, along, 0.9, 4, 0.16, 1.5, 0x886c4e);
      for (const z of [-1.3, 1.3]) box(15, along + z, 0.5, 4.5, 0.16, 0.45, 0x967950);
      for (const x of [13.5, 16.5]) box(x, along, 0.4, 0.16, 0.8, 1.2, 0x54615b);
    }
    for (const x of [10, 21]) for (const along of [51, 68]) box(x, along, 1.9, 0.23, 3.8, 0.23, 0x8e7450);
    for (const x of [10, 21]) box(x, 59.5, 3.85, 0.3, 0.25, 18, 0x8e7450, true);
    if (architecture === 'courtyard') this.box(this.roofs, pad, 15.5 * pad.side, 59.5, 3.9, 12, 0.8, 18, 0xd5b481, true);
    else for (let along = 51; along <= 68; along += architecture === 'modern' ? 3.4 : 1.7) box(15.5, along, 4, 12, 0.18, 0.3, architecture === 'modern' ? 0x667c80 : 0xb09770);
    for (const along of [-12, 4, 59]) {
      box(29, along, 0.25, 4, 0.5, 8, 0xafb2a1, true);
      box(29, along, 0.53, 3.7, 0.06, 7.7, 0x5d5943, true);
      this.box(this.treeTrunks, pad, 29 * pad.side, along, 2, 0.2, 3, 0.2, 0x756044);
      this.box(this.landscaping, pad, 29 * pad.side, along, 4.1, 2.6, 2.2, 2.6, 0x637e43);
      for (const dz of [-2.5, 2.5]) this.box(this.landscaping, pad, 29 * pad.side, along + dz, 1.1, 1.6, 0.75, 1.5, 0x83964e);
      for (const dz of [-3, -1, 1, 3]) this.box(this.landscaping, pad, 30 * pad.side, along + dz, 0.83, 0.4, 0.3, 0.4,
        architecture === 'courtyard' ? 0xd7a76b : architecture === 'modern' ? 0xa395c9 : 0xe7d4a0);
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

  private facility(pad: ServicePad, site: ServiceArea): void {
    const box = (x: number, a: number, y: number, w: number, h: number, l: number, color: number) => this.box(this.buildings, pad, x * pad.side, a, y, w, h, l, color);
    if (site.facility === 'mall') {
      for (const floor of [1, 2]) {
        const base = 7.7 + (floor - 1) * 4;
        box(53, 30, base + 1.8, 26, 3.6, 35, 0x8fa5ab);
        box(53, 30, base + 3.8, 28, 0.35, 37, 0xd1d8d2);
        for (const side of [-1, 1]) for (let a = 15; a <= 45; a += 5) {
          this.box(this.windows, pad, (53 + side * 13.05) * pad.side, a, base + 1.7, 0.08, 2.6, 4.4, 0xffffff);
          box(53 + side * 13.15, a - 2.4, base + 1.7, 0.12, 3.5, 0.14, 0x405c69);
        }
        for (const a of [12.45, 47.55]) for (const x of [44, 50, 56, 62]) {
          this.box(this.windows, pad, x * pad.side, a, base + 1.7, 5.5, 2.6, 0.08, 0xffffff);
          box(x - 2.9, a, base + 1.7, 0.12, 3.5, 0.14, 0x405c69);
        }
      }
      for (const x of [45, 60]) box(x, 31, 16.3, 4.5, 1, 6, 0x627780);
    }
    if (site.facility === 'track') {
      this.box(this.buildings, pad, 10 * pad.side, 144, 0.015, 70, 0.03, 60, 0x6f8a56, true);
      const point = (angle: number, lane: number) => padPoint(pad, (10 + Math.cos(angle) * (27 + lane)) * pad.side, 144 + Math.sin(angle) * (19 + lane), 0.05);
      for (let i = 0; i < 96; i++) {
        const a = i / 96 * Math.PI * 2, b = (i + 1) / 96 * Math.PI * 2;
        this.edge(this.markings, point(a, 2.2), point(b, 2.2), 4.6, 0.025, 0, 0, 0xb16e57);
        for (const lane of [0, 1.1, 2.2, 3.3, 4.4]) this.edge(this.markings, point(a, lane), point(b, lane), 0.08, 0.026, 0.02);
      }
      for (let i = 0; i < 7; i++) this.box(this.markings, pad, (39 + i % 2 * 0.5) * pad.side, 141 + i * 0.5, 0.09, 0.5, 0.025, 0.5, i % 2 ? 0xf0eee0 : 0x3a4346, true);
      for (const a of [132, 154]) {
        box(51, a, 0.5, 1.4, 0.15, 6, 0x94775c);
        for (const dz of [-2, 2]) box(51, a + dz, 0.25, 0.9, 0.5, 0.16, 0x53646a);
      }
    }
  }

  private amenities(pad: ServicePad): void {
    const box = (x: number, a: number, y: number, w: number, h: number, l: number, color: number, followGrade = false) => this.box(this.buildings, pad, x * pad.side, a, y, w, h, l, color, followGrade);
    for (const a of chargingPosts) for (const x of chargingPostColumns) {
      box(x, a, 2.25, 0.22, 4.5, 0.22, 0x738b8c);
      box(x, a, 0.14, 0.45, 0.28, 0.45, 0xaeb7ad);
    }
    box(-57, -64, 4.55, 11, 0.16, 30, 0x738b8c, true);
    for (const x of chargingPostColumns) {
      box(x, -64, 4.32, 0.18, 0.32, 29, 0x546b70, true);
      box(x, -64, 4.67, 0.12, 0.18, 30.3, 0x92a8aa, true);
      for (const a of chargingPosts) {
        box(x, a, 4.27, 0.52, 0.1, 0.6, 0x3b5156, true);
        box(x - 0.16, a, 2.31, 0.07, 4.62, 0.07, 0x697c80);
        box(x - 0.08, a, 4.62, 0.24, 0.07, 0.07, 0x697c80);
      }
    }
    for (let a = -77; a <= -51; a += 2) {
      box(-57, a, 4.67, 10.5, 0.06, 1.8, 0x23465e, true);
      for (const x of [-62, -59.5, -57, -54.5, -52]) box(x, a, 4.71, 0.035, 0.015, 1.8, 0x9cbdc8, true);
    }
    for (const a of chargingBays) {
      this.detailAt(this.chargerDetails, pad, -61.52, a, 1.5);
      box(-62, a, 1.1, 0.8, 2.2, 0.75, 0xe0e8df);
      box(-61.57, a, 1.5, 0.07, 0.55, 0.55, 0x1d4349);
      box(-61.52, a, 1.5, 0.035, 0.35, 0.36, 0x62cdb5);
      this.box(this.markings, pad, -54.1 * pad.side, a, 0.039, 0.17, 0.02, 2.8, 0x6fd2ba, true);
      this.box(this.lights, pad, -57 * pad.side, a, 4.43, 2, 0.06, 0.18, 0xffffff);
    }
    box(7, 84, 1.3, 2.8, 2.6, 1.2, 0x637f7b);
    box(7, 84, 2.67, 3.3, 0.14, 1.8, 0xb8c7ba);
    box(7, 83.37, 1.5, 2.2, 1.6, 0.05, 0x203f4a);
    for (const [x, a, w, l] of [[6.4, 83.33, 0.08, 0.06], [7, 83.33, 1.1, 0.06], [7.6, 83.33, 0.08, 0.06]])
      box(x, a, 1.4, w, x === 7 ? 0.08 : 0.8, l, 0xb4d6c5);
    for (const x of [5.7, 8.3]) box(x, 83.9, 0.16, 0.38, 0.32, 1.1, 0xa9b5a6);
    for (let x = -3; x <= 9; x += 2) this.box(this.markings, pad, x * pad.side, 89, 0.037, 0.7, 0.02, 3.4, 0xe1dcc4, true);
  }

  private detailAt(batch: NearbyDetails, pad: ServicePad, x: number, along: number, height: number): void {
    const p = padPoint(pad, x * pad.side, along, height);
    this.matrix.makeRotationY(-pad.heading + (pad.side < 0 ? Math.PI : 0)).setPosition(p.x - this.anchorX, p.y, p.z - this.anchorZ);
    batch.add(this.matrix);
  }

  private box(mesh: InstancedMesh, pad: ServicePad, x: number, along: number, y: number, w: number, h: number, l: number, color: number, followGrade = false): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Service area instance capacity exceeded');
    const p = padPoint(pad, x, along, y), cos = Math.cos(pad.heading), sin = Math.sin(pad.heading);
    this.matrix.set(cos * w, 0, -sin * l, p.x - this.anchorX, 0, h, followGrade ? -pad.grade * l : 0, p.y,
      sin * w, 0, cos * l, p.z - this.anchorZ, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count, this.matrix);
    mesh.setColorAt(mesh.count++, this.color.setHex(color));
  }

  private parking(pad: ServicePad, architecture: ServiceArchitecture): void {
    const box = (x: number, a: number, y: number, w: number, h: number, l: number, color = 0xbfc7c1) => this.box(this.buildings, pad, x * pad.side, a, y, w, h, l, color);
    const stripe = (x: number, a: number, w: number, l: number, color = 0xffffff) => this.box(this.markings, pad, x * pad.side, a, 0.032, w, 0.015, l, color, true);
    const facade = architecture === 'lodge' ? 0xa28e76 : architecture === 'courtyard' ? 0xd5c49e : 0xc9d1cb;
    const frame = architecture === 'lodge' ? 0x695c49 : architecture === 'courtyard' ? 0x94734f : 0x4c696c;
    const colors = [0x9acaca, 0xe4c982, 0xd6b092, 0xe6ac71, 0xa8cea0];
    for (const slot of parkingSlots()) {
      const across = Math.abs(slot.heading) > 0.1, w = across ? slot.length : slot.width, l = across ? slot.width : slot.length;
      for (const x of [-1, 1]) stripe(slot.x + x * w / 2, slot.along, 0.11, l, colors[slot.zone]);
      for (const a of [-1, 1]) stripe(slot.x, slot.along + a * l / 2, w, 0.11, colors[slot.zone]);
      if (slot.zone === 0) box(slot.x + (slot.x < -48 ? -2.3 : 2.3), slot.along, 0.08, 0.18, 0.16, 1.7, 0xb6aa77);
    }
    for (const x of [-48, -26, 30, 55, 76]) for (const a of [-70, -35, 0, 65, 98]) {
      if (x > 20 && a > 0 && a < 90) continue;
      stripe(x, a, 0.17, 4);
      const tip = padPoint(pad, x * pad.side, a + 2);
      for (const side of [-1, 1]) this.edge(this.markings, padPoint(pad, (x + side) * pad.side, a + 0.5), tip, 0.17, 0.015, 0.035);
    }
    for (let a = -102; a <= 102; a += 8) stripe(-74, a, 0.12, 3, 0xf0ca71);
    for (const side of [-1, 1]) for (const a of [-65, 0, 65]) {
      const x = -74 + side * 1.7, direction = side * pad.side;
      stripe(x, a, 0.18, 3.5);
      for (const wing of [-1, 1]) this.edge(this.markings, padPoint(pad, (x + wing * 0.65) * pad.side, a + direction * 0.4),
        padPoint(pad, x * pad.side, a + direction * 1.75), 0.18, 0.015, 0.04);
    }
    for (const a of [-85, 85]) for (let x = -77; x < -70; x += 1) stripe(x, a, 0.5, 3.2);
    for (const x of [-69, -66, -63, -60, -57, -54, -51, -48, -45, -42, -39, -36, -33, -30, -27, -24, -21, -18, -15, -12, -9, -6, -3, 0]) stripe(x, 94, 1.25, 6);
    for (let a = 4; a < 88; a += 4) stripe(-4, a, 0.18, 2);
    for (const x of [-70, -27, 32, 76]) for (const a of [-104, 102]) {
      box(x, a, 4, 0.17, 8, 0.17, 0x647477);
      this.box(this.lights, pad, x * pad.side, a, 8, 1.5, 0.15, 0.6, 0xffffff);
      this.lampPositions.push(padPoint(pad, x * pad.side, a, 7.8));
    }
    // Shop arcade and accessible toilet block face the pedestrian forecourt.
    box(52, 30, 0.12, 32, 0.24, 42, 0xaab0aa);
    box(53, 30, 3.5, 27, 7, 36, facade);
    box(52, 30, 7.15, 32, 0.3, 41, 0x617975);
    box(36, 30, 4.1, 7, 0.25, 41, 0x3f6e71);
    for (let a = 15; a <= 45; a += 6) {
      this.box(this.windows, pad, 39.42 * pad.side, a, 2.25, 0.08, 3.6, 5.5, 0xffffff);
      this.box(this.windows, pad, 39.42 * pad.side, a, 5.55, 0.08, 1.8, 5.5, 0xffffff);
      for (const edge of [-2.8, 2.8]) box(39.3, a + edge, 3.5, 0.22, 6.5, 0.12, frame);
      for (const y of [0.42, 3.35, 4.15, 4.62, 6.5]) box(39.28, a, y, 0.25, 0.1, 5.65, frame);
      box(39.24, a, 1.9, 0.22, 2.85, 0.06, frame);
      box(39.22, a, 0.62, 0.26, 0.28, 5.45, 0x88999a);
      for (const edge of [-0.18, 0.18]) box(39.08, a + edge, 1.45, 0.12, 0.65, 0.055, 0xd8d6bd);
      box(33, a, 2, 0.22, 4, 0.22, frame);
      box(33, a, 0.15, 0.36, 0.3, 0.36, 0x8b9791);
      if (architecture === 'lodge') for (const offset of [-2, -1, 1, 2]) box(39.18, a + offset, 5.55, 0.18, 1.85, 0.1, frame);
    }
    for (const a of [11.9, 48.1]) {
      box(53, a, 0.35, 26.8, 0.65, 0.15, 0x8e9992);
      for (const y of [2.3, 4.6]) box(53, a, y, 26.9, 0.06, 0.13, frame);
      for (const x of [43, 49, 55, 61]) box(x, a, 3.5, 0.06, 6.2, 0.16, frame);
      box(40, a, 3.4, 0.18, 6.8, 0.18, frame);
    }
    for (const a of [12.3, 47.7]) {
      box(39.08, a, 3.5, 0.17, 7, 0.17, 0x657976);
      box(38.88, a, 0.24, 0.5, 0.17, 0.17, 0x657976);
    }
    for (let a = 11; a < 50; a += 2) stripe(35.2, a, 6, 0.025, 0x717d7b);
    stripe(31.8, 30, 0.4, 42, 0x273b3e);
    for (let a = 9.4; a < 51; a += 0.55) stripe(31.8, a, 0.37, 0.065, 0x8e9d95);
    for (const [a, color] of [[9.8, 0x537b84], [50.2, 0xac7053]]) {
      box(38.8, a, 0.96, 0.85, 1.92, 1.5, color);
      box(38.34, a, 1.19, 0.08, 1.05, 1.1, 0x273d42);
      for (const y of [0.9, 1.15, 1.4]) for (const offset of [-0.35, 0, 0.35]) box(38.28, a + offset, y, 0.06, 0.13, 0.2, y > 1.2 ? 0xc5a66b : 0x9cbbad);
      box(38.25, a, 0.35, 0.1, 0.17, 0.75, 0x273d42);
      box(38.25, a + 0.58, 1.1, 0.1, 0.22, 0.1, 0xc8d5c4);
    }
    for (const x of [48, 58]) {
      box(x, 31, 7.6, 5, 0.7, 8, 0x708480);
      for (let a = 28; a <= 34; a += 1) box(x, a, 8, 4.6, 0.08, 0.12, 0x394b4f);
    }
    for (const a of [18, 30, 42]) {
      this.box(this.lights, pad, 36 * pad.side, a, 3.88, 1.5, 0.08, 0.45, 0xffffff);
      this.lampPositions.push(padPoint(pad, 36 * pad.side, a, 3.8));
    }
    box(57, 74, 2, 24, 4, 20, facade);
    box(44.85, 74, 0.22, 0.25, 0.42, 20.1, 0x8b9993);
    box(57, 74, 4.15, 27, 0.3, 23, 0x4d7577);
    box(42.8, 74, 2.7, 5, 0.2, 22, 0x8dafa9);
    for (const a of [68, 74, 80]) {
      const width = a === 80 ? 2.5 : 1.8;
      box(44.81, a, 1.42, 0.14, 2.84, width, frame);
      for (const edge of [-1, 1]) box(44.7, a + edge * (width / 2 + 0.06), 1.46, 0.22, 2.92, 0.12, 0xc1c7bb);
      box(44.7, a, 2.92, 0.22, 0.12, width + 0.24, 0xc1c7bb);
      box(44.69, a, 0.28, 0.08, 0.35, width - 0.12, 0xa9b6ad);
      this.box(this.windows, pad, 44.69 * pad.side, a, 2.18, 0.06, 0.42, width - 0.4, 0xffffff);
      box(44.62, a + width * 0.34, 1.15, 0.1, 0.34, 0.055, 0xe9dfb8);
      for (const y of [0.6, 1.5, 2.4]) box(44.62, a - width * 0.44, y, 0.1, 0.12, 0.045, 0xa9b6ad);
      for (let y = 3.3; y < 3.8; y += 0.1) box(44.8, a, y, 0.09, 0.045, width, frame);
      box(46, a, 4.55, 1.2, 0.7, 1.2, 0x76918d);
      this.box(this.lights, pad, 42 * pad.side, a, 2.52, 1.2, 0.08, 0.4, 0xffffff);
      this.lampPositions.push(padPoint(pad, 42 * pad.side, a, 2.45));
    }
    for (const a of [58, 89]) {
      for (const offset of [-0.24, 0, 0.24]) box(35, a + offset, 0.5, 4, 0.12, 0.2, 0x917651);
      for (const y of [0.71, 0.95, 1.19]) box(35, a + 0.4, y, 4, 0.18, 0.1, 0x917651);
      for (const x of [33.5, 36.5]) box(x, a, 0.25, 0.15, 0.5, 0.65, 0x4d5f5f);
      for (const x of [40, 41.2]) box(x, a, 0.55, 0.8, 1.1, 0.8, x === 40 ? 0x4b867d : 0x53738b);
    }
    for (let a = 60; a < 90; a += 5) stripe(40, a, 0.4, 0.4, 0xf3d687);
  }

  dispose(): void {
    this.chargerDetails.dispose(); this.picnicDetails.dispose();
    for (const mesh of [this.pavement, ...this.batches]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const mesh of this.batches) mesh.dispose();
  }
}
