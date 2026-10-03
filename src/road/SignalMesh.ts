import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, type Scene } from 'three';
import type { Junction } from './RoadNetwork';
import type { TrafficSignals } from '../traffic/TrafficSignals';
import { addRetroreflection } from '../render/ReflectiveMaterial';

export class SignalMesh {
  readonly parts = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 1024);
  readonly pavement = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x3b3d3e, roughness: 0.95 }), 32);
  readonly markings = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0xeaeade, roughness: 0.8 }), 4096);
  readonly bulbs = new InstancedMesh(new SphereGeometry(1, 12, 8), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 384);
  private signature = '';
  private lampState = '';
  private x = 0;
  private z = 0;
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private sites: readonly Junction[] = [];
  constructor(scene: Scene) {
    addRetroreflection(this.markings.material);
    for (const mesh of [this.parts, this.pavement, this.markings, this.bulbs]) { mesh.count = 0; mesh.visible = false; scene.add(mesh); }
    this.parts.castShadow = this.parts.receiveShadow = this.pavement.receiveShadow = true;
  }
  update(signals: TrafficSignals, origin: { x: number; z: number }): void {
    const sites = signals.junctions.slice(0, 32), signature = sites.map(j => `${j.id}:${j.sample.position.x}:${j.sample.position.z}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature; this.lampState = ''; this.sites = sites;
      this.x = sites[0]?.sample.position.x ?? 0; this.z = sites[0]?.sample.position.z ?? 0;
      for (const mesh of [this.parts, this.pavement, this.markings, this.bulbs]) mesh.count = 0;
      const half = signals.halfWidth;
      for (const site of sites) {
        this.box(this.pavement, site, 0, 0, 0, 0.025, half * 2 + 0.1, 0.025, half * 2 + 0.1);
        for (let arm = 0; arm < 4; arm++) {
          const along = -signals.stopOffset + 1, side = half + 1.1;
          this.box(this.parts, site, arm, side, along, 0.16, 0.6, 0.32, 0.6, 0xb2b4af);
          this.box(this.parts, site, arm, side, along, 2.4, 0.16, 4.8, 0.16, 0x899398);
          this.box(this.parts, site, arm, side - 0.8, along, 4.8, 1.8, 0.14, 0.16, 0x899398);
          const head = side - 1.5;
          this.box(this.parts, site, arm, head, along, 4.1, 0.7, 1.65, 0.28, 0x152023);
          this.box(this.parts, site, arm, head, along + 0.16, 4.1, 0.58, 1.5, 0.2, 0x232e31);
          for (let lamp = 0; lamp < 3; lamp++) {
            const height = 4.62 - lamp * 0.5;
            this.box(this.bulbs, site, arm, head, along - 0.16, height, 0.2, 0.2, 0.07);
            this.box(this.parts, site, arm, head, along - 0.18, height + 0.25, 0.48, 0.07, 0.5, 0x152023);
          }
          this.box(this.markings, site, arm, half / 2, -signals.stopOffset, 0.04, half - 0.3, 0.025, 0.45);
          for (let stripe = -half + 0.55; stripe < half; stripe += 1.1)
            this.box(this.markings, site, arm, stripe, -half - 2.5, 0.04, 0.55, 0.025, 2.4);
          for (const distance of [24, 48]) {
            this.box(this.markings, site, arm, half / 2, -distance, 0.04, 0.16, 0.025, 3.5);
            for (const turn of [-1, 1]) this.box(this.markings, site, arm, half / 2 + turn * 0.35, -distance + 1.25, 0.04, 0.16, 0.025, 1.05, 0xffffff, -turn * 0.75);
          }
        }
      }
      for (const mesh of [this.parts, this.pavement, this.markings, this.bulbs]) {
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
    }
    const states = this.sites.flatMap(j => [signals.phase(j, 0).color, signals.phase(j, 1).color]), state = states.join('|');
    if (state !== this.lampState) {
      this.lampState = state;
      for (let site = 0; site < this.sites.length; site++) for (let arm = 0; arm < 4; arm++) for (let lamp = 0; lamp < 3; lamp++) {
        const lit = states[site * 2 + arm % 2] === ['red', 'yellow', 'green'][lamp];
        this.bulbs.setColorAt(site * 12 + arm * 3 + lamp, this.color.setHex(lit ? [0xff3525, 0xffbd24, 0x24ff85][lamp] : [0x31110c, 0x30240d, 0x0b2b1a][lamp]));
      }
      if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    }
    for (const mesh of [this.parts, this.pavement, this.markings, this.bulbs]) { mesh.position.set(this.x - origin.x, 0, this.z - origin.z); mesh.visible = mesh.count > 0; }
  }
  private box(mesh: InstancedMesh, site: Junction, arm: number, side: number, along: number, y: number, width: number, height: number, length: number, color = 0xffffff, turn = 0): void {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    const h = site.sample.heading + arm * Math.PI / 2, p = site.sample.position, c = Math.cos(h), s = Math.sin(h);
    const angle = h + turn, ca = Math.cos(angle), sa = Math.sin(angle);
    this.matrix.set(ca * width, 0, -sa * length, p.x - this.x + c * side + s * along,
      0, height, 0, p.y + y, sa * width, 0, ca * length, p.z - this.z + s * side - c * along, 0, 0, 0, 1);
    mesh.setMatrixAt(mesh.count, this.matrix); if (mesh !== this.pavement) mesh.setColorAt(mesh.count, this.color.setHex(color)); mesh.count++;
  }
  dispose(): void {
    for (const mesh of [this.parts, this.pavement, this.markings, this.bulbs]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
}
