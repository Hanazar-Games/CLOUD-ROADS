import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { World } from '../world/World';
import { runtimeLog } from '../debug/RuntimeLog';
import type { FlightHorizonData } from './FlightHorizonData';
import type { HorizonRequest } from './FlightHorizonWorker';

export class FlightHorizon {
  private readonly worker = new Worker(new URL('./FlightHorizonWorker.ts', import.meta.url), { type: 'module' });
  private readonly mesh = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  private pending = false;
  private failed = false;
  private key = '';
  private center = { x: 0, z: 0 };
  private target?: { x: number; z: number; far: number };
  private serial = 0;
  private coverage = 0;
  private rendered = false;
  private timeout?: ReturnType<typeof setTimeout>;
  error = '';

  constructor(scene: Scene, private readonly world: World) {
    this.mesh.name = 'cloud-roads-flight-horizon'; scene.add(this.mesh);
    this.worker.onmessage = ({ data }: MessageEvent<HorizonRequest & { result?: FlightHorizonData; error?: string }>) => {
      if (data.id !== this.serial || this.failed) return;
      clearTimeout(this.timeout);
      this.pending = false;
      if (!data.result) { this.fail(data.error || 'Empty flight terrain'); return; }
      if (this.target && (Math.hypot(data.x - this.target.x, data.z - this.target.z) > 2048 || data.far !== this.target.far)) {
        this.request(); return;
      }
      const result = data.result;
      const reusable = this.mesh.geometry.getAttribute('position')?.array.length === result.positions.length && this.mesh.geometry.index?.count === result.indices.length;
      const geometry = reusable ? this.mesh.geometry : new BufferGeometry();
      for (const [name, values] of [['position', result.positions], ['normal', result.normals], ['color', result.colors]] as const) {
        if (reusable) { const attribute = geometry.getAttribute(name) as BufferAttribute; attribute.set(values); attribute.needsUpdate = true; }
        else geometry.setAttribute(name, new BufferAttribute(values, 3));
      }
      if (!reusable) { geometry.setIndex(new BufferAttribute(result.indices, 1)); this.mesh.geometry.dispose(); this.mesh.geometry = geometry; }
      geometry.computeBoundingSphere(); this.coverage = data.far; this.rendered = false;
      this.center = { x: data.x, z: data.z }; this.place();
      this.request();
    };
    this.worker.onerror = event => this.fail(event.message);
    this.worker.onmessageerror = () => this.fail('Invalid flight terrain response');
  }

  update(x: number, z: number, far: number): void {
    this.place();
    this.target = { x: Math.round(x / 512) * 512, z: Math.round(z / 512) * 512, far };
    this.request();
  }

  readyAt(x: number, z: number, far: number): boolean { return this.rendered && this.coverage >= far && Math.hypot(x - this.center.x, z - this.center.z) <= 1024; }

  confirmRendered(): void { this.rendered = this.coverage > 0; }

  private request(): void {
    if (!this.target) return;
    const { x, z, far } = this.target, inner = 256;
    const key = `${x}:${z}:${far}`;
    if (this.pending || this.failed || key === this.key) return;
    this.pending = true; this.key = key;
    this.timeout = setTimeout(() => this.fail('Flight terrain worker timed out'), 15000);
    try { this.worker.postMessage({ id: ++this.serial, seed: this.world.seed, options: this.world.options, x, z, inner, far } satisfies HorizonRequest); }
    catch (error) { this.fail(String(error)); }
  }

  private place(): void { this.mesh.position.set(this.center.x - this.world.origin.x, 0, this.center.z - this.world.origin.z); }
  private fail(message: string): void { clearTimeout(this.timeout); this.error = message || 'Flight terrain worker failed'; this.failed = true; this.worker.terminate(); runtimeLog.write('error', 'flight-terrain', this.error); }
  dispose(): void { clearTimeout(this.timeout); this.failed = true; this.worker.terminate(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
