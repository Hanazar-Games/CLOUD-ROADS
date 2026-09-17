export interface RoadEdge<T extends { x: number; z: number } = { x: number; z: number }> { a: T; b: T }
interface Node {
  start: number; end: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
  left?: Node; right?: Node;
}

export class RoadIndex {
  private readonly root?: Node;

  constructor(private readonly edges: readonly RoadEdge[]) {
    if (edges.length) this.root = this.build(0, edges.length);
  }

  private build(start: number, end: number): Node {
    const node: Node = { start, end, minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
    if (end - start > 8) {
      const middle = (start + end) >>> 1;
      node.left = this.build(start, middle);
      node.right = this.build(middle, end);
      for (const child of [node.left, node.right]) {
        node.minX = Math.min(node.minX, child.minX); node.maxX = Math.max(node.maxX, child.maxX);
        node.minZ = Math.min(node.minZ, child.minZ); node.maxZ = Math.max(node.maxZ, child.maxZ);
      }
    } else {
      for (let i = start; i < end; i++) {
        const { a, b } = this.edges[i];
        node.minX = Math.min(node.minX, a.x, b.x); node.maxX = Math.max(node.maxX, a.x, b.x);
        node.minZ = Math.min(node.minZ, a.z, b.z); node.maxZ = Math.max(node.maxZ, a.z, b.z);
      }
    }
    return node;
  }

  within(minX: number, minZ: number, maxX: number, maxZ: number): number[] {
    const result: number[] = [];
    const visit = (node: Node) => {
      if (node.maxX < minX || node.minX > maxX || node.maxZ < minZ || node.minZ > maxZ) return;
      if (node.left && node.right) { visit(node.left); visit(node.right); }
      else for (let i = node.start; i < node.end; i++) {
        const { a, b } = this.edges[i];
        if (Math.max(a.x, b.x) >= minX && Math.min(a.x, b.x) <= maxX && Math.max(a.z, b.z) >= minZ && Math.min(a.z, b.z) <= maxZ) result.push(i);
      }
    };
    if (this.root) visit(this.root);
    return result;
  }

  nearest(x: number, z: number, radius = Infinity): { index: number; t: number; distanceSquared: number } | undefined {
    let best = radius * radius, index = -1, t = 0;
    const distance = (node: Node) => Math.max(node.minX - x, 0, x - node.maxX) ** 2 + Math.max(node.minZ - z, 0, z - node.maxZ) ** 2;
    const visit = (node: Node) => {
      if (distance(node) > best) return;
      if (node.left && node.right) {
        const first = distance(node.left) <= distance(node.right) ? node.left : node.right;
        visit(first); visit(first === node.left ? node.right : node.left);
      } else for (let i = node.start; i < node.end; i++) {
        const { a, b } = this.edges[i], dx = b.x - a.x, dz = b.z - a.z;
        const lengthSquared = dx * dx + dz * dz;
        const fraction = lengthSquared ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared)) : 0;
        const candidate = (x - a.x - dx * fraction) ** 2 + (z - a.z - dz * fraction) ** 2;
        if (candidate < best || candidate === best && (index === -1 || i < index)) { best = candidate; index = i; t = fraction; }
      }
    };
    if (this.root) visit(this.root);
    return index < 0 ? undefined : { index, t, distanceSquared: best };
  }
}
