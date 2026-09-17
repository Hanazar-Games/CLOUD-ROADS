import { CHUNK_SIZE } from './ChunkPlanner';

export class FloatingOrigin {
  x = 0;
  z = 0;
  count = 0;

  rebase(position: { x: number; y: number; z: number }): boolean {
    if (Math.hypot(position.x, position.z) <= 5000) return false;
    const dx = Math.round(position.x / CHUNK_SIZE) * CHUNK_SIZE;
    const dz = Math.round(position.z / CHUNK_SIZE) * CHUNK_SIZE;
    this.x += dx;
    this.z += dz;
    position.x -= dx;
    position.z -= dz;
    this.count++;
    return true;
  }

  reset(): void { this.x = this.z = this.count = 0; }
}
