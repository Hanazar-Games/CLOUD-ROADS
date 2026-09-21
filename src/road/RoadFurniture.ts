import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, PointLight, type PerspectiveCamera, type Scene } from 'three';
import type { BridgeSpan } from '../bridge/BridgeDetector';
import type { TunnelSpan } from '../tunnel/TunnelDetector';
import type { TunnelLamp } from '../tunnel/TunnelMesh';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { hashSeed } from '../world/WorldSeed';
import { roadFrame } from './RoadFrame';
import { roadProfile } from './RoadProfile';
import type { RoadSample } from './RoadSegment';
import { MAX_ROAD_SEGMENTS } from './RoadSpine';
import { ROAD_SAMPLES } from './RoadSegment';
import type { ServiceArea } from '../service/ServicePlanner';
import { guardrailGeometry } from './RoadHardwareGeometry';
import { hasRoadBarrier } from './RoadProtection';
import { LampGlow } from './LampGlow';

export class RoadFurniture {
  readonly rails = new InstancedMesh(guardrailGeometry(), new MeshStandardMaterial({ color: 0xa5b2b8, metalness: 0.55, roughness: 0.46 }), MAX_ROAD_SEGMENTS * ROAD_SAMPLES * 4);
  readonly posts = new InstancedMesh(new BoxGeometry(), this.rails.material, MAX_ROAD_SEGMENTS * ROAD_SAMPLES);
  readonly poles = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x52636b, metalness: 0.6, roughness: 0.4 }), 4096);
  readonly markers = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.15 }), 16384);
  private readonly markerColor = new Color();
  readonly heads = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xffe4b8, emissive: 0xffc781 }), 2048);
  readonly localLights = Array.from({ length: 4 }, () => new PointLight(0xffd4a0, 0, 45, 2));
  readonly lampPositions: (TunnelLamp & { sample: RoadSample })[] = [];
  enabled = true;
  readonly glow = new LampGlow();
  private readonly profile;
  private readonly matrix = new Matrix4();
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;

  constructor(scene: Scene, private readonly seed: string, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
    for (const mesh of [this.rails, this.posts, this.poles, this.heads, this.markers]) {
      mesh.count = 0; mesh.visible = false; mesh.receiveShadow = true;
      scene.add(mesh);
    }
    scene.add(...this.localLights);
    scene.add(this.glow.halos, this.glow.pools);
  }

  update(samples: readonly RoadSample[], tunnels: readonly TunnelSpan[], bridges: readonly BridgeSpan[], version: number,
    originX: number, originZ: number, nearRoute: boolean, services: readonly ServiceArea[] = []): void {
    if (version !== this.version) {
      this.version = version;
      this.anchorX = samples[0]?.position.x ?? 0;
      this.anchorZ = samples[0]?.position.z ?? 0;
      this.rails.count = this.posts.count = this.poles.count = this.heads.count = this.markers.count = 0;
      this.lampPositions.length = 0;
      this.glow.pools.count = 0;
      for (let i = 1; i < samples.length; i++) {
        const sample = samples[i], previous = samples[i - 1], distance = sample.distance;
        if (sample.routeId !== previous.routeId) continue;
        if (tunnels.some(span => span.start.routeId === sample.routeId && distance >= span.start.distance - 8 && distance <= span.end.distance + 8)) continue;
        const sides = [-this.profile.outerHalfWidth - 0.3, this.profile.outerHalfWidth + 0.3];
        const routeServices = services.filter(site => site.sample.routeId === sample.routeId);
        const serviceAccess = routeServices.some(site => distance >= site.start && distance <= site.end);
        const onBridge = bridges.some(span => span.start.routeId === sample.routeId && distance >= span.start.distance && distance <= span.end.distance);
        if (!onBridge) {
          const mid = { ...sample, position: { x: (sample.position.x + previous.position.x) / 2,
            y: (sample.position.y + previous.position.y) / 2, z: (sample.position.z + previous.position.z) / 2 } };
          for (const offset of sides) {
            if (!hasRoadBarrier({ seed: this.seed, options: this.options, bridges, tunnels, services: routeServices }, sample, Math.sign(offset))) continue;
            this.box(this.rails, mid, offset, 0.85, 0.16, 0.28, distance - previous.distance + 0.08);
            if (Math.floor(distance / 8) !== Math.floor(previous.distance / 8)) this.box(this.posts, sample, offset, 0.48, 0.16, 0.95, 0.16);
          }
        }
        if (!onBridge && !serviceAccess && Math.floor(distance / 32) !== Math.floor(previous.distance / 32)) {
          for (const side of [-1, 1]) for (const [height, tall, width, depth, color] of [
            [0.5, 1, 0.18, 0.18, 0xe3e5dc], [0.82, 0.3, 0.2, 0.22, 0x29383b], [0.83, 0.13, 0.12, 0.24, side > 0 ? 0xe7b14d : 0xe6e7df],
          ]) {
            this.box(this.markers, sample, side * (this.profile.outerHalfWidth + 1.1), height, width, tall, depth);
            this.markers.setColorAt(this.markers.count - 1, this.markerColor.setHex(color));
          }
        }
        if (serviceAccess || sample.opening !== undefined || Math.floor(distance / 40) === Math.floor(previous.distance / 40) || hashSeed(`${this.seed}:${sample.routeId ?? ''}:lighting:${Math.floor(distance / 720)}`) % 4 !== 0) continue;
        for (const side of this.profile.centers.length === 2 ? [-1, 1] : [1]) {
          const offset = side * (this.profile.outerHalfWidth + (onBridge ? 0.15 : 0.9));
          this.box(this.poles, sample, offset, 4.5, 0.17, 9, 0.17);
          this.box(this.poles, sample, offset - side * 1.3, 8.95, 2.7, 0.15, 0.15);
          this.box(this.heads, sample, offset - side * 2.4, 8.85, 0.85, 0.13, 1.4);
          const { right, normal } = roadFrame(sample), p = sample.position, lateral = offset - side * 2.4;
          this.lampPositions.push({ x: p.x + right.x * lateral + normal.x * 8.65,
            y: p.y + right.y * lateral + normal.y * 8.65, z: p.z + right.z * lateral + normal.z * 8.65, sample });
          this.box(this.glow.pools, sample, side * (this.profile.outerHalfWidth - this.profile.halfWidth), 0.035, this.profile.halfWidth * 2, 1, 32);
        }
      }
      const positions = this.glow.halos.geometry.getAttribute('position');
      for (const [i, lamp] of this.lampPositions.entries()) positions.setXYZ(i, lamp.x - this.anchorX, lamp.y, lamp.z - this.anchorZ);
      positions.needsUpdate = true; this.glow.halos.geometry.setDrawRange(0, this.lampPositions.length);
      this.glow.halos.geometry.computeBoundingSphere();
      for (const mesh of [this.rails, this.posts, this.poles, this.heads, this.markers, this.glow.pools]) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    for (const mesh of [this.glow.halos, this.glow.pools]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ); mesh.visible = nearRoute && this.enabled;
    }
    for (const mesh of [this.rails, this.posts, this.poles, this.heads, this.markers]) {
      mesh.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
      mesh.visible = nearRoute && mesh.count > 0 && (mesh === this.rails || mesh === this.posts || mesh === this.markers || this.enabled);
    }
  }

  illuminate(camera: PerspectiveCamera, night: number, tunnelLamps: readonly TunnelLamp[], originX: number, originZ: number, serviceLamps: readonly TunnelLamp[] = []): void {
    this.heads.material.emissiveIntensity = night * 3;
    this.glow.halos.material.opacity = this.enabled ? night * 0.85 : 0;
    this.glow.pools.material.opacity = this.enabled ? night * 0.24 : 0;
    const x = camera.position.x + originX, z = camera.position.z + originZ;
    const nearest: { point: TunnelLamp; distance: number; intensity: number }[] = [];
    const collect = (points: readonly TunnelLamp[], intensity: number) => {
      if (!intensity) return;
      for (const point of points) {
        const distance = (point.x - x) ** 2 + (point.y - camera.position.y) ** 2 + (point.z - z) ** 2;
        if (distance > 100 ** 2 || (nearest.length === this.localLights.length && distance >= nearest.at(-1)!.distance)) continue;
        nearest.push({ point, distance, intensity });
        nearest.sort((a, b) => a.distance - b.distance);
        if (nearest.length > this.localLights.length) nearest.pop();
      }
    };
    collect(this.lampPositions, this.enabled ? night * 180 : 0);
    collect(tunnelLamps, 85);
    collect(serviceLamps, night * 160);
    this.localLights.forEach((light, i) => {
      const candidate = nearest[i];
      light.intensity = candidate?.intensity ?? 0;
      if (candidate) light.position.set(candidate.point.x - originX, candidate.point.y, candidate.point.z - originZ);
    });
  }

  private box(mesh: InstancedMesh, sample: RoadSample, offset: number, height: number, width: number, tall: number, length: number): void {
    if (mesh.count >= mesh.instanceMatrix.count) throw new Error('Road furniture capacity exceeded');
    const { right: r, normal: n } = roadFrame(sample), p = sample.position, t = sample.tangent;
    this.matrix.set(r.x * width, n.x * tall, -t.x * length, p.x - this.anchorX + r.x * offset + n.x * height,
      r.y * width, n.y * tall, -t.y * length, p.y + r.y * offset + n.y * height,
      r.z * width, n.z * tall, -t.z * length, p.z - this.anchorZ + r.z * offset + n.z * height, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count++, this.matrix);
  }

  dispose(): void {
    this.glow.dispose();
    for (const mesh of [this.rails, this.posts, this.poles, this.heads, this.markers]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    for (const mesh of [this.rails, this.poles, this.heads, this.markers]) mesh.material.dispose();
    for (const light of this.localLights) { light.removeFromParent(); light.dispose(); }
  }
}
