import { BoxGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, Shape, SpotLight, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry, type Scene } from 'three';
import type { VehiclePhysics, WheelState } from './VehiclePhysics';
import { suspensionTuning, vehicleOffset, vehicleProfiles, type VehicleProfile, type WheelPoint } from './VehicleConfig';
import { Windshield } from './Windshield';
import type { VehicleSystems } from './VehicleSystems';
import { bodyPanelGeometry, mergeVehicleParts, rimGeometry, tireGeometry, wheelArchPanelGeometry, wheelFenderGeometry } from './VehicleGeometry';
import { cabStepZ, flatbedDetails, vehicleDetails, type VehicleBlock as Block, type VehicleDetailKit } from './VehicleDetails';
import { busBody } from './BusBody';
import { VehicleFittings } from './VehicleFittings';
import type { VehicleOperations } from './VehicleOperations';
import { busSeatWidth, cabinBounds, cabinSeats } from './CabinState';
import { cabinLayouts, type CabinLayout } from './CabinLayout';
import { CraneMesh } from './CraneMesh';
import type { CraneSystems } from './CraneSystems';
import { VehicleDisplay } from './VehicleDisplay';
import { fleetBody } from './FleetBody';
import { vehicleFinish } from './VehicleFinish';
import { compactSideLights, sideLampPositions, sideMarkerX, vehicleReflectors } from './VehicleSafety';
import { reflectiveMaterial } from '../render/ReflectiveMaterial';
import { SprinklerSpray } from './SprinklerSpray';
import { cabinFridge } from './CabinFridge';
import type { InteriorBounds } from '../render/InteriorVolume';

interface WheelMesh { pivot: Group; spin: Group; spring: Mesh; point: WheelPoint }

export class VehicleMesh {
  readonly root = new Group();
  readonly chassis = new Group();
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly wheels: WheelMesh[] = [];
  private readonly trailers: { root: Group; body: Group; wheels: WheelMesh[] }[] = [];
  private readonly steering = new Group();
  private readonly fittings = new VehicleFittings();
  private readonly tail;
  private readonly lamp;
  private readonly signals: MeshStandardMaterial[] = [];
  private readonly paint: MeshStandardMaterial;
  private windshield?: Windshield;
  private readonly roof = new Group();
  private readonly windows: Group[] = [];
  private readonly cabinLight = new PointLight(0xffd69b, 0, 2.5, 2);
  private readonly cabinFill = new PointLight(0xffdfb5, 0, 4, 2);
  private readonly reverseLight = new SpotLight(0xffffff, 0, 18, 0.85, 0.65, 1.6);
  private readonly readingLamp: MeshStandardMaterial;
  private readonly ambient: MeshStandardMaterial;
  private readonly display = new VehicleDisplay();
  private readonly operatorDisplay?: VehicleDisplay;
  private readonly deviceLights: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly indicatorColor = new Color();
  private readonly crane?: CraneMesh;
  private readonly headlight = new SpotLight(0xffeed0, 0, 100, 0.6, 0.65, 1.6);
  private readonly foglight = new SpotLight(0xffdf8c, 0, 45, 0.95, 0.8, 1.5);
  private readonly fogLens;
  private readonly rearFog;
  private readonly sideLamp;
  private readonly reverseLens;
  private readonly spray?: SprinklerSpray;
  private readonly interior: InteriorBounds;
  private operatorInterior?: InteriorBounds;

