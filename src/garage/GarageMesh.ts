import { BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Garage, GARAGE_SEGMENTS, GARAGE_STOREY, GARAGE_RAMPS, garageColumns, garageSlots } from './Garage';
import { garageAtlas, garageColors } from './GarageAtlas';

const color = new Color();
function tint(geometry: BufferGeometry, hex: number): BufferGeometry {
  color.setHex(hex); const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); return geometry;
}
function box(parts: BufferGeometry[], x: number, y: number, z: number, w: number, h: number, l: number, hex: number, angle = 0): void {
  parts.push(tint(new BoxGeometry(w, h, l).rotateY(angle).translate(x, y, z), hex));
}
function tag(parts: BufferGeometry[], x: number, y: number, z: number, w: number, h: number, rect: number[], flat = false, angle = 0): void {
  const geometry = new PlaneGeometry(w, h), uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (rect[0] + uv.getX(i) * rect[2]) / 2048, 1 - (rect[1] + (1 - uv.getY(i)) * rect[3]) / 1024);
  if (flat) geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(angle).translate(x, y, z); parts.push(geometry);
}
function batch(group: Group, parts: BufferGeometry[], material: MeshStandardMaterial | MeshBasicMaterial, name: string): void {
  if (!parts.length) return;
  const mesh = new Mesh(mergeGeometries(parts)!, material); mesh.name = name;
  group.add(mesh); parts.forEach(g => g.dispose());
}
function clear(group: Group): void {
  group.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); }); group.clear();
}

