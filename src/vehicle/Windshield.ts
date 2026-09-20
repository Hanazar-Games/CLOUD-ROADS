import { BoxGeometry, CircleGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, ShaderMaterial } from 'three';
import type { VehicleSystems } from './VehicleSystems';

export class Windshield {
  readonly root = new Group();
  private readonly rubber = new MeshStandardMaterial({ color: 0x172022, roughness: 0.85 });
  private readonly water = new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide,
    vertexShader: `varying vec2 beadUv;
      void main() { beadUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 beadUv;
      void main() {
        float r = length(beadUv), edge = smoothstep(0.62, 0.87, r) * (1.0 - smoothstep(0.87, 1.0, r));
        float highlight = exp(-length((beadUv - vec2(-0.28, 0.4)) * vec2(1.0, 1.6)) * 10.0);
        float rim = edge * (0.5 + beadUv.y * 0.35);
        vec3 color = mix(vec3(0.06, 0.12, 0.15), vec3(0.72, 0.87, 0.93), rim + highlight);
        gl_FragColor = vec4(color, (0.045 + edge * 0.16 + highlight * 0.6) * (1.0 - smoothstep(0.92, 1.0, r)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private readonly box = new BoxGeometry();
  private readonly circle = new CircleGeometry(1, 16);
  private readonly drops = new InstancedMesh(this.circle, this.water, 120);
  private readonly blades: Group[] = [];
  private readonly beads: { x: number; y: number; size: number; wet: number }[] = [];
  private readonly matrix = new Matrix4();
  private readonly radius: number;
  private previous = 0.08;

  constructor(window: Mesh, width: number, height: number) {
    this.root.position.copy(window.position); this.root.quaternion.copy(window.quaternion);
    window.parent!.add(this.root);
    this.radius = Math.min(height * 0.93, width * 0.44);
    for (const x of [-0.46, 0.04]) {
      const pivot = new Group(); pivot.position.set(x * width, -height * 0.44, -0.03); this.root.add(pivot);
      const arm = new Mesh(this.box, this.rubber); arm.scale.set(this.radius * 0.6, 0.013, 0.015);
      arm.position.x = this.radius * 0.3;
      const blade = new Mesh(this.box, this.rubber); blade.scale.set(this.radius * 0.58, 0.024, 0.018);
      blade.position.set(this.radius * 0.71, 0, -0.009); pivot.add(arm, blade); this.blades.push(pivot);
      pivot.rotation.z = this.previous;
    }
    this.drops.instanceMatrix.setUsage(DynamicDrawUsage); this.drops.frustumCulled = false;
    this.root.add(this.drops); this.drops.visible = false;
    for (let i = 0; i < this.drops.count; i++) this.beads.push({
      x: (Math.sin(i * 127.1 + 9) * 43758.5453 % 1) * width * 0.48,
      y: (Math.sin(i * 311.7 + 17) * 19731.912 % 1) * height * 0.48,
      size: 0.003 + (i % 7) * 0.001, wet: 0,
    });
  }

  update(dt: number, systems: VehicleSystems, speed: number): void {
    const angle = 0.08 + systems.sweep * 1.56;
    for (const blade of this.blades) blade.rotation.z = angle;
    const elapsed = Math.max(0, Math.min(0.1, dt));
    if (!elapsed) return;
    const min = Math.min(this.previous, angle) - 0.045, max = Math.max(this.previous, angle) + 0.045;
    let wet = false;
    for (const [i, bead] of this.beads.entries()) {
      bead.wet = Math.max(0, Math.min(1, bead.wet + elapsed * (systems.rain * (0.4 + (i % 5) * 0.13) - 0.025 - Math.abs(speed) * 0.0008)));
      if (angle !== this.previous) for (const pivot of this.blades) {
        const x = bead.x - pivot.position.x, y = bead.y - pivot.position.y, polar = Math.atan2(y, x), r = Math.hypot(x, y);
        if (polar >= min && polar <= max && r < this.radius && r > this.radius * 0.42) bead.wet = 0;
      }
      const scale = bead.size * bead.wet;
      this.matrix.makeScale(scale, scale * (1.3 + systems.rain * 0.5), 1).setPosition(bead.x, bead.y, -0.02);
      this.drops.setMatrixAt(i, this.matrix); wet ||= bead.wet > 0.05;
    }
    this.previous = angle; this.drops.visible = wet; this.drops.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent(); this.drops.dispose(); this.circle.dispose(); this.box.dispose(); this.water.dispose(); this.rubber.dispose();
  }
}
