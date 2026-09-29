import { BufferGeometry, ExtrudeGeometry, LatheGeometry, Mesh, Shape, Vector2, type Group } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function bodyPanelGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-0.46, -0.46); shape.lineTo(0.46, -0.46); shape.lineTo(0.46, 0.46); shape.lineTo(-0.46, 0.46); shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.92, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1, steps: 1 });
  geometry.translate(0, 0, -0.46); geometry.clearGroups();
  return geometry;
}

export function wheelArchPanelGeometry(from: number, to: number, bottom: number, top: number, axles: readonly number[], wheelY: number, radius: number): BufferGeometry {
  const cuts = new Set([from, to]);
  for (const z of axles) {
    const offsets = Array.from({ length: 25 }, (_, i) => Math.cos(i * Math.PI / 24) * radius);
    for (const y of [bottom, top]) if (y >= wheelY && y <= wheelY + radius) {
      const x = Math.sqrt(radius ** 2 - (y - wheelY) ** 2); offsets.push(-x, x);
    }
    for (const x of offsets) if (z + x > from && z + x < to) cuts.add(z + x);
  }
  const edge = [...cuts].sort((a, b) => a - b).map(z => new Vector2(z, Math.min(top, Math.max(bottom,
    ...axles.filter(axle => Math.abs(z - axle) <= radius).map(axle => wheelY + Math.sqrt(Math.max(0, radius ** 2 - (z - axle) ** 2)))))));
  const shapes: Shape[] = [];
  let run: Vector2[] = [];
  const flush = () => {
    if (run.length > 1 && run.some(point => point.y < top - 1e-6)) {
      const shape = new Shape(); shape.moveTo(run[0].x, top); shape.lineTo(run.at(-1)!.x, top);
      for (const point of [...run].reverse()) shape.lineTo(point.x, point.y);
      shape.closePath(); shapes.push(shape);
    }
    run = [];
  };
  for (const point of edge) {
    if (point.y >= top - 1e-6) { run.push(point); flush(); }
    run.push(point);
  }
  flush();
  const geometry = new ExtrudeGeometry(shapes, { depth: 0.06, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -0.03); geometry.rotateY(-Math.PI / 2); geometry.clearGroups();
  return geometry;
}

export function tireGeometry(radius: number, width: number): BufferGeometry {
  const geometry = new LatheGeometry([
    [0.56, -0.51], [0.8, -0.53], [0.94, -0.45], [0.99, -0.3], [1, -0.12],
    [1, 0.12], [0.99, 0.3], [0.94, 0.45], [0.8, 0.53], [0.56, 0.51],
  ].map(([r, y]) => new Vector2(r * radius, y * width)), 24);
  geometry.normalizeNormals(); return geometry;
}

export function rimGeometry(radius: number, width: number): BufferGeometry {
  const geometry = new LatheGeometry([
    [0.55, -0.49], [0.66, -0.49], [0.66, -0.43], [0.6, -0.35], [0.6, 0.35],
    [0.66, 0.43], [0.66, 0.49], [0.55, 0.49], [0.55, 0.4], [0.56, 0.35],
    [0.56, -0.35], [0.55, -0.4], [0.55, -0.49],
  ].map(([r, y]) => new Vector2(r * radius, y * width)), 24);
  geometry.normalizeNormals(); return geometry;
}

export function wheelFenderGeometry(radius: number, width: number, span = 0): BufferGeometry {
  const shape = new Shape(), outer = radius + 0.045, half = span / 2;
  shape.absarc(half, 0, outer, 0, Math.PI / 2, false);
  shape.lineTo(-half, outer); shape.absarc(-half, 0, outer, Math.PI / 2, Math.PI, false);
  shape.lineTo(-half - radius, 0); shape.absarc(-half, 0, radius, Math.PI, Math.PI / 2, true);
  shape.lineTo(half, radius); shape.absarc(half, 0, radius, Math.PI / 2, 0, true); shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1, curveSegments: 6 });
  geometry.translate(0, 0, -width / 2); geometry.rotateY(Math.PI / 2);
  return geometry;
}

export function mergeVehicleParts(parent: Group): BufferGeometry[] {
  const groups = new Map<string, Mesh[]>(), output: BufferGeometry[] = [];
  for (const child of parent.children) {
    if (!(child instanceof Mesh) || child.children.length || Array.isArray(child.material) || child.material.transparent) continue;
    const key = `${child.material.id}:${child.castShadow}:${child.receiveShadow}`;
    const parts = groups.get(key) ?? []; parts.push(child); groups.set(key, parts);
  }
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const geometries = parts.map(part => {
      part.updateMatrix();
      const geometry = part.geometry.index ? part.geometry.clone() : mergeVertices(part.geometry);
      return geometry.applyMatrix4(part.matrix);
    });
    const geometry = mergeGeometries(geometries)!;
    geometries.forEach(piece => piece.dispose()); geometry.computeBoundingSphere(); output.push(geometry);
    const mesh = new Mesh(geometry, parts[0].material);
    mesh.castShadow = parts[0].castShadow; mesh.receiveShadow = parts[0].receiveShadow;
    parts.forEach(part => parent.remove(part)); parent.add(mesh);
  }
  return output;
}
