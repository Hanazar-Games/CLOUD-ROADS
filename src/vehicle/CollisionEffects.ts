import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from 'three';
import type { CollisionEvent } from './VehicleContact';

type Position = { x: number; y: number; z: number };
interface Particle extends Position { vx: number; vy: number; vz: number; life: number; duration: number; size: number; floor: number; spark: boolean }

export class CollisionEffects {
  readonly mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ toneMapped: false }), 96);
  soundImpact = 0;
  private readonly seen = new WeakSet<CollisionEvent>();
  private readonly particles: Particle[] = [];
  private readonly transform = new Object3D();
  private readonly spark = new Color(0xffcb72);
  private readonly debris = new Color(0x747f85);
  private cursor = 0;

  constructor(scene: Scene) {
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(this.mesh);
  }

  update(dt: number, cars: readonly { collision?: CollisionEvent }[], listener: Position, origin: { x: number; z: number }, gravity: number): void {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    if (dt > 0) {
      this.soundImpact *= Math.exp(-dt * 15);
      for (const p of this.particles) {
        if (p.life <= 0) continue;
        p.life -= dt; p.vy -= gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) { p.y = p.floor; p.vy = Math.abs(p.vy) * 0.2; p.vx *= 0.7; p.vz *= 0.7; }
      }
      for (const { collision } of cars) {
        if (!collision || this.seen.has(collision)) continue;
        this.seen.add(collision);
        const distance = Math.hypot(collision.x - listener.x, collision.y - listener.y, collision.z - listener.z);
        if (distance > 140) continue;
        this.soundImpact = Math.max(this.soundImpact, collision.strength * (1 - distance / 140) / (1 + (distance / 25) ** 2));
        const count = Math.min(22, Math.max(4, Math.ceil(collision.strength)));
        for (let i = 0; i < count; i++) {
          const angle = i * 2.399963 + collision.x, speed = Math.min(9, collision.strength * 0.3) * (0.4 + (i % 4) * 0.2);
          const duration = 0.4 + (i % 7) * 0.12;
          const p = this.particles[this.cursor] ?? {} as Particle;
          Object.assign(p, { x: collision.x, y: collision.y, z: collision.z, vx: Math.cos(angle) * speed,
            vy: 1 + (i % 5) * 0.6, vz: Math.sin(angle) * speed, life: duration, duration,
            size: i % 3 ? 0.035 : 0.085, floor: collision.y - 0.8, spark: i % 3 !== 0 });
          this.particles[this.cursor] = p; this.cursor = (this.cursor + 1) % 96;
        }
      }
    }
    let count = 0;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      this.transform.position.set(p.x - origin.x, p.y, p.z - origin.z);
      const size = p.size * Math.min(1, p.life / p.duration * 3);
      this.transform.scale.set(size, size, p.spark ? size * 3 : size);
      this.transform.rotation.set(p.life * 4, p.life * 7, p.life * 3); this.transform.updateMatrix();
      this.mesh.setMatrixAt(count, this.transform.matrix); this.mesh.setColorAt(count++, p.spark ? this.spark : this.debris);
    }
    this.mesh.count = count; this.mesh.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.particles.length = 0; }
}
