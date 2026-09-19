import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, type Scene } from 'three';
import type { ServiceArea } from '../service/ServicePlanner';
import { padPoint, type ServicePoint } from '../service/ServiceTerrain';
import type { TunnelSpan } from '../tunnel/TunnelDetector';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadFrame } from './RoadFrame';
import { roadProfile } from './RoadProfile';
import type { RoadSample } from './RoadSegment';
import { createSignAtlas } from './SignAtlas';

const CAPACITY = 2048;

export class RoadSigns {
  private readonly atlas = createSignAtlas();
  readonly boards = new InstancedMesh(new PlaneGeometry(), new MeshStandardMaterial({ map: this.atlas, emissiveMap: this.atlas, emissive: 0xffffff, emissiveIntensity: 0.06, roughness: 0.72 }), CAPACITY);
  readonly posts = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x84918b, metalness: 0.45, roughness: 0.6 }), CAPACITY);
  private readonly tiles = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private readonly matrix = new Matrix4();
  private readonly profile;
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene, options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
    this.boards.geometry.setAttribute('signTile', this.tiles);
    this.boards.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float signTile;\n${shader.vertexShader}`.replace('#include <uv_vertex>', `
        #include <uv_vertex>
        vMapUv = (uv + vec2(mod(signTile, 4.0), floor(signTile / 4.0))) / vec2(4.0, 6.0);
        vEmissiveMapUv = vMapUv;
      `);
    };
    this.boards.count = this.posts.count = 0;
    this.boards.visible = this.posts.visible = false;
    scene.add(this.boards, this.posts);
  }

  update(samples: readonly RoadSample[], tunnels: readonly TunnelSpan[], services: readonly ServiceArea[], version: number, originX: number, originZ: number, passes: readonly RoadSample[] = []): void {
    if (version !== this.version) {
      this.version = version; this.anchorX = samples[0]?.position.x ?? 0; this.anchorZ = samples[0]?.position.z ?? 0;
      this.boards.count = this.posts.count = 0;
      for (let i = 1; i < samples.length; i++) {
        const sample = samples[i], previous = samples[i - 1];
        if (tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance) || services.some(site => sample.distance >= site.start && sample.distance <= site.end)) continue;
        for (const side of [-1, 1]) {
          const point = this.position(sample, side * (this.profile.outerHalfWidth + 2), 2.4), heading = sample.heading + (side < 0 ? Math.PI : 0);
          if (Math.floor(sample.distance / 1000) !== Math.floor(previous.distance / 1000)) {
            this.add(point, heading, 1.35, 0.6, 8, 2.6);
            const digits = String(Math.floor(sample.distance / 1000));
            [...digits].forEach((digit, j) => this.add({ x: point.x + Math.cos(heading) * (j - (digits.length - 1) / 2) * 0.42,
              y: point.y - 0.55, z: point.z + Math.sin(heading) * (j - (digits.length - 1) / 2) * 0.42 }, heading, 0.43, 0.52, 12 + Number(digit)));
          }
          if (Math.floor(sample.distance / 2000) !== Math.floor(previous.distance / 2000)) this.add({ ...point, y: point.y + 1.2 }, heading, 1.2, 1.1, this.profile.centers.length === 2 ? 7 : 6);
          if (Math.abs(sample.curvature) > 0.004 && Math.floor(sample.distance / 48) !== Math.floor(previous.distance / 48)) this.add(point, heading, 1.6, 0.85, sample.curvature * side > 0 ? 10 : 9, 2.6);
        }
      }
      for (const span of tunnels) for (const [sample, flip] of [[span.start, false], [span.end, true]] as const) for (const center of this.profile.centers) {
        const p = this.position(sample, center, 8.7), sign = flip ? 1 : -1;
        p.x += sample.tangent.x * sign * 2.7; p.z += sample.tangent.z * sign * 2.7;
        this.add(p, sample.heading + (flip ? Math.PI : 0), 6, 0.55, 5);
      }
      for (const span of tunnels) for (let i = 1; i < span.samples.length; i++) {
        const sample = span.samples[i];
        if (Math.floor(sample.distance / 96) === Math.floor(span.samples[i - 1].distance / 96)) continue;
        for (const center of this.profile.centers) this.add(this.position(sample, center - this.profile.halfWidth - 0.41, 2.2), sample.heading - Math.PI / 2, 1.2, 0.4, 11);
      }
      for (const site of services) {
        for (const pad of site.ground.pads) {
          const side = pad.side, heading = pad.heading + (side < 0 ? Math.PI : 0);
          this.add(padPoint(pad, -side * 32, -side * 64, 4), heading, 4, 2, 1, 4.2);
          this.add(padPoint(pad, -side * 10, -12, 2.2), heading, 1.2, 1.2, 2, 2.4);
          this.add(padPoint(pad, side * 14, -49.6, 5.62), pad.heading, 3.5, 0.5, 3);
          this.add(padPoint(pad, side * 2.9, 28, 3.8), pad.heading + side * Math.PI / 2, 2, 0.6, 4);
          this.add(padPoint(pad, side * 3.8, 28, 4.65), pad.heading + side * Math.PI / 2, 5, 0.65, 23);
          const target = site.sample.distance - side * 720;
          const sample = samples.reduce((best, point) => Math.abs(point.distance - target) < Math.abs(best.distance - target) ? point : best);
          if (Math.abs(sample.distance - target) < 5) this.add(this.position(sample, side * (this.profile.outerHalfWidth + 3), 4.5), sample.heading + (side < 0 ? Math.PI : 0), 4, 2.2, 0, 4.7);
        }
      }
      for (const sample of passes) for (const side of [-1, 1]) {
        const point = this.position(sample, side * (this.profile.outerHalfWidth + 2.5), 3.5), heading = sample.heading + (side < 0 ? Math.PI : 0);
        this.add(point, heading, 2.5, 1.1, 22, 3.7);
        const digits = String(Math.round(sample.position.y));
        [...digits].forEach((digit, i) => this.add({ x: point.x + Math.cos(heading) * (i - (digits.length - 1) / 2) * 0.42,
          y: point.y - 0.85, z: point.z + Math.sin(heading) * (i - (digits.length - 1) / 2) * 0.42 }, heading, 0.43, 0.52, 12 + Number(digit)));
      }
      this.tiles.needsUpdate = true;
      for (const mesh of [this.boards, this.posts]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.boards, this.posts]) { mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ); mesh.visible = mesh.count > 0; }
  }

  private position(sample: RoadSample, offset: number, height: number): ServicePoint {
    const { right } = roadFrame(sample), p = sample.position;
    return { x: p.x + right.x * offset, y: p.y + right.y * offset + height, z: p.z + right.z * offset };
  }

  private add(point: ServicePoint, heading: number, width: number, height: number, tile: number, post = 0): void {
    if (this.boards.count >= CAPACITY) throw new Error('Road sign capacity exceeded');
    const cos = Math.cos(heading), sin = Math.sin(heading);
    this.matrix.set(cos * width, 0, -sin, point.x - this.anchorX, 0, height, 0, point.y,
      sin * width, 0, cos, point.z - this.anchorZ, 0, 0, 0, 1);
    this.boards.setMatrixAt(this.boards.count, this.matrix); this.tiles.setX(this.boards.count++, tile);
    if (post) {
      this.matrix.makeScale(0.14, post, 0.14).setPosition(point.x - this.anchorX, point.y - post / 2, point.z - this.anchorZ);
      this.posts.setMatrixAt(this.posts.count++, this.matrix);
    }
  }

  dispose(): void {
    for (const mesh of [this.boards, this.posts]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
    this.atlas.dispose();
  }
}
