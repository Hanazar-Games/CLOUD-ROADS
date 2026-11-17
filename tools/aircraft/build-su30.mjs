import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }); }
};

const aircraft = new THREE.Group();
aircraft.name = 'Su-30 original low-poly interpretation';
aircraft.userData = { author: 'Lunar Courier project', license: 'CC0-1.0', description: 'Original simplified Su-30 inspired visual model; no external fighter mesh.' };
const materials = {
  body: new THREE.MeshStandardMaterial({ color: 0x8aa1b5, roughness: .55, metalness: .35 }),
  camo: new THREE.MeshStandardMaterial({ color: 0x425e79, roughness: .65, metalness: .25 }),
  nose: new THREE.MeshStandardMaterial({ color: 0xd7dfe2, roughness: .6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x264d62, roughness: .12, metalness: .65 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x16202a, roughness: .75 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6a7178, metalness: .8, roughness: .3 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc95443, roughness: .6 }),
};

function add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], parent = aircraft) {
  const mesh = new THREE.Mesh(geometry, materials[material]);
  mesh.position.set(...position); mesh.rotation.set(...rotation); parent.add(mesh);
  return mesh;
}

function hull(sections, material, centerX = 0, centerY = 0) {
  const vertices = [], indices = [], sides = 16;
  for (const [z, width, height, offset = 0] of sections) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      vertices.push(centerX + Math.cos(angle) * width, centerY + offset + Math.sin(angle) * height, z);
    }
  }
  for (let ring = 0; ring < sections.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side, b = ring * sides + (side + 1) % sides, c = b + sides, d = a + sides;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return add(geometry, material);
}

function panel(points, thickness, material) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -.05, 0);
  return add(geometry, material);
}

hull([[-11, .025, .025], [-8, .55, .52], [-5, .8, .8], [-1, 1.5, .85], [3.5, 1.6, .7], [8.5, .8, .4], [9.6, .15, .1]], 'body');
hull([[-11.1, .01, .01], [-8, .56, .53], [-7.8, .58, .55]], 'nose');
hull([[-7.4, .06, .06, .65], [-6.2, .55, .52, .8], [-4, .6, .65, .88], [-2.8, .2, .1, .8]], 'glass');
for (const sign of [-1, 1]) {
  hull([[-2.6, .58, .4], [-1.7, .74, .7], [4.8, .74, .7], [8.2, .65, .65], [9, .5, .5]], 'body', sign * 1.2, -.55);
  add(new THREE.CylinderGeometry(.62, .5, 1.35, 20, 1, true), 'steel', [sign * 1.2, -.55, 8.7], [Math.PI / 2, 0, 0]);
  add(new THREE.CircleGeometry(.46, 20), 'dark', [sign * 1.2, -.55, 9.39]);
  add(new THREE.BoxGeometry(1.22, .77, 1.7), 'dark', [sign * 1.2, -.6, -2.3]);
  const wing = panel([[sign * 1, -2.3], [sign * 7.35, 2.5], [sign * 7, 4.3], [sign * 2, 4.4]], .16, 'body');
  wing.name = sign < 0 ? 'port-wing' : 'starboard-wing';
  panel([[sign * 2, 0], [sign * 5.9, 2.5], [sign * 4.1, 3.2], [sign * 1.7, 2]], .18, 'camo');
  const tail = panel([[sign * 1, 5.8], [sign * 4.1, 7.6], [sign * 3.6, 9], [sign * .9, 8.5]], .12, 'camo');
  tail.position.y = .2;
  const canard = panel([[sign * .65, -4.8], [sign * 2.6, -3.7], [sign * 2.3, -3], [sign * .8, -3.3]], .1, 'camo');
  canard.position.y = .45;
  const finShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 3.5), new THREE.Vector2(2, 4.1), new THREE.Vector2(3.4, 0)]);
  const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: .14, bevelEnabled: false });
  finGeometry.rotateY(-Math.PI / 2);
  add(finGeometry, 'camo', [sign * 1.45, .2, 4.4], [0, 0, -sign * .1]);
  add(new THREE.CylinderGeometry(.06, .06, 2.9, 8), 'steel', [sign * 7.15, 0, 3], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(.11, 8, 6), sign < 0 ? 'red' : 'nose', [sign * 7.15, 0, 1.6]);
}
const gear = new THREE.Group(); gear.name = 'landing-gear'; aircraft.add(gear);
for (const [x, z] of [[0, -5.1], [-1.5, 2.2], [1.5, 2.2]]) {
  add(new THREE.CylinderGeometry(.09, .09, 1.8, 10), 'steel', [x, -1.4, z], [0, 0, 0], gear);
  add(new THREE.CylinderGeometry(.38, .38, .3, 14), 'dark', [x, -2.3, z], [0, 0, Math.PI / 2], gear);
  add(new THREE.CylinderGeometry(.18, .18, .32, 12), 'steel', [x, -2.3, z], [0, 0, Math.PI / 2], gear);
}
for (const group of [aircraft, gear]) {
  const batches = new Map();
  group.updateMatrixWorld(true);
  for (const mesh of [...group.children].filter(child => child.isMesh)) {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.deleteAttribute('uv'); geometry.applyMatrix4(mesh.matrix);
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(geometry); group.remove(mesh); mesh.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    group.add(new THREE.Mesh(mergeGeometries(geometries), material));
    for (const geometry of geometries) geometry.dispose();
  }
}
const buffer = await new GLTFExporter().parseAsync(aircraft, { binary: true });
const output = new URL('../../assets/aircraft/su30.glb', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, Buffer.from(buffer));
console.log(`Generated ${buffer.byteLength} byte Su-30 GLB`);
