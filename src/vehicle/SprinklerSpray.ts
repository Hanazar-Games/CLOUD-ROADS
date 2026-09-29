import { BufferAttribute, BufferGeometry, Points, PointsMaterial, type Group } from 'three';

export class SprinklerSpray {
  readonly mesh: Points<BufferGeometry, PointsMaterial>;
  private phase = 0;
  constructor(parent: Group, private readonly rear: number, private readonly rideHeight: number) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(192 * 3), 3));
    this.mesh = new Points(geometry, new PointsMaterial({ color: 0xc7e6ed, size: 0.055, transparent: true, opacity: 0.6, depthWrite: false }));
    this.mesh.material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.a *= 1.0 - smoothstep(0.12, 0.5, length(gl_PointCoord - 0.5));
      `);
    };
    this.mesh.name = 'sprinkler-spray'; this.mesh.visible = false; parent.add(this.mesh);
  }
  update(dt: number, active: boolean): void {
    this.mesh.visible = active;
    if (!active) return;
    this.phase = (this.phase + (Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0)) % 10;
    const positions = this.mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const t = (i / positions.count + this.phase * 1.8) % 1, side = i % 2 ? 1 : -1;
      positions.setXYZ(i, side * (0.85 + t * (0.7 + (i % 11) * 0.16)),
        Math.max(-this.rideHeight + 0.04, -0.35 - t * t * this.rideHeight), this.rear - 0.1 + t * (0.4 + (i % 7) * 0.14));
    }
    positions.needsUpdate = true; this.mesh.geometry.computeBoundingSphere();
  }
  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
