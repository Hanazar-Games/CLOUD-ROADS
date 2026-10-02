import { Vector3 } from 'three';
import type { CorridorEdge } from '../road/RoadCorridor';
import { RoadIndex } from '../road/RoadIndex';
import { roadProfile } from '../road/RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';
import type { TerrainData } from './TerrainGenerator';

type Plane = [number, number, number, number];

// Subtract only the bore from surface triangles at its mouths; the mountain stays intact.
export function excavateTunnelMouths(data: TerrainData, topology: Uint16Array, road: readonly CorridorEdge[],
  options: Readonly<WorldOptions>, originX: number, originZ: number): TerrainData {
  const edges = road.filter(({ a, b }) => a.tunnel && b.tunnel);
  if (!edges.length) return data;
  const index = new RoadIndex(edges), profile = roadProfile(options), reach = profile.outerHalfWidth + 8;
  const volumes = new Map<number, Plane[][]>();
  const cutters = (id: number): Plane[][] => {
    let cached = volumes.get(id);
    if (cached) return cached;
    const { a, b } = edges[id], start = new Vector3(a.x - originX, a.y, a.z - originZ);
    const tangent = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z), length = tangent.length();
    tangent.normalize();
    const normal = new Vector3(a.nx + b.nx, a.ny + b.ny, a.nz + b.nz).normalize();
    const right = new Vector3().crossVectors(tangent, normal).normalize();
    normal.crossVectors(right, tangent).normalize();
    const half = (a.halfWidth ?? profile.halfWidth) + 0.95, arch: [number, number][] = [[-half, -0.3], [-half, 4.2]];
    for (let i = 1; i <= 24; i++) arch.push([-half * Math.cos(i * Math.PI / 24), 4.2 + Math.sin(i * Math.PI / 24) * 3.65]);
    arch.push([half, -0.3]);
    cached = (a.halfWidth === undefined ? profile.centers : [0]).map(center => {
      const origin = start.clone().addScaledVector(right, center);
      const planes: Plane[] = [
        [-tangent.x, -tangent.y, -tangent.z, -tangent.dot(origin) + 4],
        [tangent.x, tangent.y, tangent.z, tangent.dot(origin) + length + 4],
      ];
      for (let i = 0; i < arch.length; i++) {
        const a = arch[i], b = arch[(i + 1) % arch.length], x = a[1] - b[1], y = b[0] - a[0];
        const n = right.clone().multiplyScalar(x).addScaledVector(normal, y);
        planes.push([n.x, n.y, n.z, n.dot(origin) + x * a[0] + y * a[1]]);
      }
      return planes;
    });
    volumes.set(id, cached);
    return cached;
  };
  const positions = Array.from(data.positions), normals = Array.from(data.normals), colors = Array.from(data.colors), indices: number[] = [];
  const distance = (i: number, p: Plane) => positions[i * 3] * p[0] + positions[i * 3 + 1] * p[1] + positions[i * 3 + 2] * p[2] - p[3];
  const intersection = (a: number, b: number, t: number) => {
    const index = positions.length / 3;
    for (const values of [positions, normals, colors]) for (let axis = 0; axis < 3; axis++)
      values.push(values[a * 3 + axis] + (values[b * 3 + axis] - values[a * 3 + axis]) * t);
    const size = Math.hypot(...normals.slice(index * 3, index * 3 + 3));
    for (let axis = 0; axis < 3; axis++) normals[index * 3 + axis] /= size;
    return index;
  };
  const subtract = (polygon: number[], planes: Plane[]): number[][] => {
    if (planes.some(p => polygon.every(i => distance(i, p) >= -1e-7))) return [polygon];
    const outside: number[][] = [];
    let remaining = polygon;
    for (const plane of planes) {
      const inner: number[] = [], outer: number[] = [];
      for (let i = 0; i < remaining.length; i++) {
        const a = remaining[i], b = remaining[(i + 1) % remaining.length], da = distance(a, plane), db = distance(b, plane);
        (da <= 0 ? inner : outer).push(a);
        if (da < -1e-7 && db > 1e-7 || da > 1e-7 && db < -1e-7) {
          const split = intersection(a, b, da / (da - db)); inner.push(split); outer.push(split);
        } else if (Math.abs(da) <= 1e-7) (da <= 0 ? outer : inner).push(a);
      }
      if (outer.length >= 3) outside.push(outer);
      remaining = inner;
      if (remaining.length < 3) break;
    }
    return outside;
  };
  let changed = false;
  for (let i = 0; i < topology.length; i += 3) {
    const triangle = Array.from(topology.subarray(i, i + 3));
    const xs = triangle.map(v => positions[v * 3] + originX), zs = triangle.map(v => positions[v * 3 + 2] + originZ);
    const ys = triangle.map(v => positions[v * 3 + 1]);
    let polygons = [triangle];
    for (const id of index.within(Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach)) {
      const { a, b } = edges[id];
      if (Math.min(...ys) > Math.max(a.y, b.y) + reach + 10 || Math.max(...ys) < Math.min(a.y, b.y) - reach) continue;
      for (const planes of cutters(id)) polygons = polygons.flatMap(polygon => subtract(polygon, planes));
      if (!polygons.length) break;
    }
    if (polygons.length !== 1 || polygons[0] !== triangle) changed = true;
    for (const polygon of polygons) for (let j = 1; j < polygon.length - 1; j++) indices.push(polygon[0], polygon[j], polygon[j + 1]);
  }
  return changed ? { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors),
    indices: new Uint32Array(indices), vegetation: data.vegetation } : data;
}
