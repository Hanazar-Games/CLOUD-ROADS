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

  constructor(scene: Scene, private readonly world: World) {
    this.mesh.name = 'cloud-roads-flight-horizon'; scene.add(this.mesh);
    this.worker.onmessage = ({ data }: MessageEvent<HorizonRequest & { result?: FlightHorizonData; error?: string }>) => {
      this.pending = false;
      if (!data.result) { this.fail(data.error || 'Empty flight terrain'); return; }
      const geometry = new BufferGeometry(), result = data.result;
      geometry.setAttribute('position', new BufferAttribute(result.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(result.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(result.colors, 3));
      geometry.setIndex(new BufferAttribute(result.indices, 1)); geometry.computeBoundingSphere();
      this.mesh.geometry.dispose(); this.mesh.geometry = geometry;
      this.center = { x: data.x, z: data.z }; this.place();
    };
    this.worker.onerror = event => this.fail(event.message);
    this.worker.onmessageerror = () => this.fail('Invalid flight terrain response');
  }

  update(x: number, z: number, far: number): void {
    this.place();
    x = Math.round(x / 1024) * 1024; z = Math.round(z / 1024) * 1024;
    const inner = Math.max(256, this.world.chunks.viewRadius * 256 - 1024);
    const key = `${x}:${z}:${inner}:${far}`;
    if (this.pending || this.failed || key === this.key) return;
    this.pending = true; this.key = key;
    this.worker.postMessage({ seed: this.world.seed, options: this.world.options, x, z, inner, far } satisfies HorizonRequest);
  }

  private place(): void { this.mesh.position.set(this.center.x - this.world.origin.x, 0, this.center.z - this.world.origin.z); }
  private fail(message: string): void { this.failed = true; this.worker.terminate(); runtimeLog.write('error', 'flight-terrain', message); }
  dispose(): void { this.worker.terminate(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
