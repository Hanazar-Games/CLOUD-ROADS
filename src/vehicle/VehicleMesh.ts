import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SpotLight, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry, type Scene } from 'three';
import type { VehiclePhysics, WheelState } from './VehiclePhysics';
import { suspensionTuning, vehicleOffset, vehicleProfiles, type VehicleProfile, type WheelPoint } from './VehicleConfig';

type Block = (w: number, h: number, l: number, x: number, y: number, z: number, material?: MeshStandardMaterial, parent?: Group) => Mesh;
interface WheelMesh { pivot: Group; spin: Group; spring: Mesh; point: WheelPoint }

export class VehicleMesh {
  readonly root = new Group();
  readonly chassis = new Group();
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly wheels: WheelMesh[] = [];
  private readonly trailerWheels: WheelMesh[] = [];
  private readonly trailerRoot = new Group();
  private readonly trailerBody = new Group();
  private readonly steering = new Group();
  private readonly tail;
  private readonly headlight = new SpotLight(0xffeed0, 0, 100, 0.6, 0.65, 1.6);

  constructor(scene: Scene, private readonly profile: VehicleProfile = vehicleProfiles.roadster) {
    const paint = this.material(profile.paint, 0.4, 0.25), trim = this.material(0x202b2c), rubber = this.material(0x171c1d);
    const metal = this.material(0xaeb9b5, 0.35, 0.7), leather = this.material(0x675447);
    const glass = this.material(profile.shape === 'roadster' ? 0xc3e2e4 : 0x627e88, 0.15, 0.15);
    glass.transparent = true; glass.opacity = profile.shape === 'roadster' ? 0.16 : 0.58; glass.depthWrite = false;
    this.tail = this.material(0xca3932); this.tail.emissive.setHex(0xff3020);
    const lamp = this.material(0xffefcf); lamp.emissive.setHex(0xffeed0); lamp.emissiveIntensity = 0.7;
    this.root.add(this.chassis); this.root.visible = false; scene.add(this.root);
    const box = this.geometry(new BoxGeometry());
    const block = (w: number, h: number, l: number, x: number, y: number, z: number, material = paint, parent = this.chassis) => {
      const mesh = new Mesh(box, material); mesh.scale.set(w, h, l); mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    if (profile.shape === 'roadster') {
    const shape = new Shape();
    shape.moveTo(-0.74, -2.05); shape.lineTo(0.74, -2.05); shape.lineTo(0.92, -1.65);
    shape.lineTo(0.92, 1.6); shape.lineTo(0.7, 2.05); shape.lineTo(-0.7, 2.05);
    shape.lineTo(-0.92, 1.6); shape.lineTo(-0.92, -1.65); shape.closePath();
    const shell = new Mesh(this.geometry(new ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 1, steps: 1 })), paint);
    shell.rotation.x = -Math.PI / 2; shell.position.y = -0.34; shell.castShadow = shell.receiveShadow = true; this.chassis.add(shell);
    block(1.69, 0.12, 1.25, 0, 0.1, -1.35);
    block(1.68, 0.16, 0.63, 0, 0.12, 1.6);
    block(1.75, 0.1, 0.1, 0, -0.17, -2.1, trim);
    block(1.55, 0.1, 0.1, 0, -0.2, 2.1, trim);
    for (const side of [-1, 1]) {
      block(0.15, 0.3, 1.92, side * 0.84, 0.09, 0.22);
      block(0.05, 0.04, 0.2, side * 0.94, 0.17, 0.5, metal);
      block(0.5, 0.09, 0.055, side * 0.53, 0.02, -2.09, lamp);
      block(0.56, 0.09, 0.055, side * 0.52, 0.04, 2.09, this.tail);
      block(0.03, 0.22, 0.035, side * 0.86, 0.34, -0.66, trim);
      block(0.2, 0.035, 0.045, side * 0.93, 0.44, -0.66, trim);
      block(0.22, 0.12, 0.13, side * 1.03, 0.44, -0.64, paint);
      block(0.19, 0.09, 0.012, side * 1.03, 0.44, -0.569, metal);
      block(0.56, 0.16, 0.65, side * 0.43, 0.03, 0.4, leather);
      const seat = block(0.57, 0.58, 0.17, side * 0.43, 0.33, 0.83, leather); seat.rotation.x = -0.14;
      block(0.29, 0.2, 0.14, side * 0.43, 0.69, 0.88, leather);
      const pillar = block(0.035, 0.87, 0.035, side * 0.8, 0.65, -0.74, metal); pillar.rotation.x = 0.27;
    }
    const windshield = block(1.55, 0.81, 0.014, 0, 0.65, -0.74, glass); windshield.rotation.x = 0.27;
    block(1.65, 0.035, 0.045, 0, 1.07, -0.63, metal);
    block(1.58, 0.15, 0.3, 0, 0.25, -0.64, trim);
    block(0.2, 0.17, 0.8, 0, 0.09, 0.2, trim);
    this.steering.position.set(-0.43, 0.42, -0.4); this.steering.rotation.x = -0.25; this.chassis.add(this.steering);
    const ring = new Mesh(this.geometry(new TorusGeometry(0.155, 0.018, 6, 24)), trim); this.steering.add(ring);
    block(0.27, 0.027, 0.025, 0, 0, 0, metal, this.steering);
    block(0.035, 0.14, 0.03, 0, -0.065, 0, metal, this.steering);
    } else this.buildBody(block, paint, trim, metal, glass, leather, lamp);
    const tireWidth = profile.shape === 'motorcycle' ? 0.15 : profile.width > 2.3 ? 0.3 : 0.24;
    const tireGeometry = this.geometry(new CylinderGeometry(profile.radius, profile.radius, tireWidth, 20));
    const rimGeometry = this.geometry(new CylinderGeometry(profile.radius * 0.62, profile.radius * 0.62, tireWidth + 0.012, 16));
    const coil = this.geometry(new TubeGeometry(new CatmullRomCurve3(Array.from({ length: 65 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 4) * 0.065, i / 64, Math.sin(i * Math.PI / 4) * 0.065))), 64, 0.012, 4, false));
    const addWheels = (points: readonly WheelPoint[], parent: Group, output: WheelMesh[]) => { for (const point of points) {
      const pivot = new Group(), spin = new Group(); pivot.add(spin); parent.add(pivot);
      pivot.position.set(point.x, 0, -point.along);
      const tire = new Mesh(tireGeometry, rubber), rim = new Mesh(rimGeometry, metal);
      tire.rotation.z = rim.rotation.z = Math.PI / 2; tire.castShadow = true; spin.add(tire, rim);
      for (let i = 0; i < 5; i++) {
        const spoke = block(tireWidth + 0.025, 0.025, profile.radius * 1.15, 0, 0, 0, trim, spin); spoke.rotation.x = i * Math.PI / 5;
      }
      const spring = new Mesh(coil, metal); parent.add(spring);
      output.push({ pivot, spin, spring, point });
    } };
    addWheels(profile.wheels, this.root, this.wheels);
    if (profile.trailer) {
      this.root.add(this.trailerRoot); this.trailerRoot.add(this.trailerBody);
      const trailer = profile.trailer, center = trailer.length / 2 - trailer.front;
      const cargo = this.material(0xd4dbd9, 0.67, 0.18), top = profile.height - this.rideHeight;
      block(profile.width - 0.06, 0.24, trailer.length, 0, 0, center, trim, this.trailerBody);
      block(profile.width, top - 0.24, trailer.length, 0, (top + 0.24) / 2, center, cargo, this.trailerBody);
      for (const side of [-1, 1]) {
        block(0.04, 0.13, trailer.length - 0.2, side * profile.width / 2, 0.35, center, paint, this.trailerBody);
        for (let z = -trailer.front + 0.4; z < trailer.length - trailer.front; z += 0.65)
          block(0.025, top - 0.48, 0.035, side * (profile.width / 2 + 0.005), (top + 0.34) / 2, z, metal, this.trailerBody);
        block(0.12, 0.6, 0.12, side * 0.82, -0.25, 1.7, metal, this.trailerBody);
        block(0.22, 0.08, 0.3, side * 0.82, -0.55, 1.7, trim, this.trailerBody);
        block(0.34, 0.14, 0.06, side * 0.84, -0.12, trailer.length - trailer.front + 0.02, this.tail, this.trailerBody);
        for (let z = 0; z < trailer.length - trailer.front; z += 2)
          block(0.035, 0.07, 0.16, side * (profile.width / 2 + 0.025), 0.18, z, lamp, this.trailerBody);
      }
      const back = trailer.length - trailer.front + 0.025;
      block(0.045, top - 0.28, 0.04, 0, (top + 0.24) / 2, back, trim, this.trailerBody);
      for (const side of [-1, 1]) block(0.045, top - 0.5, 0.055, side * 0.55, (top + 0.24) / 2, back, metal, this.trailerBody);
      block(profile.width - 0.1, 0.1, 0.1, 0, -0.48, back, metal, this.trailerBody);
      addWheels(trailer.wheels, this.trailerRoot, this.trailerWheels);
    }
    this.headlight.position.set(0, profile.shape === 'motorcycle' ? 0.3 : 0.05, -profile.chassisLength / 2 + 0.08);
    this.headlight.target.position.set(0, -0.5, -40);
    this.chassis.add(this.headlight, this.headlight.target);
  }

  sync(car: VehiclePhysics, origin: { x: number; z: number }, night: number): void {
    this.root.position.set(car.x - origin.x, car.y, car.z - origin.z);
    this.root.rotation.y = -car.heading;
    this.chassis.rotation.set(car.pitch, 0, car.roll, 'YXZ');
    this.syncWheels(this.wheels, car.wheels, car.y, car.pitch, car.roll, car);
    if (car.trailer) {
      const t = car.trailer, dx = t.x - car.x, dz = t.z - car.z, cos = Math.cos(car.heading), sin = Math.sin(car.heading);
      this.trailerRoot.position.set(cos * dx + sin * dz, t.y - car.y, -sin * dx + cos * dz);
      this.trailerRoot.rotation.y = car.heading - t.heading;
      this.trailerBody.rotation.set(t.pitch, 0, t.roll, 'YXZ');
      this.syncWheels(this.trailerWheels, t.wheels, t.y, t.pitch, t.roll, car);
    }
    this.steering.rotation.z = -car.steering * 2;
    this.tail.emissiveIntensity = car.braking || car.parked ? 2 : 0.15 + night * 0.6;
    this.headlight.intensity = night * 160;
  }

  private get rideHeight(): number { return this.profile.radius + this.profile.rest - 9.81 / suspensionTuning(3, this.profile).spring; }

  private buildBody(block: Block, paint: MeshStandardMaterial, trim: MeshStandardMaterial, metal: MeshStandardMaterial,
    glass: MeshStandardMaterial, leather: MeshStandardMaterial, lamp: MeshStandardMaterial): void {
    const p = this.profile, w = p.width, length = p.chassisLength, nose = -length / 2, top = p.height - this.rideHeight;
    if (p.shape === 'motorcycle') {
      block(0.27, 0.3, 0.55, 0, -0.12, 0, metal);
      const tank = block(0.43, 0.32, 0.62, 0, 0.25, -0.16); tank.rotation.x = -0.12;
      block(0.35, 0.13, 0.65, 0, 0.33, 0.39, leather);
      block(0.35, 0.12, 0.34, 0, 0.21, 0.9);
      block(0.3, 0.12, 0.35, 0, -0.22, -0.85);
      for (const side of [-1, 1]) {
        const fork = block(0.045, 0.8, 0.055, side * 0.14, -0.05, -0.65, metal); fork.rotation.x = -0.25;
        const frame = block(0.04, 0.07, 1, side * 0.17, -0.1, 0.1, trim); frame.rotation.x = -0.35;
        block(0.14, 0.05, 0.2, side * 0.29, -0.23, 0.2, metal);
        block(0.13, 0.12, 0.66, side * 0.2, -0.25, 0.55, trim);
        block(0.17, 0.05, 0.065, side * 0.31, 0.61, -0.48, trim);
        block(0.02, 0.21, 0.02, side * 0.3, 0.73, -0.5, metal);
        block(0.14, 0.09, 0.03, side * 0.32, 0.84, -0.5, metal);
      }
      block(0.65, 0.035, 0.045, 0, 0.62, -0.48, metal);
      block(0.18, 0.08, 0.16, 0, 0.63, -0.59, trim);
      block(0.19, 0.18, 0.08, 0, 0.35, -0.82, lamp);
      block(0.2, 0.065, 0.025, 0, 0.26, 1.06, this.tail);
      return;
    }
    block(w - 0.18, 0.24, length - 0.12, 0, -0.2, 0, trim);
    const passenger = p.shape === 'sedan' || p.shape === 'suv';
    const bus = p.shape === 'bus';
    const cabFront = passenger ? -0.8 : nose + 0.08;
    const cabBack = passenger ? p.shape === 'suv' ? length / 2 - 0.08 : 1.3 : bus ? length / 2 - 0.12 : nose + (length > 6 ? 2.5 : 2);
    const cabLength = cabBack - cabFront, cabCenter = (cabFront + cabBack) / 2;
    const sill = passenger ? 0.18 : bus ? 0.8 : 0.58;
    const roof = passenger ? top : bus ? top : Math.min(top, p.eye.y + 0.4);
    if (passenger) {
      const shape = new Shape(), half = w / 2, end = length / 2, cut = 0.2;
      shape.moveTo(-half + cut, -end); shape.lineTo(half - cut, -end); shape.lineTo(half, -end + cut);
      shape.lineTo(half, end - cut); shape.lineTo(half - cut, end); shape.lineTo(-half + cut, end);
      shape.lineTo(-half, end - cut); shape.lineTo(-half, -end + cut); shape.closePath();
      const shell = new Mesh(this.geometry(new ExtrudeGeometry(shape, { depth: sill + 0.42, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 1, steps: 1 })), paint);
      shell.rotation.x = -Math.PI / 2; shell.position.y = -0.42;
      shell.castShadow = shell.receiveShadow = true; this.chassis.add(shell);
    } else if (p.shape === 'tractor') {
      block(w, sill + 0.55, cabLength, 0, (sill - 0.55) / 2, cabCenter);
      block(1.35, 0.22, length - cabLength, 0, -0.3, (cabBack + length / 2) / 2, trim);
    } else block(w, sill + 0.55, length, 0, (sill - 0.55) / 2, 0);
    if (passenger) {
      block(w - 0.05, 0.13, cabFront - nose, 0, sill + 0.035, (nose + cabFront) / 2);
      block(w - 0.05, 0.12, length / 2 - cabBack, 0, sill, (length / 2 + cabBack) / 2);
    }
    const rake = passenger ? p.shape === 'sedan' ? 0.48 : 0.24 : 0.06;
    block(w - 0.16, 0.09, cabLength - rake * 2, 0, roof - 0.045, cabCenter);
    for (const z of [cabFront, cabBack]) {
      const front = z === cabFront, tilt = Math.atan2(rake, roof - sill) * (front ? 1 : -1);
      const center = z + (front ? rake / 2 : -rake / 2);
      const window = block(w - 0.18, Math.hypot(roof - sill, rake) - 0.07, 0.015, 0, (roof + sill) / 2, center, glass); window.rotation.x = tilt;
      for (const side of [-1, 1]) {
        const pillar = block(0.065, Math.hypot(roof - sill, rake), 0.065, side * (w / 2 - 0.07), (roof + sill) / 2, center);
        pillar.rotation.x = tilt;
      }
    }
    const windowShape = new Shape();
    windowShape.moveTo(cabFront, sill + 0.04); windowShape.lineTo(cabFront + rake, roof - 0.07);
    windowShape.lineTo(cabBack - rake, roof - 0.07); windowShape.lineTo(cabBack, sill + 0.04); windowShape.closePath();
    const sideGlass = this.geometry(new ExtrudeGeometry(windowShape, { depth: 0.012, bevelEnabled: false, steps: 1 }));
    for (const side of [-1, 1]) {
      block(0.055, sill + 0.25, cabLength, side * (w / 2 - 0.025), (sill - 0.25) / 2, cabCenter);
      const window = new Mesh(sideGlass, glass); window.rotation.y = -Math.PI / 2;
      window.position.x = side * (w / 2 - 0.06); this.chassis.add(window);
      for (let z = cabFront + (bus ? 1.6 : cabLength / 2); z < cabBack - 0.2; z += bus ? 1.45 : cabLength)
        block(0.07, roof - sill, 0.075, side * (w / 2 - 0.07), (roof + sill) / 2, z, trim);
      block(0.025, 0.05, 0.25, side * (w / 2 + 0.015), sill - 0.1, cabFront + 0.7, metal);
      block(0.18, 0.04, 0.09, side * (w / 2 + 0.04), p.eye.y - 0.28, cabFront + 0.25, trim);
      block(0.13, passenger ? 0.12 : 0.32, 0.13, side * (w / 2 + 0.14), p.eye.y - 0.17, cabFront + 0.25, metal);
      block(w * 0.2, 0.1, 0.04, side * w * 0.3, 0.02, nose - 0.015, lamp);
      block(w * 0.19, 0.11, 0.04, side * w * 0.31, 0.02, length / 2 + 0.02, this.tail);
      if (bus) {
        block(0.035, 0.17, length - 0.15, side * w / 2, 0.36, 0, metal);
        for (let z = cabFront + 1.7; z < cabBack - 0.3; z += 1.1) {
          block(0.72, 0.16, 0.6, side * w * 0.28, 0.42, z, leather);
          block(0.72, 0.68, 0.14, side * w * 0.28, 0.74, z + 0.27, leather);
        }
      }
    }
    if (bus) {
      block(w - 0.08, (roof - sill) * 0.45, 0.055, 0, sill + (roof - sill) * 0.22, cabBack);
      for (let y = sill + 0.08; y < sill + (roof - sill) * 0.4; y += 0.11)
        block(w * 0.65, 0.025, 0.025, 0, y, cabBack + 0.04, trim);
      block(w * 0.7, 0.14, 1.4, 0, roof + 0.02, 0.5, metal);
      block(0.035, sill + 0.45, 0.7, w / 2 + 0.012, (sill - 0.45) / 2, cabFront + 0.75, trim);
    }
    const arch = this.geometry(new TorusGeometry(p.radius + 0.07, 0.055, 6, 20, Math.PI));
    for (const point of p.wheels) {
      const fender = new Mesh(arch, paint); fender.rotation.y = Math.PI / 2;
      fender.position.set(point.x, p.radius - this.rideHeight, -point.along);
      fender.castShadow = true; this.chassis.add(fender);
    }
    block(w * 0.62, 0.14, 0.025, 0, -0.12, nose - 0.022, trim);
    block(w - 0.08, 0.15, 0.35, 0, p.eye.y - 0.43, cabFront + 0.18, trim);
    for (const x of bus ? [p.eye.x] : [p.eye.x, -p.eye.x]) {
      block(0.56, 0.16, 0.55, x, p.eye.y - 0.72, -p.eye.along + 0.05, leather);
      block(0.56, 0.6, 0.13, x, p.eye.y - 0.42, -p.eye.along + 0.36, leather);
      if (p.shape === 'suv') {
        block(0.62, 0.16, 0.55, x, p.eye.y - 0.6, 1.15, leather);
        block(0.62, 0.6, 0.13, x, p.eye.y - 0.3, 1.45, leather);
      }
    }
    this.steering.position.set(p.eye.x, p.eye.y - 0.3, -p.eye.along - 0.4);
    this.steering.rotation.x = -0.45; this.chassis.add(this.steering);
    this.steering.add(new Mesh(this.geometry(new TorusGeometry(0.18, 0.018, 6, 24)), trim));
    block(0.31, 0.035, 0.03, 0, 0, 0, metal, this.steering);
    if (p.shape === 'truck') {
      const start = cabBack + 0.15, end = length / 2, floor = sill + 0.035, cargo = this.material(0xd6d6ca, 0.75, 0.12);
      block(w - 0.08, top - floor, end - start, 0, (top + floor) / 2, (start + end) / 2, cargo);
      for (const side of [-1, 1]) {
        block(0.025, 0.12, end - start, side * (w / 2 - 0.025), 0.38, (start + end) / 2, paint);
        for (let z = start + 0.3; z < end; z += 0.65) block(0.03, top - floor - 0.1, 0.035, side * (w / 2 - 0.03), (top + floor) / 2, z, metal);
        block(0.035, top - floor - 0.15, 0.035, side * 0.45, (top + floor) / 2, end + 0.025, metal);
      }
      block(0.03, top - floor, 0.04, 0, (top + floor) / 2, end + 0.025, trim);
    } else if (p.shape === 'tractor') {
      block(1.6, 0.14, 1.25, 0, 0.08, -p.trailer!.hitchAlong, metal);
      for (const side of [-1, 1]) block(0.36, 0.36, 1.1, side * 0.92, -0.08, -0.1, metal);
    } else if (p.shape === 'suv' || bus) {
      for (const side of [-1, 1]) block(0.055, 0.07, cabLength - 0.25, side * (w / 2 - 0.2), roof + 0.02, cabCenter, metal);
    }
  }

  private syncWheels(meshes: WheelMesh[], states: WheelState[], y: number, pitch: number, roll: number, car: VehiclePhysics): void {
    meshes.forEach(({ pivot, spin, spring, point }, i) => {
      const offset = vehicleOffset(point.x, point.along, pitch, roll);
      pivot.position.set(offset.x, states[i].height - y, offset.z);
      pivot.rotation.y = point.steer ? -Math.atan(Math.tan(car.steering) / (1 - point.x * Math.tan(car.steering) / car.wheelbase)) : 0;
      pivot.rotation.z = car.kind === 'motorcycle' ? roll : 0;
      spin.rotation.x = -car.wheelAngle;
      spring.position.set(offset.x * 0.85, pivot.position.y, offset.z);
      spring.scale.y = Math.max(0.08, -pivot.position.y + offset.y);
    });
  }

  private material(color: number, roughness = 0.8, metalness = 0): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, roughness, metalness }); this.materials.push(material); return material;
  }
  private geometry<T extends BufferGeometry>(geometry: T): T { this.geometries.push(geometry); return geometry; }
  dispose(): void {
    this.root.removeFromParent(); this.headlight.dispose();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
  }
}
