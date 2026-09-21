import { AdditiveBlending, BufferAttribute, BufferGeometry, DataTexture, InstancedMesh, LinearFilter, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial } from 'three';

export class LampGlow {
  private readonly texture: DataTexture;
  readonly halos: Points<BufferGeometry, PointsMaterial>;
  readonly pools: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;

  constructor() {
    const data = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4, r = Math.hypot((x - 15.5) / 16, (y - 15.5) / 16);
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 255);
    }
    this.texture = new DataTexture(data, 32, 32);
    this.texture.magFilter = this.texture.minFilter = LinearFilter; this.texture.needsUpdate = true;
    const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(2048 * 3), 3));
    geometry.setDrawRange(0, 0);
    this.halos = new Points(geometry, new PointsMaterial({ map: this.texture, color: 0xffd59b, size: 6, sizeAttenuation: false,
      transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0, fog: true }));
    this.pools = new InstancedMesh(new PlaneGeometry().rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: this.texture,
      color: 0xffcb82, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0, fog: true }), 2048);
    this.pools.count = 0;
  }

  dispose(): void {
    for (const mesh of [this.halos, this.pools]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.pools.dispose(); this.texture.dispose();
  }
}
