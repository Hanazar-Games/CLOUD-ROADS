import * as THREE from 'three';
import { AIRPORTS } from './airport.js';
import { batchMeshes } from './model-utils.js';

export function createRunway(airport = AIRPORTS[0]) {
  const root = new THREE.Group(); root.name = 'airport-runway';
  root.position.y = airport.elevation;
  const RUNWAY = airport.runway, TAXIWAYS = airport.taxiways;
  const groups = {};
  for (const name of ['surface', 'shoulders', 'markings', 'edge-lights', 'threshold-lights', 'approach-lights', 'taxiway-edge-lights']) {
    const group = new THREE.Group(); group.name = name.startsWith('taxiway') ? name : `runway-${name}`; groups[name] = group; root.add(group);
  }
  const pavement = color => new THREE.MeshStandardMaterial({ color, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const materials = { surface: pavement(0x303e49), shoulder: pavement(0x777e78), marking: pavement(0xe9ebdf) };
  materials.marking.polygonOffsetFactor = materials.marking.polygonOffsetUnits = -4;
  for (const [name, color] of Object.entries({ white: 0xfff6de, amber: 0xffc15b, green: 0x65f8a0, red: 0xff6656, blue: 0x55aaff })) materials[name] = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  function box(group, material, x, y, z, width, height, depth) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z); groups[group].add(mesh); return mesh;
  }
  const { width, length, start, end, center, shoulder } = RUNWAY;
  box('surface', 'surface', 0, RUNWAY.surfaceHeight - .15, center, width, .3, length);
  for (const side of [-1, 1]) box('shoulders', 'shoulder', side * (width + shoulder) / 2, .24, center, shoulder, .2, length);
  const mark = (x, z, w, d) => box('markings', 'marking', x, .5, z, w, .04, d);
  for (const side of [-1, 1]) mark(side * (width / 2 - .75), center, .9, length - 10);
  for (let z = end + 180; z < start - 180; z += 60) mark(0, z, .9, 30);
  const digits = { 1: 'bc', 3: 'abgcd', 6: 'afgecd', 8: 'abcdefg' };
  const segments = { a: [0, -10, 6, 1.5], b: [3, -5, 1.5, 9], c: [3, 5, 1.5, 9], d: [0, 10, 6, 1.5], e: [-3, 5, 1.5, 9], f: [-3, -5, 1.5, 9], g: [0, 0, 6, 1.5] };
  for (const [threshold, direction, number] of [[start, -1, '36'], [end, 1, '18']]) {
    const stripes = width >= 60 ? 8 : 6, stripeSpacing = (width / 2 - 4) / (stripes - 1);
    for (const side of [-1, 1]) for (let i = 0; i < stripes; i++) mark(side * (2.7 + i * stripeSpacing), threshold + direction * 35, 1.8, 30);
    for (let digit = 0; digit < 2; digit++) for (const segment of digits[number[digit]]) {
      const [x, z, w, d] = segments[segment];
      mark((digit * 11 - 5.5 + x) * -direction, threshold + direction * (100 - z), w, d);
    }
    for (const side of [-1, 1]) {
      mark(side * 12, threshold + direction * 310, 6, 45);
      for (const [distance, stripes] of [[150, 3], [450, 3], [600, 2], [750, 2], [900, 1]]) for (let i = 0; i < stripes; i++) mark(side * (10 + i * 3), threshold + direction * distance, 1.8, 22.5);
    }
    for (let x = -width / 2 + 3; x < width / 2; x += 6) {
      for (const [color, normal] of [['green', -direction], ['red', direction]]) {
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .7), materials[color]);
        lens.position.set(x, .75, threshold + normal * .2); lens.rotation.y = normal > 0 ? 0 : Math.PI; groups['threshold-lights'].add(lens);
      }
    }
    for (let distance = 30; distance <= 900; distance += 30) {
      const z = threshold - direction * distance;
      for (const x of [-2, 0, 2]) box('approach-lights', 'white', x, .6, z, 1.4, .45, 1.4);
      if (distance === 300 || distance === 600) for (const x of [-15, -10, -5, 5, 10, 15]) box('approach-lights', 'white', x, .6, z, 1.4, .45, 1.4);
    }
  }
  for (let z = end + 5; z < start; z += 60) for (const side of [-1, 1]) for (const normal of [-1, 1]) {
    const remaining = normal > 0 ? z - end : start - z;
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .7), materials[remaining < 600 ? 'amber' : 'white']);
    lens.position.set(side * (width / 2 + 2), .75, z); lens.rotation.y = normal > 0 ? 0 : Math.PI; groups['edge-lights'].add(lens);
  }
  for (let z = end + 30; z < start; z += 30) box('edge-lights', 'white', 0, .52, z, .5, .06, 1.2);
  for (const taxiway of TAXIWAYS) {
    const horizontal = taxiway.width > taxiway.depth, distance = horizontal ? taxiway.width : taxiway.depth;
    for (let d = -distance / 2 + 8; d < distance / 2; d += 60) for (const side of [-1, 1]) {
      const x = taxiway.x + (horizontal ? d : side * (taxiway.width / 2 + 1));
      const z = taxiway.z + (horizontal ? side * (taxiway.depth / 2 + 1) : d);
      if (Math.abs(x) > width / 2 + shoulder + 5) box('taxiway-edge-lights', 'blue', x, .65, z, 1, .5, 1);
    }
  }
  for (const group of Object.values(groups)) batchMeshes(group);
  return root;
}