export class GarageMesh {
  readonly root = new Group();
  private readonly levels: Group[] = [];
  private readonly lighting = new HemisphereLight(0xdcecff, 0x929fa8, 1.7);
  private readonly lamps = Array.from({ length: 4 }, () => new PointLight(0xdcefff, 110, 32, 1.4));
  private readonly fixtures: { x: number; y: number; z: number }[] = [];
  private readonly concrete = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, emissive: 0xb5c3ca, emissiveIntensity: 0.08 });
  private readonly ink = new MeshBasicMaterial({ vertexColors: true });
  private readonly glow = new MeshBasicMaterial({ color: 0xd6edff });
  private readonly atlas;
  private readonly signs;

  constructor(scene: Scene, readonly garage: Garage) {
    this.root.name = 'underground-garage';
    this.atlas = garageAtlas(garage.levels);
    this.signs = new MeshBasicMaterial({ map: this.atlas, transparent: true, side: DoubleSide, depthWrite: false });
    const structure: BufferGeometry[] = [];
    for (const { a, b, top, width } of garage.walls) {
      const p = garage.local(a.x, a.z), q = garage.local(b.x, b.z);
      box(structure, (p.x + q.x) / 2, (a.y + top) / 2 - garage.position.y, (p.z + q.z) / 2,
        width, top - a.y, Math.hypot(q.x - p.x, q.z - p.z), 0x929fa3, Math.atan2(q.x - p.x, q.z - p.z));
    }
    // Keep the compact structural shell resident so streamed floors never expose sky or terrain.
    for (let floor = 0; floor <= garage.levels; floor++) {
      const y = -floor * GARAGE_STOREY, shade = floor ? 0x626f76 : 0x8c989a;
      box(structure, 0, y - 0.2, 0, 104, 0.4, 160, shade);
      for (const z of [-60, 60]) box(structure, 76, y - 0.2, z, 48, 0.4, 40, shade);
      if (floor === 0) box(structure, 88, -0.2, 0, 24, 0.4, 80, shade);
      if (floor < garage.levels) {
        for (let i = 8; i < GARAGE_SEGMENTS; i += 16) for (const side of [-1, 1]) {
          const p = garage.rampPoint(floor, i / GARAGE_SEGMENTS, side * 11.5), local = garage.local(p.x, p.z);
          this.fixtures.push({ ...local, y: p.y - garage.position.y + 1.5 });
        }
        const positions: number[] = [];
        const vertex = (t: number, offset: number, down = 0) => {
          const p = garage.rampPoint(floor, t, offset), local = garage.local(p.x, p.z);
          return [local.x, p.y - garage.position.y - down, local.z];
        };
        for (let i = 0; i < GARAGE_SEGMENTS; i++) {
          const a = vertex(i / GARAGE_SEGMENTS, -12), b = vertex(i / GARAGE_SEGMENTS, 12);
          const c = vertex((i + 1) / GARAGE_SEGMENTS, -12), d = vertex((i + 1) / GARAGE_SEGMENTS, 12);
          const aa = vertex(i / GARAGE_SEGMENTS, -12, 0.4), bb = vertex(i / GARAGE_SEGMENTS, 12, 0.4);
          const cc = vertex((i + 1) / GARAGE_SEGMENTS, -12, 0.4), dd = vertex((i + 1) / GARAGE_SEGMENTS, 12, 0.4);
          if (floor % 2) positions.push(...a, ...b, ...c, ...b, ...d, ...c, ...aa, ...cc, ...bb, ...bb, ...cc, ...dd);
          else positions.push(...a, ...c, ...b, ...b, ...c, ...d, ...aa, ...bb, ...cc, ...bb, ...dd, ...cc);
        }
        const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
        geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
        geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
        structure.push(tint(geometry, 0x65747b));
      }
      const group = new Group(); group.name = floor ? `garage-B${floor}` : 'garage-surface'; group.visible = false;
      this.levels.push(group); this.root.add(group);
      if (floor) for (const x of [-40, -20, 0, 20, 40, 64, 88]) for (const z of [-60, -23, 23, 60]) {
        if (x > 52 && Math.abs(z) < 40) continue;
        this.fixtures.push({ x, y: y + 5.2, z });
      }
    }
    batch(this.root, structure, this.concrete, 'garage-concrete');
    this.fixtures.push({ x: 64, y: 6.1, z: -72 });
    for (const lamp of this.lamps) { lamp.visible = false; this.root.add(lamp); }
    scene.add(this.root, this.lighting); this.lighting.visible = false;
  }

  private build(floor: number, group: Group): void {
    const solid: BufferGeometry[] = [], marks: BufferGeometry[] = [], labels: BufferGeometry[] = [], lights: BufferGeometry[] = [];
    const y = -floor * GARAGE_STOREY, accent = garageColors[Math.max(0, floor - 1)];
    const arrow = (x: number, z: number, angle: number) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute([-0.25, 0, 2, 0.25, 0, 2, -0.25, 0, -0.4, 0.25, 0, 2, 0.25, 0, -0.4, -0.25, 0, -0.4, -1.1, 0, -0.4, 1.1, 0, -0.4, 0, 0, -2], 3));
      geometry.computeVertexNormals(); geometry.setIndex([0,1,2,3,4,5,6,7,8]); geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(18), 2));
      marks.push(tint(geometry.rotateY(angle).translate(x, y + 0.035, z), 0xf2eddb));
    };
    if (!floor) {
      for (const x of [52, 76]) box(solid, x, 3.4, -76, 1, 6.8, 1, 0x354851);
      box(solid, 64, 6.5, -70, 26, 0.5, 20, 0x394e59);
      tag(labels, 64, 5.9, -79.7, 20, 2.5, [0, 0, 1024, 128], false, Math.PI);
      box(lights, 64, 6.2, -72, 22, 0.08, 0.4, 0xffffff);
      arrow(59, -65, Math.PI); arrow(69, -65, 0);
    } else {
      for (const [i, slot] of garageSlots.entries()) {
        for (const side of [-1, 1]) box(marks, slot.x + side * slot.width / 2, y + 0.016, slot.z, 0.11, 0.028, slot.length, 0xe9e9d9);
        box(marks, slot.x, y + 0.016, slot.z + slot.length / 2, slot.width, 0.028, 0.11, 0xe9e9d9);
        box(solid, slot.x, y + 0.1, slot.z + slot.length / 2 - 0.8, slot.width * 0.7, 0.2, 0.22, 0xe0b95b);
        tag(labels, slot.x, y + 0.04, slot.z - slot.length / 2 + 0.8, 1.2, 1.2, [1024 + i % 8 * 128, Math.floor(i / 8) * 128, 128, 128], true);
      }
      for (const column of garageColumns) {
        box(solid, column.x, y + 2.8, column.z, 1.2, 5.6, 1.2, 0xbac3c3);
        box(marks, column.x, y + 1.1, column.z, 1.22, 1.4, 1.22, accent);
        for (let stripe = 0; stripe < 3; stripe++) box(marks, column.x, y + 0.2 + stripe * 0.18, column.z, 1.24, 0.08, 1.24, 0x303b41);
      }
      for (const z of [-23, 23]) {
        for (const x of [-18, 0, 18]) arrow(x, z, z < 0 ? -Math.PI / 2 : Math.PI / 2);
        box(solid, 0, y + 5.25, z + 2, 96, 0.15, 0.15, 0xa6544a);
        box(solid, 0, y + 5.4, z - 2, 96, 0.26, 0.8, 0x77868d);
      }
      for (const p of this.fixtures.filter(p => Math.abs(p.y - y - 5.2) < 0.01)) {
        box(solid, p.x, p.y + 0.15, p.z, 7, 0.15, 0.8, 0x364951);
        box(lights, p.x, p.y, p.z, 6.6, 0.05, 0.55, 0xffffff);
      }
      for (const z of [-79.5, 79.5]) {
        box(marks, 0, y + 1.4, z, 100, 0.45, 0.08, accent);
        tag(labels, 0, y + 3.4, z, 22, 2.75, [0, floor * 128, 1024, 128], false, z > 0 ? Math.PI : 0);
      }
      const z = floor % 2 ? 60 : -60;
      box(solid, 51.65, y + 3, 0, 0.2, 2.6, 20, 0x304853);
      tag(labels, 51.5, y + 3, 0, 19, 2.4, [0, floor * 128, 1024, 128], false, -Math.PI / 2);
      arrow(45, z, -Math.PI / 2); arrow(76, z, floor % 2 ? 0 : Math.PI);
      tag(labels, 50, y + 4.4, z, 12, 1.5, [0, 768, 1024, 128], false, Math.PI / 2);
      box(marks, -43, y + 0.025, 0, 2.5, 0.03, 138, accent);
    }
    if (floor < this.garage.levels) for (let i = 1; i < GARAGE_SEGMENTS; i++) {
      const p = this.garage.rampPoint(floor, i / GARAGE_SEGMENTS), local = this.garage.local(p.x, p.z), ry = p.y - this.garage.position.y;
      if (i % 4 === 0) box(marks, local.x, ry + 0.08, local.z, 0.16, 0.025, 1.4, 0xe6c571);
      if (i % 3 === 0) for (const side of [-1, 1]) {
        box(marks, GARAGE_RAMPS[floor % 2] + side * 11.4, ry + 0.25, local.z, 0.25, 0.45, 0.65, i % 2 ? 0xf1be59 : 0x35414a);
        box(lights, GARAGE_RAMPS[floor % 2] + side * 11.6, ry + 1.5, local.z, 0.08, 0.12, 1.8, 0xffffff);
      }
    }
    batch(group, solid, this.concrete, 'garage-details'); batch(group, marks, this.ink, 'garage-markings');
    batch(group, lights, this.glow, 'garage-luminaires'); batch(group, labels, this.signs, 'garage-wayfinding');
  }

  get loadedFloors(): number { return this.levels.filter(group => group.children.length > 0).length; }

  update(origin: { x: number; z: number }, camera: { x: number; y: number; z: number }): void {
    const p = this.garage.position, x = camera.x + origin.x, z = camera.z + origin.z;
    this.root.position.set(p.x - origin.x, p.y, p.z - origin.z); this.root.rotation.y = -this.garage.heading;
    this.root.visible = Math.hypot(p.x - x, p.z - z) < 1800;
    const floor = this.garage.floor(x, camera.y, z);
    for (const [i, group] of this.levels.entries()) {
      group.visible = this.root.visible && this.garage.visibleFloor(i, floor);
      if (group.visible && !group.children.length) this.build(i, group);
      else if (!group.visible && group.children.length) clear(group);
    }
    this.lighting.visible = this.root.visible && this.garage.shelter(x, camera.y, z) > 0;
    this.lighting.intensity = 1.7 * this.garage.light;
    this.glow.color.setRGB(0.84 * this.garage.light, 0.93 * this.garage.light, this.garage.light);
    const local = this.garage.local(x, z), y = camera.y - p.y;
    const near = this.root.visible && floor !== undefined ? this.fixtures.filter(p => p.y - y > -1 && p.y - y < 6 && Math.hypot(p.x - local.x, p.z - local.z) < 32)
      .sort((a, b) => Math.hypot(a.x - local.x, a.z - local.z) - Math.hypot(b.x - local.x, b.z - local.z)) : [];
    for (const [i, lamp] of this.lamps.entries()) {
      const point = near[i]; lamp.visible = !!point; lamp.intensity = 110 * this.garage.light;
      if (point) lamp.position.set(point.x, point.y - 0.12, point.z);
    }
  }

  dispose(): void {
    clear(this.root); this.root.removeFromParent(); this.lighting.removeFromParent();
    this.concrete.dispose(); this.ink.dispose(); this.glow.dispose(); this.signs.dispose(); this.atlas.dispose();
  }
}
