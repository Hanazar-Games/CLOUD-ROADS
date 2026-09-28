import { BufferGeometry, ExtrudeGeometry, LatheGeometry, Mesh, Shape, Vector2, type Group } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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
