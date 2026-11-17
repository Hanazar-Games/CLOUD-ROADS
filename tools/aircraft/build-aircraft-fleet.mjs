import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
import { AIRCRAFT } from '../../src/aviation/aircraft-flight.js';
import { batchMeshes } from '../../src/aviation/model-utils.js';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }); }
};

for (const id of ['t6', 'b62', 'c24', 'd9', 'p72', 'f26'].filter(id => process.argv.length < 3 || process.argv.slice(2).includes(id))) {
  const spec = AIRCRAFT.find(aircraft => aircraft.id === id), L = spec.length, S = spec.span;
  const trainer = id === 't6', regional = id === 'p72', twin = id === 'f26', cargo = id === 'c24', fighter = id === 'd9' || twin;
  const highWing = cargo || regional, width = trainer ? .62 : highWing ? 1.55 : twin ? 1.1 : fighter ? .72 : 1.05;
  const root = new THREE.Group(), body = new THREE.Group(), gear = new THREE.Group();
  root.name = `${spec.name} original model`; root.userData = { author: 'Lunar Courier project', license: 'CC0-1.0', description: spec.subtitle };
  gear.name = 'landing-gear'; root.add(body, gear);
  const palette = {
    body: twin ? 0x4b5965 : fighter ? 0x3e5968 : cargo ? 0xd9d5bc : 0xe5edf0,
    accent: regional ? 0x238c9c : twin ? 0xa9b5b6 : trainer ? 0xe5a135 : cargo ? 0xc36b3f : fighter ? 0x8da6aa : 0x226c89,
    glass: 0x203f50, dark: 0x14252d, steel: 0x87969c, red: 0xd65c45, green: 0x53c9a8,
  };
  const materials = Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, roughness: key === 'glass' ? .18 : .58, metalness: key === 'steel' ? .75 : .22 })]));
  const add = (geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], parent = body) => {
    geometry.deleteAttribute('uv');
    const mesh = new THREE.Mesh(geometry, materials[material]); mesh.position.set(...position); mesh.rotation.set(...rotation); parent.add(mesh); return mesh;
  };
  function hull(sections, material = 'body', x = 0, y = 0) {
    const vertices = [], indices = [], sides = 16;
    for (const [z, w, h, offset = 0] of sections) for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2; vertices.push(x + Math.cos(angle) * w, y + offset + Math.sin(angle) * h, z);
    }
    for (let ring = 0; ring < sections.length - 1; ring++) for (let side = 0; side < sides; side++) {
      const a = ring * sides + side, b = ring * sides + (side + 1) % sides;
      indices.push(a, b, b + sides, a, b + sides, a + sides);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return add(geometry, material);
  }
  function panel(points, y, material = 'body', thickness = .08) {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }); geometry.rotateX(-Math.PI / 2);
    return add(geometry, material, [0, y, 0]);
  }
  function fin(x, z, height, chord, cant = 0) {
    const shape = new THREE.Shape([[0, 0], [chord * .3, height], [chord * .7, height * .95], [chord, 0]].map(point => new THREE.Vector2(...point)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .1, bevelEnabled: false }); geometry.rotateY(-Math.PI / 2);
    return add(geometry, 'accent', [x, width * .6, z], [0, 0, cant]);
  }
  function propeller(x, y, z, radius) {
    const prop = new THREE.Group(); prop.name = `propeller-${x < 0 ? 'port' : 'starboard'}`; prop.position.set(x, y, z); root.add(prop);
    add(new THREE.CylinderGeometry(radius * .14, radius * .14, .3, 12), 'steel', [0, 0, 0], [Math.PI / 2, 0, 0], prop);
    const blades = regional ? 6 : 4;
    for (let blade = 0; blade < blades; blade++) {
      const angle = blade * Math.PI * 2 / blades;
      add(new THREE.BoxGeometry(radius * .16, radius * .76, .055), 'dark', [-Math.sin(angle) * radius * .58, Math.cos(angle) * radius * .58, 0], [0, 0, angle], prop);
      add(new THREE.BoxGeometry(radius * .17, radius * .1, .06), 'accent', [-Math.sin(angle) * radius * .91, Math.cos(angle) * radius * .91, 0], [0, 0, angle], prop);
    }
    batchMeshes(prop);
  }

  hull([[-L / 2, .005, .005], [-L * .4, width * .65, width * .65], [-L * .26, width, width], [L * .14, width, width], [L * .35, width * .58, width * .65, width * .12], [L / 2, .005, .005, width * .3]]);
  hull(regional ? [[-L * .44, .02, .02, width * .45], [-L * .38, width * .66, width * .3, width * .6], [-L * .31, width * .83, width * .23, width * .65], [-L * .29, .02, .02, width * .8]] : [[-L * .34, .03, .04, width * .65], [-L * .25, width * .8, width * .5, width * .8], [-L * .08, width * .7, width * .5, width * .85], [L * .02, .02, .03, width * .9]], 'glass');
  const wingY = highWing ? width * .65 : -.12;
  for (const sign of [-1, 1]) {
    const points = twin ? [[sign * width * .7, -L * .25], [sign * S / 2, L * .09], [sign * S / 2, L * .17], [sign * S * .32, L * .28], [sign * width, L * .21]] : fighter ? [[sign * width * .7, -L * .22], [sign * S / 2, L * .19], [sign * S * .43, L * .32], [sign * width, L * .27]]
      : [[sign * width * .7, -L * .12], [sign * S / 2, highWing || trainer ? -L * .06 : L * .1], [sign * S / 2, highWing || trainer ? L * .07 : L * .18], [sign * width, L * .15]];
    panel(points, wingY, 'body', highWing ? .18 : .1);
    panel(points.map(([x, z]) => [x * .96, z + .025]), wingY + .19, 'accent', .025);
    const tailY = regional ? width * 2.28 : cargo || !trainer && !fighter ? width * 1.65 : width * .5;
    panel([[regional ? 0 : sign * width * .3, L * .31], [sign * S * .2, L * .39], [sign * S * .18, L * .47], [regional ? 0 : sign * width * .4, L * .47]], tailY, 'accent');
    add(new THREE.SphereGeometry(.075, 8, 6), sign < 0 ? 'red' : 'green', [sign * S * .498, wingY + .2, points[1][1]]);
    if (!highWing && !trainer && !fighter) {
      const winglet = add(new THREE.BoxGeometry(.09, 1.15, L * .065), 'accent', [sign * S * .493, wingY + .62, L * .14]); winglet.rotation.z = -sign * .16;
    }
    if (fighter && !twin) panel([[sign * width * .5, -L * .23], [sign * S * .23, -L * .12], [sign * S * .2, -L * .04], [sign * width, -L * .1]], .35, 'accent');
    if (!fighter) for (let i = 0; i < (regional ? 18 : cargo ? 4 : trainer ? 2 : 7); i++) {
      const window = add(new THREE.SphereGeometry(.13, 8, 6), 'glass', [sign * width * .99, width * .28, regional ? -L * .26 + i * L * .029 : -L * .13 + i * L * .047]); window.scale.set(.24, 1, 1.4);
    }
    if (regional) for (const z of [-L * .29, L * .25]) {
      add(new THREE.PlaneGeometry(.7, 1.6), 'accent', [sign * (width + .02), -.08, z], [0, sign * Math.PI / 2, 0]);
      add(new THREE.PlaneGeometry(.5, 1.38), 'body', [sign * (width + .025), -.08, z], [0, sign * Math.PI / 2, 0]);
    }
  }
  if (twin) for (const side of [-1, 1]) fin(side * 1.25, L * .25, 2.8, L * .2, -side * .3);
  else fin(0, L * .27, fighter ? 2.4 : width * 1.8, L * .2);
  if (trainer) {
    propeller(0, 0, -L * .485, 1.15);
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(.12, .15, L * .3), 'accent', [side * width * .95, -.1, -L * .05]);
  } else if (highWing) {
    for (const side of [-1, 1]) {
      hull([[-L * .23, .04, .04], [-L * .18, .58, .58], [L * .02, .55, .55], [L * .1, .04, .04]], 'accent', side * S * .24, regional ? .65 : .25);
      propeller(side * S * .24, regional ? .65 : .25, -L * .235, regional ? 1.85 : 1.72);
    }
    if (cargo) add(new THREE.BoxGeometry(width * 1.15, .08, L * .14), 'dark', [0, -width * .35, L * .34], [-.15, 0, 0]);
  } else {
    for (const x of twin ? [-1.05, 1.05] : fighter ? [0] : [-width * 1.55, width * 1.55]) {
      const z = fighter ? L * .25 : L * .27, radius = fighter ? .6 : .54;
      hull([[z - L * .12, radius, radius], [z + L * .14, radius * .9, radius * .9]], 'steel', x, -.12);
      add(new THREE.CircleGeometry(radius * .85, 20), 'dark', [x, -.12, z - L * .12 - .01], [0, Math.PI, 0]);
      add(new THREE.CircleGeometry(radius * .8, 20), 'dark', [x, -.12, z + L * .14 + .01]);
      if (twin) {
        hull([[-L * .2, .55, .48], [L * .2, .65, .6]], 'body', x, -.12);
        add(new THREE.CircleGeometry(.5, 6), 'dark', [x, -.12, -L * .2 - .01], [0, Math.PI, 0]);
      }
    }
    if (fighter) hull([[-L / 2 - .01, .005, .005], [-L * .36, width * .77, width * .77]], 'dark');
  }
  const tire = trainer ? .25 : .38;
  for (const [x, z] of [[0, -L * .29], [-width * 1.15, L * .13], [width * 1.15, L * .13]]) {
    const bottom = -spec.gearHeight + tire, top = -.25;
    add(new THREE.CylinderGeometry(.065, .065, top - bottom, 8), 'steel', [x, (top + bottom) / 2, z], [0, 0, 0], gear);
    add(new THREE.CylinderGeometry(tire, tire, .18, 12), 'dark', [x, bottom, z], [0, 0, Math.PI / 2], gear);
    add(new THREE.CylinderGeometry(tire * .45, tire * .45, .19, 10), 'steel', [x, bottom, z], [0, 0, Math.PI / 2], gear);
  }
  batchMeshes(body); batchMeshes(gear);
  const buffer = await new GLTFExporter().parseAsync(root, { binary: true });
  await writeFile(new URL(`../../assets/aircraft/${id}.glb`, import.meta.url), Buffer.from(buffer));
  console.log(`Generated ${id}: ${buffer.byteLength} bytes`);
}