  constructor(scene: Scene, private readonly profile: VehicleProfile = vehicleProfiles.roadster) {
    this.interior = { bounds: cabinBounds(profile, this.rideHeight), matrixWorld: this.chassis.matrixWorld };
    const paint = this.paint = this.material(profile.paint, 0.4, 0.25), trim = this.material(0x202b2c), rubber = this.material(0x171c1d);
    paint.name = 'vehicle-paint';
    const metal = this.material(0xaeb9b5, 0.35, 0.7), leather = this.material(profile.bus ? 0x294454 : profile.shape === 'supercar' ? 0x283138 : 0x675447);
    const upholstery = this.material(profile.bus ? 0x72959d : profile.shape === 'supercar' ? 0xab593d : 0x9b8c70, 0.95);
    const glass = this.material(profile.shape === 'roadster' ? 0xc3e2e4 : 0x627e88, 0.15, 0.15);
    glass.transparent = true; glass.opacity = profile.shape === 'roadster' ? 0.16 : 0.58; glass.depthWrite = false;
    glass.side = DoubleSide;
    this.readingLamp = this.material(0xe2d6b5, 0.4); this.readingLamp.emissive.setHex(0xffd69b);
    this.ambient = this.material(0x265262, 0.4); this.ambient.emissive.setHex(0x57dbe7); this.ambient.emissiveIntensity = 0;
    this.tail = this.material(0xca3932); this.tail.emissive.setHex(0xff3020);
    const lamp = this.lamp = this.material(0xffefcf); lamp.emissive.setHex(0xffeed0); lamp.emissiveIntensity = 0;
    this.fogLens = this.material(0xffdc85, 0.22); this.fogLens.emissive.setHex(0xffdf8c); this.fogLens.emissiveIntensity = 0;
    this.rearFog = this.material(0xc92b21, 0.25); this.rearFog.emissive.setHex(0xff2414); this.rearFog.emissiveIntensity = 0;
    this.sideLamp = this.material(0xdb8723, 0.3); this.sideLamp.emissive.setHex(0xffa128); this.sideLamp.emissiveIntensity = 0;
    this.reverseLens = this.material(0xe5eef0, 0.2); this.reverseLens.name = 'reverse-lens';
    this.reverseLens.emissive.setHex(0xffffff); this.reverseLens.emissiveIntensity = 0;
    this.root.add(this.chassis); this.root.visible = false; scene.add(this.root);
    const makeBlock = (geometry: BufferGeometry): Block => (w, h, l, x, y, z, material = paint, parent = this.chassis) => {
      const mesh = new Mesh(geometry, material); mesh.scale.set(w, h, l); mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const box = this.geometry(new BoxGeometry());
    const block = makeBlock(box), panel = makeBlock(this.geometry(bodyPanelGeometry()));
    const amber = this.material(0xe6a02d, 0.3); amber.emissive.setHex(0xd57516); amber.emissiveIntensity = 0.25;
    const kit = { block, panel, paint, trim, metal, glass, lamp, amber, wood: this.material(0x8b7859, 0.95),
      wheelPanel: (from: number, to: number, bottom: number, top: number, x: number, material: MeshStandardMaterial, parent: Group, originZ = 0) => {
        const mesh = new Mesh(this.geometry(wheelArchPanelGeometry(from, to, bottom, top,
          profile.wheels.filter(wheel => wheel.x > 0).map(wheel => -wheel.along - originZ), profile.radius - this.rideHeight, profile.radius + 0.06)), material);
        mesh.position.x = x; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
      },
      cylinder: (radius: number, length: number, x: number, y: number, z: number, material: MeshStandardMaterial, parent: Group, bottomRadius = radius) => {
        const mesh = new Mesh(this.geometry(new CylinderGeometry(radius, bottomRadius, length, 16)), material);
        mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
      } };
    if (profile.shape === 'roadster') {
    const shape = new Shape();
    shape.moveTo(-0.74, -2.05); shape.lineTo(0.74, -2.05); shape.lineTo(0.92, -1.65);
    shape.lineTo(0.92, 1.6); shape.lineTo(0.7, 2.05); shape.lineTo(-0.7, 2.05);
    shape.lineTo(-0.92, 1.6); shape.lineTo(-0.92, -1.65); shape.closePath();
    const shell = new Mesh(this.geometry(new ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 1, steps: 1 })), paint);
    shell.rotation.x = -Math.PI / 2; shell.position.y = -0.34; shell.castShadow = shell.receiveShadow = true; this.chassis.add(shell);
    panel(1.69, 0.12, 1.25, 0, 0.1, -1.35);
    panel(1.68, 0.16, 0.63, 0, 0.12, 1.6);
    block(1.75, 0.1, 0.1, 0, -0.17, -2.1, trim);
    block(1.55, 0.1, 0.1, 0, -0.2, 2.1, trim);
    for (const side of [-1, 1]) {
      const door = this.fittings.hinge('doors', this.chassis, side * 0.84, 0, -0.74, 'y', side * 1.1);
      panel(0.15, 0.3, 1.92, 0, 0.09, 0.96, paint, door);
      block(0.05, 0.04, 0.2, side * 0.1, 0.17, 1.24, metal, door);
      block(0.025, 0.19, 1.4, -side * 0.089, 0.09, 0.96, leather, door);
      block(0.1, 0.055, 0.55, -side * 0.13, 0.13, 0.98, trim, door);
      block(0.025, 0.045, 0.15, -side * 0.109, 0.18, 0.54, metal, door);
      const window = new Group(); window.name = 'driver-window'; window.position.set(-side * 0.03, 0.24, 0.74);
      const outline = new Shape(); outline.moveTo(-0.85, 0); outline.lineTo(-0.625, 0.8175);
      outline.lineTo(1.23, 0.8175); outline.lineTo(1.23, 0); outline.closePath();
      const pane = new Mesh(this.geometry(new ExtrudeGeometry(outline, { depth: 0.015, bevelEnabled: false })), glass);
      pane.rotation.y = -Math.PI / 2; window.add(pane);
      this.windows.push(window); door.add(window);
      block(0.035, 0.025, 1.94, -side * 0.025, 0.245, 0.96, trim, door);
      block(0.08, 0.32, 0.075, side * 0.84, 0.09, 1.2, trim);
      block(0.09, 0.045, 1.94, side * 0.8, -0.08, 0.22, trim);
      block(0.5, 0.09, 0.055, side * 0.53, 0.02, -2.09, lamp);
      block(0.56, 0.09, 0.055, side * 0.52, 0.04, 2.09, this.tail);
      block(0.03, 0.22, 0.035, side * 0.86, 0.34, -0.66, trim);
      block(0.2, 0.035, 0.045, side * 0.93, 0.44, -0.66, trim);
      block(0.22, 0.12, 0.13, side * 1.03, 0.44, -0.64, paint);
      block(0.19, 0.09, 0.012, side * 1.03, 0.44, -0.569, metal);
      const pillar = block(0.035, 0.87, 0.035, side * 0.8, 0.65, -0.74, metal); pillar.rotation.x = 0.27;
    }
    const windshield = block(1.55, 0.81, 0.014, 0, 0.65, -0.74, glass); windshield.rotation.x = 0.27;
    this.windshield = new Windshield(windshield, 1.55, 0.81);
    block(1.65, 0.035, 0.045, 0, 1.07, -0.63, metal);
    this.roof.name = 'convertible-roof'; this.chassis.add(this.roof);
    block(1.63, 0.065, 1.85, 0, 0, -0.85, trim, this.roof);
    block(1.55, 0.85, 0.018, 0, -0.46, 0.08, glass, this.roof);
    block(1.64, 0.045, 0.08, 0, -0.88, 0.08, trim, this.roof);
    block(1.65, 0.14, 0.1, 0, 0.15, 1.23, trim);
    for (const side of [-1, 1]) {
      block(0.07, 0.88, 0.08, side * 0.78, -0.44, 0.08, trim, this.roof);
      block(0.055, 0.085, 1.87, side * 0.805, -0.035, -0.85, trim, this.roof);
    }
    block(1.58, 0.15, 0.3, 0, 0.25, -0.64, trim);
    block(0.2, 0.17, 0.8, 0, 0.09, 0.2, trim);
    this.steering.position.set(-0.43, 0.42, -0.4); this.steering.rotation.x = -0.25; this.chassis.add(this.steering);
    const ring = new Mesh(this.geometry(new TorusGeometry(0.155, 0.018, 6, 24)), trim); this.steering.add(ring);
    block(0.27, 0.027, 0.025, 0, 0, 0, metal, this.steering);
    block(0.035, 0.14, 0.03, 0, -0.065, 0, metal, this.steering);
    } else if (profile.bus) {
      const body = busBody(profile, this.chassis, kit, this.fittings, this.rideHeight);
      this.windshield = new Windshield(body.windshield, body.width, body.height); this.windows.push(...body.windows);
      this.steering.position.set(profile.eye.x, profile.eye.y - 0.3, -profile.eye.along - 0.4);
      this.steering.rotation.x = -0.55; this.chassis.add(this.steering);
      this.steering.add(new Mesh(this.geometry(new TorusGeometry(0.2, 0.02, 6, 24)), trim));
      block(0.35, 0.035, 0.035, 0, 0, 0, metal, this.steering);
      for (const side of [-1, 1]) block(0.3, 0.16, 0.04, side * profile.width * 0.35, 0.05, profile.length / 2 + 0.025, this.tail);
    } else this.buildBody(block, paint, trim, metal, glass, leather, lamp, kit);
    vehicleDetails(profile, this.chassis, kit, this.rideHeight);
    fleetBody(profile, this.chassis, kit, this.fittings, this.rideHeight);
    vehicleFinish(profile, this.chassis, kit, this.rideHeight);
    const fridge = cabinFridge(profile, this.chassis, kit);
    if (profile.body === 'ambulance' || profile.body === 'firetruck') {
      const beacon = this.fittings.beacon = this.material(0x347bbf, 0.2); beacon.emissive.setHex(0x268aff);
      for (const side of [-1, 1]) block(0.4, 0.16, 0.28, side * 0.65, Math.min(profile.height - this.rideHeight - 0.1, profile.eye.y + 0.48), -profile.eye.along, beacon);
    }
    if (profile.shape === 'flatbed') this.fittings.cargo(this.chassis, profile.width, -profile.length / 2 + 2.8, profile.length / 2, 0.3, 0.5, 'flatbed', kit, this.rideHeight);
    if (profile.shape === 'supercar') {
      const wing = this.fittings.hinge('aux', this.chassis, 0, 0.24, profile.length / 2 - 0.3, 'x', -0.45);
      block(profile.width * 0.85, 0.06, 0.36, 0, 0.27, 0, trim, wing);
      for (const side of [-1, 1]) block(0.055, 0.25, 0.1, side * 0.55, 0.13, 0, metal, wing);
    }
    if (profile.shape === 'crane' || ['sprinkler', 'dumptruck', 'mixer', 'garbage', 'towtruck'].includes(profile.body ?? '')) {
      const beacon = this.fittings.beacon = this.material(0xd78b18, 0.35); beacon.emissive.setHex(0xffa310);
      for (const side of [-1, 1]) block(0.13, 0.12, 0.15, side * 0.9, profile.eye.y + 0.43, -profile.eye.along, beacon);
    }
    if (profile.body === 'sprinkler') this.spray = new SprinklerSpray(this.chassis, profile.chassisLength / 2, this.rideHeight);
    if (profile.shape === 'motorcycle') {
      const length = (this.rideHeight - 0.22) / Math.sin(1.25);
      const stand = this.fittings.hinge('aux', this.chassis, -0.19, -0.2, 0.2, 'x', 1.25);
      block(0.035, 0.035, length, 0, 0, length / 2, metal, stand);
      block(0.13, 0.025, 0.08, 0, 0, length, trim, stand);
    }
    if (profile.shape === 'crane') {
      this.crane = new CraneMesh(this.chassis, kit, this.rideHeight); this.geometries.push(...this.crane.mergeParts());
      const bounds = this.interior.bounds.clone(); bounds.min.set(-1.3, 1.3, -1.53); bounds.max.set(-0.46, 2.12, 0.13);
      this.operatorInterior = { bounds, matrixWorld: this.crane.turret.matrixWorld };
    }
    for (const seat of cabinSeats(profile)) {
      if (seat.role === 'operator' || profile.shape === 'motorcycle') continue;
      const width = profile.bus ? busSeatWidth(profile) : seat.id.startsWith('rear') ? 0.4 : 0.52;
      block(width, 0.15, 0.5, seat.x, seat.y - 0.69, -seat.along + 0.05, leather);
      block(width, 0.58, 0.13, seat.x, seat.y - 0.37, -seat.along + 0.32, leather);
      block(width * 0.65, 0.18, 0.13, seat.x, seat.y - 0.02, -seat.along + 0.32, leather);
      block(width * 0.68, 0.31, 0.018, seat.x, seat.y - 0.34, -seat.along + 0.248, upholstery);
      block(width * 0.68, 0.012, 0.32, seat.x, seat.y - 0.61, -seat.along + 0.02, upholstery);
      for (const side of [-1, 1]) {
        block(0.035, 0.16, 0.035, seat.x + side * width * 0.48, seat.y - 0.64, -seat.along + 0.15, metal);
        block(0.055, 0.045, 0.32, seat.x + side * width * 0.51, seat.y - 0.55, -seat.along + 0.07, trim);
      }
      block(width * 0.76, 0.015, 0.035, seat.x, seat.y - 0.6, -seat.along - 0.14, metal);
      block(width * 0.55, 0.12, 0.035, seat.x, seat.y - 0.35, -seat.along + 0.4, trim);
    }
    const eye = profile.eye;
    this.display.root.position.set(eye.x + 0.28, eye.y - 0.22, -eye.along - 0.6);
    this.display.root.rotation.x = -0.2;
    if (profile.shape === 'motorcycle') { this.display.root.position.x = 0; this.display.root.scale.setScalar(0.7); this.display.root.rotation.x = -0.45; }
    this.chassis.add(this.display.root);
    if (this.crane) {
      this.operatorDisplay = new VehicleDisplay();
      this.operatorDisplay.root.name = 'crane-display';
      this.operatorDisplay.root.position.set(-0.7, 1.56, -1.28);
      this.operatorDisplay.root.rotation.x = -0.2;
      this.crane.turret.add(this.operatorDisplay.root);
    }
    this.deviceLights = new InstancedMesh(box, new MeshBasicMaterial({ toneMapped: false }), 14);
    this.deviceLights.name = 'device-indicators'; this.chassis.add(this.deviceLights);
    for (let i = 0; i < 12; i++) this.deviceLights.setMatrixAt(i,
      new Matrix4().makeScale(0.014, 0.012, 0.012).setPosition(this.display.root.position.x - 0.12 + i * 0.022, eye.y - 0.31, -eye.along - 0.57));
    this.deviceLights.instanceMatrix.needsUpdate = true;
    const ignitionX = profile.shape === 'motorcycle' ? 0.12 : eye.x + 0.23;
    block(0.08, 0.07, 0.04, ignitionX, eye.y - 0.33, -eye.along - 0.48, metal);
    this.deviceLights.setMatrixAt(12, new Matrix4().makeScale(0.044, 0.035, 0.008).setPosition(ignitionX, eye.y - 0.33, -eye.along - 0.455));
    this.deviceLights.setMatrixAt(13, new Matrix4().makeScale(0.06, 0.026, 0.006).setPosition(fridge.position));
    if (profile.shape !== 'motorcycle') {
      const eye = profile.eye;
      for (let deck = 0; deck < (profile.bus?.rows.length ?? 1); deck++) for (const side of [-1, 1])
        block(0.025, 0.018, profile.shape === 'bus' ? profile.length - 1 : 1.2,
          side * (profile.width / 2 - 0.12), eye.y - 0.42 + deck * (profile.bus?.deckHeight ?? 0), profile.shape === 'bus' ? 0 : -eye.along, this.ambient);
      if (profile.bus) for (const seat of cabinSeats(profile).filter(s => s.role === 'passenger')) {
        const ceiling = seat.floor < profile.bus.rows.length ? profile.eye.y - 1.2 + profile.bus.deckHeight : profile.height - this.rideHeight;
        block(0.06, 0.018, 0.06, seat.x, ceiling - 0.14, -seat.along + 0.3, this.readingLamp);
      }
      block(0.07, 0.02, 0.045, profile.width * 0.36, eye.y - 0.35, -eye.along - 0.65, this.readingLamp);
      this.cabinLight.position.set(0, eye.y - 0.04, -eye.along - 0.3); this.chassis.add(this.cabinLight);
      for (const side of [-1, 1]) {
        block(0.04, 0.018, 0.045, side * profile.width * 0.34, eye.y - 0.48, -profile.chassisLength / 2 + 0.18, trim);
      }
    }
    for (const side of [-1, 1]) {
      const signal = this.material(0xa96b20, 0.3); signal.emissive.setHex(0xff9b19); signal.emissiveIntensity = 0;
      this.signals.push(signal);
      const bike = profile.shape === 'motorcycle', compact = compactSideLights(profile);
      const x = side * profile.width * (bike ? 0.29 : profile.shape === 'roadster' ? 0.36 : 0.42);
      for (const end of [-1, 1]) {
        const y = bike ? 0.31 : compact ? -0.1 : 0.19, z = bike && end < 0 ? -0.87 : end * (profile.chassisLength / 2 + 0.035);
        if (compact) panel(0.22, 0.12, 0.055, x, y, z - end * 0.017, trim);
        block(bike ? 0.08 : 0.18, 0.08, 0.05, x, y, z, signal);
      }
      if (!bike && !compact) block(0.04, 0.075, 0.16, side * (profile.width / 2 + 0.02), 0.15, -profile.chassisLength / 2 + 0.75, signal);
    }
    const tireWidth = profile.shape === 'motorcycle' ? 0.15 : profile.width > 2.3 ? 0.3 : 0.24;
    const tireShape = this.geometry(tireGeometry(profile.radius, tireWidth));
    const rimShape = this.geometry(rimGeometry(profile.radius, tireWidth));
    const brakeShape = this.geometry(new CylinderGeometry(profile.radius * 0.51, profile.radius * 0.51, tireWidth * 0.18, 24));
    const hubGeometry = this.geometry(new CylinderGeometry(profile.radius * 0.2, profile.radius * 0.2, tireWidth + 0.05, 12));
    const boltGeometry = this.geometry(new CylinderGeometry(0.016, 0.016, 0.018, 6));
    const coil = this.geometry(new TubeGeometry(new CatmullRomCurve3(Array.from({ length: 65 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 4) * 0.065, i / 64, Math.sin(i * Math.PI / 4) * 0.065))), 64, 0.012, 4, false));
    const addWheels = (points: readonly WheelPoint[], parent: Group, output: WheelMesh[]) => { for (const point of points) {
      const pivot = new Group(), spin = new Group(); pivot.add(spin); parent.add(pivot);
      pivot.name = point.steer ? 'wheel-steer' : 'wheel-fixed'; spin.name = 'wheel-spin';
      pivot.position.set(point.x, 0, -point.along);
      const tire = new Mesh(tireShape, rubber), rim = new Mesh(rimShape, metal), brake = new Mesh(brakeShape, metal);
      tire.rotation.z = rim.rotation.z = Math.PI / 2; tire.castShadow = true; spin.add(tire, rim);
      rim.castShadow = rim.receiveShadow = true;
      brake.rotation.z = Math.PI / 2; brake.castShadow = brake.receiveShadow = true; spin.add(brake);
      const spokes = profile.mass > 4000 ? 10 : profile.shape === 'motorcycle' ? 6 : 5;
      for (const side of [-1, 1]) for (let i = 0; i < spokes; i++) {
        const angle = i * Math.PI * 2 / spokes;
        for (const offset of profile.shape === 'supercar' ? [-0.055, 0.055] : [0]) {
          const turn = angle + offset;
          const spoke = block(0.024, profile.radius * 0.5, profile.radius * (spokes > 6 ? 0.08 : 0.1), side * tireWidth * 0.45,
            Math.cos(turn) * profile.radius * 0.4, Math.sin(turn) * profile.radius * 0.4, metal, spin); spoke.rotation.x = turn;
        }
      }
      const hub = new Mesh(hubGeometry, metal); hub.rotation.z = Math.PI / 2; spin.add(hub);
      hub.castShadow = hub.receiveShadow = true;
      if (point.steer) block(tireWidth * 0.3, profile.radius * 0.4, 0.09, Math.sign(point.x) * tireWidth * 0.18, 0.03, profile.radius * 0.42, paint, pivot);
      for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const bolt = new Mesh(boltGeometry, metal); bolt.rotation.z = Math.PI / 2;
        bolt.position.set(side * (tireWidth * 0.45 + 0.021), Math.cos(angle) * profile.radius * 0.29, Math.sin(angle) * profile.radius * 0.29);
        bolt.castShadow = bolt.receiveShadow = true; spin.add(bolt);
        for (const offset of [0, Math.PI / 6]) {
          const turn = angle + offset;
          const slot = block(0.009, profile.radius * 0.12, 0.015, side * (tireWidth * 0.09 + 0.002),
            Math.cos(turn) * profile.radius * 0.42, Math.sin(turn) * profile.radius * 0.42, trim, spin);
          slot.rotation.x = turn + 0.3;
        }
      }
      for (const side of [-1, 1]) block(0.032, 0.027, 0.027, side * tireWidth * 0.51, profile.radius * 0.59, 0, trim, spin);
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        const tread = block(tireWidth * 0.72, 0.004, 0.011, 0, Math.cos(angle) * profile.radius,
          Math.sin(angle) * profile.radius, trim, spin); tread.rotation.x = angle;
      }
      const spring = new Mesh(coil, metal); parent.add(spring);
      output.push({ pivot, spin, spring, point });
    } };
    addWheels(profile.wheels, this.root, this.wheels);
    const addFenders = (points: readonly WheelPoint[], parent: Group) => {
      const wide = profile.mass > 4000, radius = profile.radius + 0.07;
      for (const side of [-1, 1]) {
        const rows: WheelPoint[][] = [];
        for (const point of points.filter(p => Math.sign(p.x) === side).sort((a, b) => a.along - b.along)) {
          const row = rows.at(-1);
          if (wide && row && point.along - row.at(-1)!.along < radius * 2 + 0.1) row.push(point);
          else rows.push([point]);
        }
        for (const row of rows) {
          const first = row[0], last = row.at(-1)!;
          const fender = new Mesh(this.geometry(wheelFenderGeometry(radius, wide ? 0.36 : 0.08, last.along - first.along)), wide ? trim : paint);
          fender.position.set(wide ? side * (profile.width / 2 - 0.16) : side * (profile.width / 2 - 0.025), profile.radius - this.rideHeight, -(first.along + last.along) / 2);
          fender.castShadow = fender.receiveShadow = true; parent.add(fender);
          if (wide) {
            const z = -first.along + radius + 0.06, y = profile.radius - this.rideHeight;
            block(0.38, 0.32, 0.035, side * (profile.width / 2 - 0.16), y - 0.12, z, trim, parent);
            block(0.35, 0.035, 0.048, side * (profile.width / 2 - 0.16), y + 0.04, z, metal, parent);
          }
        }
      }
    };
    addFenders(profile.wheels, this.chassis);
    for (const [index, trailer] of (profile.trailers ?? []).entries()) {
      const root = new Group(), body = new Group(), wheels: WheelMesh[] = [];
      root.name = `trailer-${index}`; this.trailers.push({ root, body, wheels });
      this.root.add(root); root.add(body);
      const center = trailer.length / 2 - trailer.front;
      if (trailer.front < 0) {
        block(0.18, 0.18, -trailer.front + 0.25, 0, 0, -trailer.front / 2, metal, body);
        block(0.38, 0.18, 0.32, 0, 0, 0, trim, body);
      }
      const top = profile.height - this.rideHeight;
      block(profile.width - 0.06, 0.24, trailer.length, 0, 0, center, trim, body);
      if (trailer.body === 'flatbed') flatbedDetails(profile.width, -trailer.front, trailer.length - trailer.front, body, kit);
      this.fittings.cargo(body, profile.width, -trailer.front, trailer.length - trailer.front, 0.3, top, trailer.body, kit, this.rideHeight);
      for (const side of [-1, 1]) {
        panel(0.16, 0.26, trailer.length - 0.2, side * 0.72, -0.15, center, trim, body);
        for (const z of trailer.body === 'flatbed' ? [] : [-trailer.front + 0.1, trailer.length - trailer.front - 0.1]) {
          panel(0.13, top - 0.3, 0.12, side * (profile.width / 2 - 0.035), (top + 0.3) / 2, z, metal, body);
        }
        block(0.04, 0.13, trailer.length - 0.2, side * profile.width / 2, 0.35, center, paint, body);
        block(0.12, 0.6, 0.12, side * 0.82, -0.25, 1.7, metal, body);
        block(0.22, 0.08, 0.3, side * 0.82, -0.55, 1.7, trim, body);
        block(0.34, 0.14, 0.06, side * 0.84, -0.12, trailer.length - trailer.front + 0.02, this.tail, body);
        block(0.18, 0.1, 0.065, side * 1.1, -0.12, trailer.length - trailer.front + 0.035, this.signals[side < 0 ? 0 : 1], body);
      }
      const back = trailer.length - trailer.front + 0.025;
      block(profile.width - 0.1, 0.1, 0.1, 0, -0.48, back, metal, body);
      for (const side of [-1, 1]) {
        block(0.1, 0.42, 0.1, side * 0.76, -0.25, back - 0.12, trim, body);
        for (let z = 0.8; z < trailer.length - trailer.front - 0.4; z += 1.2)
          block(0.026, 0.055, 0.42, side * (profile.width / 2 + 0.017), 0.32, z, metal, body);
      }
      for (const x of [-0.84, -0.42, 0, 0.42, 0.84]) block(0.2, 0.065, 0.016, x, -0.48, back + 0.059, amber, body);
      addWheels(trailer.wheels, root, wheels);
      addFenders(trailer.wheels, body);
    }
    this.headlight.position.set(0, profile.shape === 'motorcycle' ? 0.3 : 0.05, -profile.chassisLength / 2 + 0.08);
    this.headlight.target.position.set(0, -0.5, -40);
    this.chassis.add(this.headlight, this.headlight.target);
    this.headlight.name = 'headlight-beam'; this.foglight.name = 'foglight-beam';
    this.foglight.position.set(0, -0.22, -profile.chassisLength / 2 - 0.07);
    this.foglight.target.position.set(0, -this.rideHeight + 0.08, -profile.chassisLength / 2 - 22);
    this.chassis.add(this.foglight, this.foglight.target);
    for (const side of profile.shape === 'motorcycle' ? [0] : [-1, 1]) {
      block(0.14, 0.08, 0.06, side * profile.width * 0.31, -0.22, -profile.chassisLength / 2 - 0.04, this.fogLens);
    }
    const retro = reflectiveMaterial(); retro.vertexColors = true; this.materials.push(retro);
    const retroShapes = new Map<number, BufferGeometry>();
    for (const [part, parent] of [this.chassis, ...this.trailers.map(t => t.body)].entries()) {
      const trailer = part ? profile.trailers![part - 1] : undefined;
      for (const m of vehicleReflectors(profile, part)) {
        let geometry = retroShapes.get(m.color);
        if (!geometry) {
          geometry = this.geometry(new BoxGeometry());
          const colors = new Float32Array(geometry.getAttribute('position').count * 3), color = new Color(m.color);
          for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); retroShapes.set(m.color, geometry);
        }
        const reflector = new Mesh(geometry, retro); reflector.scale.set(m.w, m.h, m.l); reflector.position.set(m.x, m.y, m.z);
        reflector.receiveShadow = true; parent.add(reflector);
      }
      if (profile.shape !== 'motorcycle') for (const side of [-1, 1]) for (const z of sideLampPositions(profile, part)) {
        const compact = compactSideLights(profile, part), mount = sideMarkerX(profile, z), x = side * (mount + 0.025);
        panel(0.045, compact ? 0.1 : 0.22, compact ? 0.2 : 0.25, side * (mount + 0.005), compact ? -0.1 : 0.1, z, trim, parent);
        block(0.025, compact ? 0.052 : 0.07, compact ? 0.09 : 0.18, x, compact ? -0.1 : 0.06, z - (compact ? 0.043 : 0), this.sideLamp, parent);
        block(0.028, compact ? 0.052 : 0.07, compact ? 0.065 : 0.14, x, compact ? -0.1 : 0.145, z + (compact ? 0.045 : 0), this.signals[side < 0 ? 0 : 1], parent);
      }
      const rear = trailer ? trailer.length - trailer.front : profile.chassisLength / 2;
      for (const side of profile.shape === 'motorcycle' ? [0] : [-1, 1]) {
        const x = side * profile.width * 0.29, y = profile.shape === 'motorcycle' ? 0.16 : -0.12;
        block(0.18, 0.12, 0.065, x, y, rear + 0.035, trim, parent);
        block(0.14, 0.072, 0.024, x, y, rear + 0.075, this.reverseLens, parent);
        for (const offset of [-0.04, 0, 0.04]) block(0.007, 0.063, 0.005, x + offset, y, rear + 0.09, metal, parent);
      }
      if (part === this.trailers.length) block(0.13, 0.085, 0.04, -profile.width * 0.23, -0.2, rear + 0.055, this.rearFog, parent);
    }
    if (profile.shape !== 'motorcycle') {
      const front = -profile.chassisLength / 2;
      for (const y of [-0.17, -0.11, -0.05]) block(profile.width * 0.53, 0.012, 0.014, 0, y, front - 0.04, metal);
    }
    const layouts = cabinLayouts(profile), lining = layouts.some(l => l.entry === 'cabin') ? this.material(0xc5cfcd, 0.96) : undefined;
    for (const layout of layouts) {
      const parent = this.compartment(layout.part), b = layout.bounds;
      if (lining) block(profile.width - 0.14, 0.016, b.max.z - b.min.z, 0, b.max.y - 0.008, (b.min.z + b.max.z) / 2, lining, parent);
      for (let z = b.min.z + 0.6; z < b.max.z - 0.3; z += 2.2) {
        for (let deck = 0; deck < (profile.bus?.rows.length ?? 1); deck++) {
          const y = deck === 0 && layout.stairs ? b.min.y + layout.stairs.rise - 0.14 : b.max.y - 0.055;
          block(0.35, 0.025, 0.13, 0, y, z, this.readingLamp, parent);
        }
      }
      if (profile.body === 'camper') {
        block(0.9, 0.08, b.max.z - b.min.z, 0, b.min.y - 0.04, (b.min.z + b.max.z) / 2, kit.wood, parent);
        for (const { bounds: f, kind } of layout.furniture) {
          const size = f.getSize(new Vector3()), center = f.getCenter(new Vector3());
          block(size.x, size.y, size.z, center.x, center.y, center.z, kind === 'counter' ? kit.wood : leather, parent);
          block(size.x + 0.015, 0.04, size.z + 0.015, center.x, f.max.y, center.z, kind === 'counter' ? metal : upholstery, parent);
          if (kind === 'counter') {
            block(0.36, 0.018, 0.36, center.x, f.max.y + 0.025, center.z, trim, parent);
            block(0.035, 0.16, 0.035, center.x - 0.2, f.max.y + 0.08, center.z, metal, parent);
          }
          if (kind === 'bed') for (const x of [-0.5, 0.5]) block(0.5, 0.12, 0.3, x, f.max.y + 0.06, center.z + 0.25, upholstery, parent);
        }
      }
    }
    this.cabinLight.name = 'cabin-reading-light'; this.cabinFill.name = 'cabin-fill-light'; this.chassis.add(this.cabinFill);
    const rearParent = this.trailers.at(-1)?.body ?? this.chassis;
    const rearZ = profile.trailers?.length ? profile.trailers.at(-1)!.length - profile.trailers.at(-1)!.front : profile.chassisLength / 2;
    this.reverseLight.name = 'reverse-beam'; this.reverseLight.position.set(0, -0.05, rearZ + 0.12);
    this.reverseLight.target.position.set(0, -1, rearZ + 7); rearParent.add(this.reverseLight, this.reverseLight.target);
    for (const parent of [this.chassis, ...this.trailers.map(t => t.body), this.steering, ...this.fittings.hinges.map(h => h.root), ...this.wheels.map(wheel => wheel.spin), ...this.trailers.flatMap(t => t.wheels.map(wheel => wheel.spin))])
      this.geometries.push(...mergeVehicleParts(parent));
  }

  setPaint(color: number): void { this.paint.color.setHex(color); }
  get glassWater(): number { return this.windshield?.rain.coverage ?? 0; }
  get sweptWater(): number { return this.windshield?.rain.sweptCoverage ?? 0; }
  cabinVolume(operator = false): InteriorBounds {
    const target = operator && this.crane ? this.crane.turret : this.chassis;
    target.updateWorldMatrix(true, false);
    return operator && this.operatorInterior ? this.operatorInterior : this.interior;
  }

  compartment(part: number): Group { return part ? this.trailers[part - 1].body : this.chassis; }

  walkVolume(layout: CabinLayout): InteriorBounds {
    const body = this.compartment(layout.part); body.updateWorldMatrix(true, false);
    return { bounds: layout.bounds, matrixWorld: body.matrixWorld };
  }

  illuminateInterior(layout: CabinLayout | undefined, position: { x: number; y: number; z: number }, enabled: boolean): void {
    if (!layout) { this.cabinFill.intensity = 0; return; }
    const parent = this.compartment(layout.part), b = layout.bounds;
    if (this.cabinFill.parent !== parent) parent.add(this.cabinFill);
    const ceiling = layout.stairs && position.y < b.min.y + layout.stairs.rise - 0.4
      ? b.min.y + layout.stairs.rise - 0.16 : b.max.y - 0.08;
    this.cabinFill.position.set(0, ceiling, Math.max(b.min.z + 0.3, Math.min(b.max.z - 0.3, position.z)));
    this.cabinFill.intensity = enabled ? 3 : 0;
  }

  sync(car: VehiclePhysics, origin: { x: number; z: number }, systems: VehicleSystems, dt = 0, crane?: CraneSystems, operations?: VehicleOperations): void {
    this.root.position.set(car.x - origin.x, car.y, car.z - origin.z);
    this.root.rotation.y = -car.heading;
    this.chassis.rotation.set(car.pitch, 0, car.roll, 'YXZ');
    this.syncWheels(this.wheels, car.wheels, car.y, car.pitch, car.roll, car);
    for (const [i, t] of car.trailers.entries()) {
      const { root, body, wheels } = this.trailers[i];
      const dx = t.x - car.x, dz = t.z - car.z, cos = Math.cos(car.heading), sin = Math.sin(car.heading);
      root.position.set(cos * dx + sin * dz, t.y - car.y, -sin * dx + cos * dz);
      root.rotation.y = car.heading - t.heading;
      body.rotation.set(t.pitch, 0, t.roll, 'YXZ');
      this.syncWheels(wheels, t.wheels, t.y, t.pitch, t.roll, car);
    }
    this.steering.rotation.z = -car.steering * 2;
    const on = systems.beam !== 'off', high = systems.beam === 'high';
    this.tail.emissiveIntensity = car.braking ? 2 : on ? 0.75 : 0;
    this.lamp.emissiveIntensity = on ? high ? 3 : 1.8 : 0;
    this.sideLamp.emissiveIntensity = on || systems.fogLights ? 1.6 : 0;
    this.fogLens.emissiveIntensity = systems.fogLights ? 2.5 : 0;
    this.rearFog.emissiveIntensity = systems.fogLights ? 3 : 0;
    this.reverseLens.emissiveIntensity = car.reversing ? 3.5 : 0;
    this.reverseLight.intensity = car.reversing ? 65 : 0;
    const range = Math.max(80, Math.min(800, systems.lightRange)), power = Math.max(0.25, Math.min(2, systems.lightPower));
    this.headlight.intensity = on ? (high ? 650 : 380) * power * Math.sqrt(range / 180) : 0;
    this.foglight.intensity = systems.fogLights ? 210 * power : 0;
    this.headlight.distance = high ? range : range * 0.55; this.headlight.angle = high ? 0.32 : 0.6;
    this.headlight.target.position.set(0, high ? -1 : -1.1, high ? -range * 0.6 : -32);
    this.signals[0].emissiveIntensity = systems.leftSignal ? 3 : 0;
    this.signals[1].emissiveIntensity = systems.rightSignal ? 3 : 0;
    for (const window of this.windows) { window.scale.y = Math.max(0.001, 1 - systems.windowOpen); window.visible = systems.windowOpen < 0.999; }
    this.roof.visible = this.profile.shape === 'roadster' && systems.roofOpen < 0.999;
    this.roof.position.set(0, 1.09 - systems.roofOpen * 0.7, 1.15 + systems.roofOpen * 0.28);
    this.roof.rotation.x = -systems.roofOpen * 1.35; this.roof.scale.z = 1 - systems.roofOpen * 0.78;
    this.cabinLight.intensity = systems.cabinLight && systems.hasWindows ? 1.5 : 0;
    this.readingLamp.emissiveIntensity = this.cabinLight.intensity;
    this.ambient.emissiveIntensity = systems.ambientLight && systems.hasWindows ? 2 : 0;
    const devices = [systems.leftSignal, systems.rightSignal, systems.fan > 0, systems.radioPlaying, systems.wiperRate > 0,
      systems.washerSpray > 0, systems.beam !== 'off', systems.windowOpen > 0, systems.convertible && systems.roofOpen > 0,
      (operations?.doors ?? 0) > 0.001, (operations?.cargo ?? 0) > 0.001, !!operations?.target.aux];
    devices.forEach((on, i) => this.deviceLights.setColorAt(i, this.indicatorColor.setHex(on ? i < 2 ? 0x36ed89 : 0x67deee : 0x07111a)));
    this.deviceLights.setColorAt(12, this.indicatorColor.setHex(car.ignition === 'running' ? 0x36ed89 : car.ignition === 'starting' ? 0xffb340 : 0x692a21));
    this.deviceLights.setColorAt(13, this.indicatorColor.setHex(car.equipment.fridgeOn && car.ignition === 'running'
      ? car.equipment.fridgeCooling ? 0x50dbef : 0x36c784 : 0x07111a));
    this.deviceLights.instanceColor!.needsUpdate = true;
    this.display.update(car, systems, dt, undefined, operations);
    this.operatorDisplay?.update(car, systems, dt, crane);
    if (crane) this.crane?.sync(crane);
    const spraying = this.profile.body === 'sprinkler' && !!operations?.target.aux && car.ignition === 'running';
    this.spray?.update(dt, spraying);
    this.fittings.sync(operations, dt, this.profile.shape === 'crane' && !!crane && !crane.stowed
      || ['dumptruck', 'garbage', 'towtruck'].includes(this.profile.body ?? '') && ((operations?.cargo ?? 0) > 0.001 || !!operations?.target.cargo));
    this.windshield?.update(dt, systems, car.speed);
  }

  private get rideHeight(): number { return this.profile.radius + this.profile.rest - 9.81 / suspensionTuning(3, this.profile).spring; }

  private buildBody(block: Block, paint: MeshStandardMaterial, trim: MeshStandardMaterial, metal: MeshStandardMaterial,
    glass: MeshStandardMaterial, leather: MeshStandardMaterial, lamp: MeshStandardMaterial, kit: VehicleDetailKit): void {
    const p = this.profile, w = p.width, length = p.chassisLength, nose = -length / 2, top = p.height - this.rideHeight;
    const { panel } = kit;
    if (p.shape === 'motorcycle') {
      block(0.27, 0.3, 0.55, 0, -0.12, 0, metal);
      const tank = panel(0.43, 0.32, 0.62, 0, 0.25, -0.16); tank.rotation.x = -0.12;
      panel(0.35, 0.13, 0.65, 0, 0.33, 0.39, leather);
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
      block(0.2, 0.065, 0.025, 0, 0.26, 1.06, this.tail);
      return;
    }
    const passenger = p.shape === 'sedan' || p.shape === 'suv' || p.shape === 'supercar';
    block(w - (passenger ? 0.18 : 0.7), 0.24, length - 0.12, 0, -0.2, 0, trim);
    const cabFront = passenger ? p.body === 'limousine' ? -2.45 : p.body === 'pickup' ? -1.35 : -0.8 : nose + 0.08;
    const cabBack = passenger ? p.body === 'limousine' ? 2.5 : p.body === 'pickup' ? 0.3 : p.shape === 'suv' || p.body === 'hatchback' ? length / 2 - 0.12 : p.shape === 'supercar' ? 0.95 : 1.3 : nose + (length > 6 ? 2.5 : 2);
    const cabLength = cabBack - cabFront, cabCenter = (cabFront + cabBack) / 2;
    const sill = p.shape === 'supercar' ? 0.08 : passenger ? 0.18 : 0.58;
    const roof = p.body === 'expedition' ? top - 0.4 : passenger || p.body === 'van' || p.body === 'camper' ? top : Math.min(top, p.eye.y + 0.4);
    const driverBack = p.body === 'limousine' ? -0.65 : passenger ? Math.min(cabCenter + 0.1, cabBack) : cabBack;
    const doorFront = cabFront + 0.06, doorBack = driverBack - 0.06;
    if (passenger) {
      const bottom = -0.35, wheelY = p.radius - this.rideHeight, arch = p.radius + 0.05;
      const belt = Math.max(sill + 0.04, wheelY + arch + 0.07), end = length / 2;
      block(w - 0.32, 0.08, length - 0.15, 0, bottom, 0, trim);
      for (const [front, back] of p.body === 'pickup' ? [[nose, cabFront]] : [[nose, cabFront], [cabBack, end]])
        block(w - 0.32, sill - bottom, back - front, 0, (sill + bottom) / 2, (front + back) / 2, paint);
      const outline = new Shape(); outline.moveTo(nose, bottom); outline.lineTo(nose + 0.1, belt - 0.04);
      outline.lineTo(nose + 0.45, belt); outline.lineTo(doorFront, belt); outline.lineTo(doorFront, -0.22);
      outline.lineTo(doorBack, -0.22); outline.lineTo(doorBack, belt); outline.lineTo(end - 0.2, belt); outline.lineTo(end, bottom);
      for (const wheel of p.wheels.filter(wheel => wheel.x > 0).sort((a, b) => a.along - b.along)) {
        const z = -wheel.along; outline.lineTo(z + arch, bottom);
        for (let step = 0; step <= 16; step++) outline.lineTo(z + Math.cos(step * Math.PI / 16) * arch, wheelY + Math.sin(step * Math.PI / 16) * arch);
        outline.lineTo(z - arch, bottom);
      }
      outline.lineTo(nose, bottom); outline.closePath();
      const shell = this.geometry(new ExtrudeGeometry(outline, { depth: 0.06, bevelEnabled: false, steps: 1 }));
      for (const side of [-1, 1]) {
        const panel = new Mesh(shell, paint); panel.rotation.y = -Math.PI / 2;
        panel.position.x = side < 0 ? -w / 2 + 0.06 : w / 2; panel.castShadow = panel.receiveShadow = true; this.chassis.add(panel);
      }
      for (const z of p.body === 'pickup' ? [nose + 0.025] : [nose + 0.025, end - 0.025]) block(w - 0.08, sill - bottom, 0.05, 0, (sill + bottom) / 2, z, paint);
    } else if (p.shape === 'tractor' || p.shape === 'flatbed' || p.shape === 'crane' || p.body === 'dumptruck' || p.body === 'tanker' || p.body === 'sprinkler' || p.body === 'firetruck' || p.body === 'mixer') {
      block(w - 0.7, 0.24, cabLength, 0, -0.43, cabCenter);
      for (const z of [cabFront + 0.025, cabBack - 0.025]) block(w, sill + 0.31, 0.05, 0, (sill - 0.31) / 2, z);
      block(1.35, 0.22, length - cabLength, 0, -0.3, (cabBack + length / 2) / 2, trim);
    } else {
      block(w - 0.7, 0.24, length, 0, -0.43, 0);
      block(w - 0.7, sill + 0.31, length / 2 - cabBack, 0, (sill - 0.31) / 2, (cabBack + length / 2) / 2);
      for (const side of [-1, 1]) kit.wheelPanel(cabBack, length / 2, -0.31, sill, side * (w / 2 - 0.03), paint, this.chassis);
      for (const z of [cabFront + 0.025, cabBack - 0.025]) block(w, sill + 0.31, 0.05, 0, (sill - 0.31) / 2, z);
    }
    if (passenger) {
      panel(w - 0.05, 0.13, cabFront - nose, 0, sill + 0.035, (nose + cabFront) / 2);
      if (p.body !== 'pickup') panel(w - 0.05, 0.12, length / 2 - cabBack, 0, sill, (length / 2 + cabBack) / 2);
    }
    const rake = passenger ? p.shape === 'suv' ? 0.24 : 0.48 : 0.06;
    panel(w - 0.16, 0.09, cabLength - rake * 2, 0, roof - 0.045, cabCenter);
    for (const side of [-1, 1]) {
      block(0.07, 0.1, cabLength - rake * 2 + 0.03, side * (w / 2 - 0.065), roof - 0.045, cabCenter, trim);
      for (const [from, to] of [[cabFront, doorFront], [doorBack, cabBack]])
        block(0.07, 0.07, to - from, side * (w / 2 - 0.055), sill + 0.015, (from + to) / 2, trim);
      for (const z of [doorFront - 0.03, doorBack + 0.03])
        block(0.09, sill + 0.28, 0.07, side * (w / 2 - 0.055), (sill - 0.22) / 2, z, trim);
      block(0.12, 0.055, doorBack - doorFront + 0.1, side * (w / 2 - 0.085), -0.225, (doorFront + doorBack) / 2, metal);
    }
    for (const z of [cabFront, cabBack]) {
      if (p.body === 'camper' && z === cabBack) {
        for (const side of [-1, 1]) block((w - 0.9) / 2, roof - sill, 0.06, side * (w + 0.9) / 4, (roof + sill) / 2, z, trim);
        block(0.9, 0.08, 0.06, 0, roof - 0.04, z, trim); continue;
      }
      const front = z === cabFront, tilt = Math.atan2(rake, roof - sill) * (front ? 1 : -1);
      const center = z + (front ? rake / 2 : -rake / 2);
      for (const [y, along] of [[sill + 0.015, z], [roof - 0.035, z + (front ? rake : -rake)]])
        block(w - 0.12, 0.08, 0.08, 0, y, along, trim);
      const window = block(w - 0.18, Math.hypot(roof - sill, rake) - 0.07, 0.015, 0, (roof + sill) / 2, center, glass); window.rotation.x = tilt;
      if (front) this.windshield = new Windshield(window, w - 0.18, Math.hypot(roof - sill, rake) - 0.07);
      for (const side of [-1, 1]) {
        const pillar = block(0.065, Math.hypot(roof - sill, rake), 0.065, side * (w / 2 - 0.07), (roof + sill) / 2, center);
        pillar.rotation.x = tilt;
      }
    }
    const sideGlass = (front: number, back: number, frontRake: number, backRake: number) => {
      const shape = new Shape(); shape.moveTo(front, 0.04); shape.lineTo(front + frontRake, roof - sill - 0.07);
      shape.lineTo(back - backRake, roof - sill - 0.07); shape.lineTo(back, 0.04); shape.closePath();
      return this.geometry(new ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, steps: 1 }));
    };
    const driverGlass = sideGlass(cabFront, driverBack, rake, driverBack === cabBack ? rake : 0);
    const fixedGlass = driverBack < cabBack ? sideGlass(driverBack, cabBack, 0, rake) : undefined;
    for (const side of [-1, 1]) {
      const door = this.fittings.hinge('doors', this.chassis, side * (w / 2 - 0.03), 0, doorFront, 'y', side * 1.1);
      const belt = passenger ? Math.max(sill + 0.04, p.radius - this.rideHeight + p.radius + 0.12) : sill;
      kit.wheelPanel(0, doorBack - doorFront, -0.22, belt, 0, paint, door, doorFront);
      block(0.025, 0.05, 0.25, side * 0.05, sill - 0.1, doorBack - doorFront - 0.2, metal, door);
      const doorLength = doorBack - doorFront, liningY = (belt - 0.22) / 2, liningHalf = (belt + 0.22) * 0.34;
      block(0.07, 0.07, doorLength, -side * 0.025, sill + 0.015, doorLength / 2, passenger ? trim : metal, door);
      kit.wheelPanel(doorLength * 0.11, doorLength * 0.89, liningY - liningHalf, liningY + liningHalf, -side * 0.044, passenger ? leather : metal, door, doorFront);
      block(0.11, 0.055, doorLength * 0.43, -side * 0.095, belt - 0.12, doorLength * 0.57, passenger ? trim : paint, door);
      block(0.022, 0.045, 0.15, -side * 0.062, belt - 0.08, doorLength * 0.24, metal, door);
      const lift = new Group(); lift.name = 'driver-window'; lift.position.set(-side * 0.03, sill, -doorFront);
      const window = new Mesh(driverGlass, glass); window.rotation.y = -Math.PI / 2; lift.add(window);
      door.add(lift); this.windows.push(lift);
      if (fixedGlass) {
        const fixed = new Mesh(fixedGlass, glass); fixed.rotation.y = -Math.PI / 2;
        fixed.position.set(side * (w / 2 - 0.06), sill, 0); this.chassis.add(fixed);
      }
      for (let z = cabFront + cabLength / 2; z < cabBack - 0.2; z += cabLength)
        block(0.07, roof - sill, 0.075, side * (w / 2 - 0.07), (roof + sill) / 2, z, trim);
      const doorEnd = doorBack + 0.035;
      block(0.012, sill + 0.22, 0.014, side * (w / 2 + 0.003), (sill - 0.22) / 2, doorEnd, trim);
      if (passenger) block(0.016, 0.018, Math.max(0.4, doorEnd - cabFront), side * (w / 2 - 0.002), -0.225, (doorEnd + cabFront) / 2, trim);
      if (!passenger) {
        for (const y of [-0.43, -0.6]) block(0.22, 0.055, 0.3, side * (w / 2 + 0.035), y, cabStepZ(p), metal);
      }
      block(0.18, 0.04, 0.09, side * (w / 2 + 0.04), p.eye.y - 0.28, cabFront + 0.25, trim);
      block(0.13, passenger ? 0.12 : 0.32, 0.13, side * (w / 2 + 0.14), p.eye.y - 0.17, cabFront + 0.25, metal);
      block(w * 0.2, 0.1, 0.04, side * w * 0.3, 0.02, nose - 0.015, lamp);
      block(w * 0.19, 0.11, 0.04, side * w * 0.31, 0.02, length / 2 + 0.02, this.tail);
    }
    block(w * 0.62, 0.14, 0.025, 0, -0.12, nose - 0.022, trim);
    block(w - 0.08, 0.15, 0.35, 0, p.eye.y - 0.43, cabFront + 0.18, trim);
    this.steering.position.set(p.eye.x, p.eye.y - 0.3, -p.eye.along - 0.4);
    this.steering.rotation.x = -0.45; this.chassis.add(this.steering);
    this.steering.add(new Mesh(this.geometry(new TorusGeometry(0.18, 0.018, 6, 24)), trim));
    block(0.31, 0.035, 0.03, 0, 0, 0, metal, this.steering);
    if (p.shape === 'truck' && p.body !== 'dumptruck' && p.body !== 'tanker' && p.body !== 'sprinkler' && p.body !== 'firetruck' && p.body !== 'mixer') {
      this.fittings.cargo(this.chassis, w, cabBack + 0.15, length / 2, sill + 0.035, top, 'box', kit, this.rideHeight, !p.body, p.body === 'camper');
    } else if (p.shape === 'tractor') {
      block(1.6, 0.14, 1.25, 0, 0.08, -p.trailers![0].hitchAlong, metal);
      for (const side of [-1, 1]) block(0.36, 0.36, 1.1, side * 0.92, -0.08, -0.1, metal);
    } else if (p.shape === 'suv') {
      for (const side of [-1, 1]) block(0.055, 0.07, cabLength - 0.25, side * (w / 2 - 0.2), roof + 0.02, cabCenter, metal);
    }
  }

  private syncWheels(meshes: WheelMesh[], states: WheelState[], y: number, pitch: number, roll: number, car: VehiclePhysics): void {
    meshes.forEach(({ pivot, spin, spring, point }, i) => {
      const offset = vehicleOffset(point.x, point.along, pitch, roll);
      pivot.position.set(offset.x, states[i].height - y, offset.z);
      pivot.rotation.y = -car.wheelSteering(point);
      pivot.rotation.z = car.kind === 'motorcycle' ? roll : 0;
      spin.rotation.x = -(states === car.wheels && !point.steer ? car.rearWheelAngle : car.wheelAngle);
      spring.position.set(offset.x * 0.85, pivot.position.y, offset.z);
      spring.scale.y = Math.max(0.08, -pivot.position.y + offset.y);
    });
  }

  private material(color: number, roughness = 0.8, metalness = 0): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, roughness, metalness }); this.materials.push(material); return material;
  }
  private geometry<T extends BufferGeometry>(geometry: T): T { this.geometries.push(geometry); return geometry; }
  dispose(): void {
    this.display.dispose();
    this.operatorDisplay?.dispose();
    this.deviceLights.dispose(); this.deviceLights.material.dispose();
    this.windshield?.dispose();
    this.spray?.dispose();
    this.root.removeFromParent(); this.headlight.dispose(); this.foglight.dispose(); this.cabinLight.dispose(); this.cabinFill.dispose(); this.reverseLight.dispose();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
  }
}
