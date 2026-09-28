import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RingGeometry, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Garage, GARAGE_APRON, GARAGE_GATE, GARAGE_LEVELS, GARAGE_OUTER, GARAGE_RADIUS, GARAGE_SEGMENTS, GARAGE_STOREY, garageColumns, garageSlots } from './Garage';
import { garageAtlas, garageColors } from './GarageAtlas';

const TAU = Math.PI * 2;

export class GarageMesh {
  readonly root = new Group();
  private readonly levels: Group[] = [];
  private readonly lighting = new HemisphereLight(0xdcecff, 0x9da8ad, 2.2);
  private readonly concrete = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  private readonly ink = new MeshBasicMaterial({ vertexColors: true });
  private readonly atlas;
  private readonly signs;

  constructor(scene: Scene, readonly garage: Garage) {
    this.root.name = 'underground-garage';
    this.atlas = garageAtlas();
    this.signs = new MeshBasicMaterial({ map: this.atlas, transparent: true, side: DoubleSide, depthWrite: false });
    const color = new Color();
    const tint = (geometry: BufferGeometry, hex: number) => {
      color.setHex(hex); const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); return geometry;
    };
    const box = (parts: BufferGeometry[], x: number, y: number, z: number, w: number, h: number, l: number, hex: number, angle = 0) => {
      parts.push(tint(new BoxGeometry(w, h, l).rotateY(angle).translate(x, y, z), hex));
    };
    const tag = (parts: BufferGeometry[], x: number, y: number, z: number, w: number, h: number, rect: number[], flat = false, angle = 0) => {
      const geometry = new PlaneGeometry(w, h), uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (rect[0] + uv.getX(i) * rect[2]) / 2048, 1 - (rect[1] + (1 - uv.getY(i)) * rect[3]) / 1024);
      if (flat) geometry.rotateX(-Math.PI / 2);
      geometry.rotateY(angle).translate(x, y, z); parts.push(geometry);
    };
    const batch = (group: Group, parts: BufferGeometry[], material: MeshStandardMaterial | MeshBasicMaterial, name: string) => {
      if (!parts.length) return;
      const mesh = new Mesh(mergeGeometries(parts)!, material); mesh.name = name; mesh.receiveShadow = false;
      group.add(mesh); parts.forEach(g => g.dispose());
    };
    const walls: BufferGeometry[] = [];
    for (const wall of garage.walls) {
      const { a, b, top, width } = wall;
      box(walls, (a.x + b.x) / 2 - garage.position.x, (a.y + top) / 2 - garage.position.y, (a.z + b.z) / 2 - garage.position.z,
        width, top - a.y, Math.hypot(b.x - a.x, b.z - a.z) + 0.04, 0x8e989b, Math.atan2(b.x - a.x, b.z - a.z));
    }
    batch(this.root, walls, this.concrete, 'garage-retaining-walls');
    for (let floor = 0; floor <= GARAGE_LEVELS; floor++) {
      const group = new Group(); group.name = floor ? `garage-B${floor}` : 'garage-surface';
      this.levels.push(group); this.root.add(group);
      const solid: BufferGeometry[] = [], marks: BufferGeometry[] = [], labels: BufferGeometry[] = [], y = -floor * GARAGE_STOREY;
      const accent = garageColors[Math.max(0, floor - 1)];
      solid.push(tint(new CylinderGeometry(GARAGE_RADIUS, GARAGE_RADIUS, 0.4, GARAGE_SEGMENTS).translate(0, y - 0.2, 0), floor ? 0x586369 : 0x939c9a));
      if (floor === 0) {
        solid.push(tint(new RingGeometry(GARAGE_OUTER, GARAGE_APRON, GARAGE_SEGMENTS).rotateX(-Math.PI / 2).translate(0, y, 0), 0x858f92));
        box(solid, -78, 3.6, -16, 1, 7.2, 1, 0x43545c); box(solid, -78, 3.6, 16, 1, 7.2, 1, 0x43545c);
        tag(labels, -78, 7.2, 0, 28, 2.5, [0, 0, 1024, 128], false, -Math.PI / 2);
        tag(labels, -74, 0.035, 0, 15, 1.9, [0, 768, 1024, 128], true, Math.PI / 2);
        box(solid, 24, 1.5, 16, 9, 3, 6, 0x6f8188); box(solid, 24, 3.1, 16, 10, 0.25, 7, 0x354b57);
      } else {
        for (const [i, slot] of garageSlots.entries()) {
          for (const side of [-1, 1]) box(marks, slot.x + side * slot.width / 2, y + 0.016, slot.z, 0.11, 0.028, slot.length, 0xe9e9d9);
          box(marks, slot.x, y + 0.016, slot.z + slot.length / 2, slot.width, 0.028, 0.11, 0xe9e9d9);
          box(solid, slot.x, y + 0.1, slot.z + slot.length / 2 - 0.8, slot.width * 0.7, 0.2, 0.22, 0xe0b95b);
          tag(labels, slot.x, y + 0.04, slot.z - slot.length / 2 + 0.8, 1.2, 1.2, [1024 + i % 8 * 128, Math.floor(i / 8) * 128, 128, 128], true);
        }
        for (const column of garageColumns) {
          box(solid, column.x, y + 3, column.z, 1.2, 6, 1.2, 0xabb2ae);
          box(marks, column.x, y + 1.1, column.z, 1.22, 1.4, 1.22, accent);
          for (let stripe = 0; stripe < 3; stripe++) box(marks, column.x, y + 0.2 + stripe * 0.18, column.z, 1.24, 0.08, 1.24, 0x303b41);
        }
        for (const z of [-23, 23]) {
          for (const x of [-18, 0, 18]) {
            box(marks, x, y + 0.028, z, 2.4, 0.035, 0.16, 0xe8e9db);
            box(marks, x + 0.9, y + 0.028, z - 0.4, 1.2, 0.035, 0.16, 0xe8e9db, Math.PI / 4);
            box(marks, x + 0.9, y + 0.028, z + 0.4, 1.2, 0.035, 0.16, 0xe8e9db, -Math.PI / 4);
          }
          for (const x of [-28, -14, 0, 14, 28]) {
            box(solid, x, y + 5.47, z, 5.2, 0.16, 0.48, 0x34434b);
            box(marks, x, y + 5.37, z, 4.8, 0.04, 0.32, 0xddebf0);
          }
          box(solid, 0, y + 5.1, z + 2, 72, 0.15, 0.15, 0xa6544a);
          box(solid, 0, y + 5.4, z - 2, 72, 0.26, 0.8, 0x77868d);
        }
        tag(labels, -37, y + 4.3, -21, 12, 1.5, [0, floor * 128, 1024, 128]);
        tag(labels, 0, y + 3, -46, 22, 2.75, [0, floor * 128, 1024, 128]);
        tag(labels, 0, y + 3, 46, 22, 2.75, [0, floor * 128, 1024, 128], false, Math.PI);
        tag(labels, -44, y + 4.8, 0, 12, 1.5, [0, 768, 1024, 128], false, Math.PI / 2);
        box(marks, -39, y + 0.025, 0, 2.5, 0.03, 28, accent);
      }
      if (floor < GARAGE_LEVELS) {
        const positions: number[] = [];
        const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c);
        for (let i = 0; i < GARAGE_SEGMENTS; i++) {
          const t = i / GARAGE_SEGMENTS * TAU, next = (i + 1) / GARAGE_SEGMENTS * TAU;
          const vertex = (angle: number, radius: number, offset = 0) => {
            const p = garage.rampPoint(floor, angle, radius); return [p.x - garage.position.x, p.y - garage.position.y + offset, p.z - garage.position.z];
          };
          const a = vertex(t, GARAGE_RADIUS), b = vertex(t, GARAGE_OUTER), c = vertex(next, GARAGE_RADIUS), d = vertex(next, GARAGE_OUTER);
          triangle(a, b, c); triangle(b, d, c);
          const aa = vertex(t, GARAGE_RADIUS, -0.4), bb = vertex(t, GARAGE_OUTER, -0.4), cc = vertex(next, GARAGE_RADIUS, -0.4), dd = vertex(next, GARAGE_OUTER, -0.4);
          triangle(aa, cc, bb); triangle(bb, cc, dd);
          if (i % 2 === 0) {
            const p = vertex(t + TAU / GARAGE_SEGMENTS / 2, 61, 0.025);
            box(marks, p[0], p[1], p[2], 0.13, 0.025, 1.7, 0xe6c571, t);
          }
        }
        const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
        const indexed = geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
        indexed.setAttribute('uv', new Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
        solid.push(tint(indexed, 0x606b6f));
      }
      // Level landings fill the short flat sectors beyond the first and last turn.
      if (floor === 0 || floor === GARAGE_LEVELS) {
        const start = floor === 0 ? TAU - GARAGE_GATE : 0;
        const ring = new RingGeometry(GARAGE_RADIUS, GARAGE_OUTER, 8, 1, start, GARAGE_GATE);
        ring.rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, y, 0);
        solid.push(tint(ring, 0x606b6f));
      }
      batch(group, solid, this.concrete, 'garage-concrete'); batch(group, marks, this.ink, 'garage-markings-lights'); batch(group, labels, this.signs, 'garage-wayfinding');
    }
    scene.add(this.root, this.lighting); this.lighting.visible = false;
  }

  update(origin: { x: number; z: number }, camera: { x: number; y: number; z: number }): void {
    const p = this.garage.position, x = camera.x + origin.x, z = camera.z + origin.z;
    this.root.position.set(p.x - origin.x, p.y, p.z - origin.z);
    this.root.visible = Math.hypot(p.x - x, p.z - z) < 1800;
    const floor = this.garage.floor(x, camera.y, z);
    for (const [i, group] of this.levels.entries()) group.visible = floor === undefined || floor === 0 ? i < 2 : Math.abs(i - floor) <= 1;
    this.lighting.visible = this.garage.shelter(x, camera.y, z) > 0;
  }

  dispose(): void {
    this.root.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
    this.root.removeFromParent(); this.lighting.removeFromParent(); this.concrete.dispose(); this.ink.dispose(); this.signs.dispose(); this.atlas.dispose();
  }
}
