import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { AIRPORT_ACCESS } from './AirportGround';
import { batchMeshes } from './model-utils.js';

export function createAirportAccess(elevation: number): Group {
  const root = new Group(); root.name = 'airport-road-access'; root.position.y = elevation;
  const material = new MeshStandardMaterial({ color: 0x404f58, roughness: .95 });
  const marking = new MeshStandardMaterial({ color: 0xe9ebdf, roughness: .9 });
  const { start, ramp, end, z, halfWidth } = AIRPORT_ACCESS;
  const height = (x: number) => .3 + .7 * Math.max(0, (ramp - x) / (ramp - start));
  const strip = (a: number, b: number, offset: number, width: number, line = false) => {
    const geometry = new BoxGeometry(b - a, line ? .015 : .16, width), positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + height((a + b) / 2 + positions.getX(i)) - (line ? -.025 : .08));
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, line ? marking : material);
    mesh.position.set((a + b) / 2, 0, z + offset); mesh.receiveShadow = true; root.add(mesh);
  };
  strip(start, ramp, 0, halfWidth * 2); strip(ramp, end, 0, halfWidth * 2);
  for (const side of [-1, 1]) { strip(start, ramp, side * (halfWidth - .6), .15, true); strip(ramp, end, side * (halfWidth - .6), .15, true); }
  for (let x = start + 6; x < end; x += 18) strip(x, Math.min(end, x + 8), 0, .2, true);
  return batchMeshes(root);
}
