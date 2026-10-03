import { BoxGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, type Scene } from 'three';
import { buildVehicleTemplate } from '../service/ParkedVehicles';
import { ModelLoadQueue } from '../render/ModelLoadQueue';
import { MAX_TRAFFIC, type TrafficSystem } from './TrafficSystem';
import type { VehicleKind } from '../vehicle/VehicleConfig';
import { vehicleProxy } from '../vehicle/VehicleProxy';
import { addRetroreflection } from '../render/ReflectiveMaterial';
import { compactSideLights, sideLampPositions, sideMarkerX } from '../vehicle/VehicleSafety';
import { FogLampBatch } from '../vehicle/FogLampBatch';

export class TrafficVehicles {
  private readonly batches = new Map<string, InstancedMesh[]>();
  private readonly lampLayouts = new Map<VehicleKind, number[][]>();
  detailDistance = 240;
  preloadDistance = 180;
  private readonly localLoads = new ModelLoadQueue();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.65, alphaHash: true });
  private readonly box = new BoxGeometry();
  private readonly lamps = new InstancedMesh(this.box, new MeshBasicMaterial({ toneMapped: false }), MAX_TRAFFIC * 80);
  private readonly drivers = new InstancedMesh(this.box, new MeshStandardMaterial({ roughness: 0.9 }), MAX_TRAFFIC * 2);
  private readonly matrix = new Matrix4();
  private readonly local = new Matrix4();
  private readonly color = new Color();
  private readonly fogLamps: FogLampBatch;
  constructor(private readonly scene: Scene, readonly traffic: TrafficSystem, private readonly sharedLoads?: ModelLoadQueue) {
    this.fogLamps = new FogLampBatch(scene, MAX_TRAFFIC, 'traffic-fog-lamps');
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float paintMask; attribute float glassMask; varying float vTrafficGlass;
        attribute vec4 wheelPivot; attribute float wheelSteer; attribute vec2 trafficMotion;
        mat3 trafficWheelRotation() {
          if (wheelPivot.w == 0.0 && wheelSteer == 0.0) return mat3(1.0);
          float turn = -atan(wheelSteer * trafficMotion.y / (1.0 - wheelPivot.x * trafficMotion.y));
          float spin = -trafficMotion.x * wheelPivot.w;
          float c = cos(turn), s = sin(turn), a = cos(spin), b = sin(spin);
          return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c) * mat3(1.0, 0.0, 0.0, 0.0, a, b, 0.0, -b, a);
        }
        ${shader.vertexShader}`.replace('#include <beginnormal_vertex>', `
          #include <beginnormal_vertex>
          mat3 wheelRotation = trafficWheelRotation(); objectNormal = wheelRotation * objectNormal;
        `).replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed = wheelRotation * (transformed - wheelPivot.xyz) + wheelPivot.xyz;
        `).replace('#include <color_vertex>', `
        #include <color_vertex>
        vTrafficGlass = glassMask;
        #if defined(USE_INSTANCING_COLOR) && defined(USE_COLOR)
          vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor, paintMask);
        #endif
      `);
      shader.fragmentShader = `varying float vTrafficGlass;\n${shader.fragmentShader}`.replace('#include <alphahash_fragment>',
        'diffuseColor.a *= mix(1.0, 0.28, vTrafficGlass);\n#include <alphahash_fragment>');
    };
    addRetroreflection(this.material, true);
    this.lamps.name = 'traffic-lamps'; this.drivers.name = 'traffic-drivers';
    this.lamps.count = this.drivers.count = 0;
    for (const mesh of [this.lamps, this.drivers]) mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    scene.add(this.lamps, this.drivers);
  }
  update(origin: { x: number; z: number }, darkness: number, anchor = origin, fog = false): void {
    this.fogLamps.update(this.traffic.entries.map(e => e.car), origin, fog);
    if (fog) darkness = Math.max(0.3, darkness);
    const detail = (car: { x: number; z: number }) => Math.hypot(car.x - anchor.x, car.z - anchor.z) <= this.detailDistance;
    const key = (car: { kind: VehicleKind; x: number; z: number }) => `${car.kind}:${detail(car) ? 'near' : 'far'}`;
    const loads = this.sharedLoads ?? this.localLoads;
    for (const { car } of this.traffic.entries) for (const fine of [false, true]) {
      const distance = Math.hypot(car.x - anchor.x, car.z - anchor.z), batchKey = `${car.kind}:${fine ? 'near' : 'far'}`;
      if (this.batches.has(batchKey) || fine && (this.detailDistance === 0 || distance > this.detailDistance + this.preloadDistance)) continue;
      const build = function* (this: TrafficVehicles): Generator<void> {
        const geometries = fine ? yield* buildVehicleTemplate(car.kind, false, true) : vehicleProxy(car.kind);
        this.batches.set(batchKey, geometries.map((geometry, i) => {
          const count = geometry.getAttribute('position').count;
          if (!geometry.hasAttribute('wheelPivot')) {
            geometry.setAttribute('wheelPivot', new Float32BufferAttribute(new Float32Array(count * 4), 4));
            geometry.setAttribute('wheelSteer', new Float32BufferAttribute(new Float32Array(count), 1));
          }
          geometry.setAttribute('trafficMotion', new InstancedBufferAttribute(new Float32Array(MAX_TRAFFIC * 2), 2).setUsage(DynamicDrawUsage));
          const mesh = new InstancedMesh(geometry, this.material, MAX_TRAFFIC); mesh.name = `traffic-${batchKey}-${i}`;
          mesh.instanceMatrix.setUsage(DynamicDrawUsage);
          mesh.count = 0; mesh.receiveShadow = true; this.scene.add(mesh); return mesh;
        }));
      }.bind(this);
      loads.request(`traffic:${batchKey}`, distance + (fine ? detail(car) ? 10000 : 20000 : 0), build);
    }
    if (!this.sharedLoads) loads.pump();
    for (const meshes of this.batches.values()) for (const mesh of meshes) mesh.count = 0;
    this.lamps.count = this.drivers.count = 0;
    for (const { car, signal } of this.traffic.entries) {
      const meshes = this.batches.get(key(car)) ?? this.batches.get(`${car.kind}:${detail(car) ? 'far' : 'near'}`); if (!meshes) continue;
      for (const [i, mesh] of meshes.entries()) {
        const body = i ? car.trailers[i - 1] : car;
        this.matrix.makeRotationY(-body.heading).setPosition(body.x - origin.x, body.y, body.z - origin.z);
        this.matrix.multiply(this.local.makeRotationX(body.pitch)).multiply(this.local.makeRotationZ(body.roll));
        mesh.geometry.getAttribute('trafficMotion').setXY(mesh.count, car.wheelAngle % (Math.PI * 2), Math.tan(car.steering) / car.wheelbase);
        mesh.setMatrixAt(mesh.count, this.matrix); mesh.setColorAt(mesh.count++, this.color.setHex(car.paint));
      }
      this.matrix.makeRotationY(-car.heading).setPosition(car.x - origin.x, car.y, car.z - origin.z);
      this.matrix.multiply(this.local.makeRotationX(car.pitch)).multiply(this.local.makeRotationZ(car.roll));
      const p = car.profile;
      let lampLayout = this.lampLayouts.get(car.kind);
      if (!lampLayout) {
        lampLayout = Array.from({ length: car.trailers.length + 1 }, (_, part) => sideLampPositions(p, part));
        this.lampLayouts.set(car.kind, lampLayout);
      }
      for (const [height, width, y, color] of detail(car) ? [[0.46, 0.38, p.eye.y - 0.34, 0x314d60], [0.23, 0.2, p.eye.y, 0xbe9273]] : []) {
        this.local.makeScale(width, height, 0.23).setPosition(p.eye.x, y, -p.eye.along);
        this.drivers.setMatrixAt(this.drivers.count, this.local.premultiply(this.matrix));
        this.drivers.setColorAt(this.drivers.count++, this.color.setHex(color));
      }
      for (const end of [-1, 1]) for (const side of [-1, 1]) {
        this.local.makeScale(0.23, 0.09, 0.04).setPosition(side * p.width * 0.32, 0.02, end * (p.chassisLength / 2 + 0.045));
        this.lamps.setMatrixAt(this.lamps.count, this.local.premultiply(this.matrix));
        this.lamps.setColorAt(this.lamps.count++, this.color.setHex(end < 0 ? darkness > 0.2 ? 0xffedbb : 0x637075 : car.braking ? 0xff351c : darkness > 0.2 ? 0x992211 : 0x43110c));
        if (signal === side && this.traffic.time % 0.8 < 0.4) {
          this.local.makeScale(0.18, 0.08, 0.025).setPosition(side * p.width * (p.shape === 'roadster' ? 0.36 : 0.42),
            compactSideLights(p) ? -0.1 : 0.19, end * (p.chassisLength / 2 + 0.065));
          this.lamps.setMatrixAt(this.lamps.count, this.local.premultiply(this.matrix));
          this.lamps.setColorAt(this.lamps.count++, this.color.setHex(0xff990b));
        }
      }
      for (let part = 0; part <= car.trailers.length; part++) {
        const body = part ? car.trailers[part - 1] : car;
        this.matrix.makeRotationY(-body.heading).setPosition(body.x - origin.x, body.y, body.z - origin.z);
        this.matrix.multiply(this.local.makeRotationX(body.pitch)).multiply(this.local.makeRotationZ(body.roll));
        const lamp = (x: number, y: number, z: number, w: number, h: number, l: number, color: number) => {
          this.local.makeScale(w, h, l).setPosition(x, y, z);
          this.lamps.setMatrixAt(this.lamps.count, this.local.premultiply(this.matrix));
          this.lamps.setColorAt(this.lamps.count++, this.color.setHex(color));
        };
        for (const side of [-1, 1]) {
          const flashing = signal === side && this.traffic.time % 0.8 < 0.4;
          if (p.shape !== 'motorcycle') for (const z of lampLayout[part]) {
            const compact = compactSideLights(p, part), x = side * (sideMarkerX(p, z) + 0.042);
            if (darkness > 0.2) lamp(x, compact ? -0.1 : 0.06, z - (compact ? 0.043 : 0), 0.012, compact ? 0.052 : 0.07, compact ? 0.09 : 0.18, 0xffab36);
            if (flashing) lamp(x, compact ? -0.1 : 0.145, z + (compact ? 0.045 : 0), 0.012, compact ? 0.052 : 0.07, compact ? 0.065 : 0.14, 0xff990b);
          }
          if (part) {
            const trailer = p.trailers![part - 1], rear = trailer.length - trailer.front + 0.09;
            lamp(side * p.width * 0.32, -0.12, rear, 0.28, 0.11, 0.035, car.braking ? 0xff351c : darkness > 0.2 ? 0xbb2211 : 0x43110c);
            if (flashing) lamp(side * p.width * 0.43, -0.12, rear, 0.16, 0.11, 0.04, 0xff990b);
          }
        }
      }
    }
    const upload = (mesh: InstancedMesh) => {
      mesh.visible = mesh.count > 0;
      if (!mesh.count) return;
      for (const attribute of [mesh.instanceMatrix, mesh.instanceColor!, ...mesh.geometry.hasAttribute('trafficMotion') ? [mesh.geometry.getAttribute('trafficMotion') as InstancedBufferAttribute] : []]) {
        attribute.setUsage(DynamicDrawUsage); attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true;
      }
      mesh.computeBoundingSphere();
    };
    for (const meshes of this.batches.values()) for (const mesh of meshes) upload(mesh);
    upload(this.lamps); upload(this.drivers);
  }
  dispose(): void {
    this.localLoads.dispose();
    this.fogLamps.dispose();
    for (const meshes of this.batches.values()) for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
    for (const mesh of [this.lamps, this.drivers]) { mesh.removeFromParent(); mesh.material.dispose(); mesh.dispose(); }
    this.box.dispose(); this.material.dispose();
  }
}
