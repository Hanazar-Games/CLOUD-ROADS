export interface Obstacle { x: number; z: number; heading: number; width: number; front: number; rear: number }

export function constrainObstacle(body: { x: number; z: number }, previousX: number, previousZ: number, radius: number, obstacle: Obstacle): boolean {
  const c = Math.cos(obstacle.heading), s = Math.sin(obstacle.heading), dx = body.x - obstacle.x, dz = body.z - obstacle.z;
  const x = dx * c + dz * s, a = dx * s - dz * c, w = obstacle.width / 2 + radius, front = obstacle.front + radius, rear = obstacle.rear - radius;
  if (Math.abs(x) >= w || a >= front || a <= rear) return false;
  const px = (previousX - obstacle.x) * c + (previousZ - obstacle.z) * s, pa = (previousX - obstacle.x) * s - (previousZ - obstacle.z) * c;
  let nx = x, na = a;
  if (Math.abs(px) >= w) nx = Math.sign(px) * w;
  else if (pa >= front) na = front;
  else if (pa <= rear) na = rear;
  else return false;
  body.x = obstacle.x + nx * c + na * s; body.z = obstacle.z + nx * s - na * c; return true;
}
