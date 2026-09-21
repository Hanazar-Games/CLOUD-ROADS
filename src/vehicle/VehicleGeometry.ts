import { BufferGeometry, LatheGeometry, Mesh, Vector2, type Group } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function tireGeometry(radius: number, width: number): BufferGeometry {
  return new LatheGeometry([
    [0.56, -0.51], [0.8, -0.53], [0.94, -0.45], [0.99, -0.3], [1, -0.12],
    [1, 0.12], [0.99, 0.3], [0.94, 0.45], [0.8, 0.53], [0.56, 0.51],
  ].map(([r, y]) => new Vector2(r * radius, y * width)), 24);
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
