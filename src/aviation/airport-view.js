import * as THREE from 'three';
import { AIRPORTS } from './airport.js';
import { batchMeshes } from './model-utils.js';
import { runwayJunctions } from './airport-layout.js';

export function createAirportLod(airport = AIRPORTS[0]) {
  const lod = new THREE.LOD().addLevel(createAirport({ airport }), 0).addLevel(createAirport({ airport, lowDetail: true }), 2000, .15).addLevel(createAirport({ airport, distant: true }), 9000, .15);
  lod.position.y = airport.elevation;
  return lod;
}

export function setAirportDetailDistance(airport, distance, detail) {
  airport.levels[1].distance = distance * ({ low: .45, balanced: .8, high: 1.3 }[detail]);
  airport.levels[2].distance = Math.max(6500, airport.levels[1].distance * 3);
}

export function createAirport({ lowDetail = false, distant = false, airport = AIRPORTS[0] } = {}) {
  const root = new THREE.Group(); root.name = 'cloud-roads-airport';
  root.scale.x = airport.side;root.position.z = airport.offsetZ;
  const AIRPORT_BUILDINGS = airport.localBuildings, TAXIWAYS = airport.taxiways.map(item => ({ ...item, x: item.x * airport.side, z: item.z - airport.offsetZ }));
  const architecture = new THREE.Group(), pavement = new THREE.Group();
  architecture.name = 'airport-architecture'; pavement.name = 'airport-pavement'; root.add(architecture, pavement);
  const materials = Object.fromEntries(Object.entries({ infield: 0x637651, concrete: 0xc1c8c2, roof: 0xe2e0cb, metal: 0x647b83, glass: 0x355d70, dark: 0x263a45, yellow: 0xe1bd63, white: 0xf1ecdc, orange: 0xf1874e, asphalt: 0x404f58, line: 0xceb161 }).map(([name, color]) => [name, new THREE.MeshStandardMaterial({ color, roughness: name === 'glass' ? .25 : .8, metalness: name === 'glass' ? .35 : .05 })]));
  const surfaceMaterials = {};
  if (airport.airfieldColor) materials.infield.color.setRGB(...airport.airfieldColor);
  if (airport.id === 'coast') box(pavement, 'infield', 1100, -.019, -400, 4400, .04, 6500);
  if (airport.biome === 'alpine') materials.roof.color.setHex(0x456a78);
  if (airport.biome === 'desert') { materials.concrete.color.setHex(0xcbb38e);materials.roof.color.setHex(0xe9d6b3); }
  function box(group, material, x, y, z, width, height, depth) {
    let paint = materials[material];
    if (group === pavement) {
      if (!surfaceMaterials[material]) {
        const surface = paint.clone(); surface.polygonOffset = true;
        surface.polygonOffsetFactor = material === 'infield' ? 0 : material === 'asphalt' ? -1 : -3;
        surface.polygonOffsetUnits = material === 'infield' ? -1 : surface.polygonOffsetFactor;
        surfaceMaterials[material] = surface;
      }
      paint = surfaceMaterials[material];
    }
    const flat = group === pavement && (distant || ['infield', 'line', 'white'].includes(material));
    const mesh = new THREE.Mesh(flat ? new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2) : new THREE.BoxGeometry(width, height, depth), paint);
    mesh.position.set(x, y + (flat ? height / 2 : 0), z); group.add(mesh); return mesh;
  }
  const cylinders = new Map();
  function cylinder(material, x, y, z, radius, height, sides = 16) {
    const key = `${radius}/${height}/${sides}`;
    if (!cylinders.has(key)) cylinders.set(key, new THREE.CylinderGeometry(radius, radius, height, sides));
    const mesh = new THREE.Mesh(cylinders.get(key), materials[material]);
    mesh.position.set(x, y, z); architecture.add(mesh); return mesh;
  }
  for (const { x, z, width, depth, surfaceHeight } of airport.localPavements) box(pavement, 'asphalt', x, surfaceHeight - .11, z, width, .22, depth);
  if (distant) {
    for (const { x, z, width, depth } of TAXIWAYS) box(pavement, 'asphalt', x, .29, z, width, .22, depth);
    for (const { kind, x, z, width, depth, height } of AIRPORT_BUILDINGS) {
      if (!['terminal', 'tower', 'hangar', 'cargo'].includes(kind)) continue;
      box(architecture, 'concrete', x, height / 2, z, width, height, depth);
    }
    const cities = AIRPORT_BUILDINGS.filter(building => building.kind === 'city');
    for (const z of new Set(cities.map(building => building.z))) {
      const row = cities.filter(building => building.z === z), min = Math.min(...row.map(building => building.x - building.width / 2)), max = Math.max(...row.map(building => building.x + building.width / 2));
      box(architecture, 'concrete', (min + max) / 2, 58, z, max - min, 116, 70);
    }
    for (const group of [architecture, pavement]) batchMeshes(group);
    return root;
  }
  if (lowDetail) {
    for (const { x, z, width, depth } of TAXIWAYS) box(pavement, 'asphalt', x, .29, z, width, .22, depth);
    for (const { kind, x, z, width, depth, base, height } of AIRPORT_BUILDINGS) {
      if (['windsock', 'jetway', 'service-vehicle', 'fire-truck', 'parked-car', 'fence'].includes(kind)) continue;
      box(architecture, kind === 'city' ? 'concrete' : kind === 'fuel' ? 'white' : 'metal', x, (height + base) / 2, z, width, height - base, depth);
      if (kind === 'tower') box(architecture, 'glass', x, 95, z, 42, 13, 42);
    }
    for (const group of [architecture, pavement]) batchMeshes(group);
    return root;
  }
  for (const taxiway of TAXIWAYS) {
    box(pavement, 'asphalt', taxiway.x, .29, taxiway.z, taxiway.width, .22, taxiway.depth);
    const horizontal = taxiway.width > taxiway.depth;
    box(pavement, 'line', taxiway.x, .45, taxiway.z, horizontal ? taxiway.width : .65, .03, horizontal ? .65 : taxiway.depth);
  }
  for (const runway of airport.runways) for (const junction of runwayJunctions(airport, runway)) {
    const x = junction.holdX * airport.side, z = junction.z - airport.offsetZ, side = junction.side * airport.side;
    for (const offset of [-1.5, -.5, .5, 1.5]) {
      const dx = x + offset * side;
      if (offset > 0) box(pavement, 'line', dx, .48, z, .3, .04, junction.depth - 4);
      else for (let dz = -junction.depth / 2 + 3; dz < junction.depth / 2 - 2; dz += 3) box(pavement, 'line', dx, .48, z + dz, .3, .04, 1.5);
    }
  }
  for (const building of AIRPORT_BUILDINGS) {
    const { kind, x, z, width, depth, base } = building, height = building.roofHeight ?? building.height;
    if (kind === 'fence') {
      for (let dz = -depth / 2; dz <= depth / 2; dz += 16) box(architecture, 'metal', x, 1.75, z + dz, .18, 3.5, .18);
      for (const y of [.5, 1.8, 3.2]) box(architecture, 'metal', x, y, z, .09, .09, depth);
    } else if (['service-vehicle', 'fire-truck', 'parked-car'].includes(kind)) {
      const bodyHeight = height - base, parked = kind === 'parked-car';
      if (parked) {
        box(architecture, 'metal', x, base + .95, z, width - .3, 1.1, depth - .5);
        box(architecture, 'glass', x, height - .675, z - .2, width - .9, .75, depth * .475);
        box(architecture, 'metal', x, height - .15, z - .2, width - .8, .3, depth * .5);
        for (const side of [-1, 1]) {
          box(architecture, 'metal', x + side * (width / 2 - .43), height - .675, z - .2, .1, .75, .2);
          box(architecture, 'white', x + side * width * .3, base + .9, z - depth / 2 + .23, .6, .25, .06);
          box(architecture, 'orange', x + side * width * .3, base + .9, z + depth / 2 - .23, .6, .25, .06);
        }
      } else {
        box(architecture, kind === 'fire-truck' ? 'orange' : 'white', x, base + bodyHeight * .5, z, width - .3, bodyHeight * .6, depth - .5);
        box(architecture, 'glass', x, base + bodyHeight * .65, z - depth * .25, width - .2, bodyHeight * .45, depth * .22);
        box(architecture, 'yellow', x, height - .15, z + depth * .1, width * .7, .3, depth * .5);
      }
      for (const dx of [-1, 1].map(side => side * width * (parked ? .44 : .38))) for (const dz of [-depth * .3, depth * .3]) {
        const wheel = cylinder('dark', x + dx, base + .65, z + dz, .65, .45, kind === 'parked-car' ? 8 : 10);wheel.rotation.z = Math.PI / 2;
      }
    } else if (kind === 'radar') {
      cylinder('concrete', x, 17, z, 8, 34, 12);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), materials.white);dome.position.set(x, 36, z);architecture.add(dome);
    } else if (kind === 'tower') {
      box(architecture, 'concrete', x, 43, z, 20, 86, 20);
      box(architecture, 'dark', x, 87, z, 36, 3, 36);
      box(architecture, 'glass', x, 95, z, 42, 13, 42);
      box(architecture, 'roof', x, 104, z, 48, 5, 48);
      cylinder('metal', x, 110, z, .6, 6, 8);
    } else if (kind === 'jetway') {
      box(architecture, 'metal', x, (height + base) / 2, z, width, height - base, depth);
      for (const side of [-1, 1]) box(architecture, 'glass', x, (height + base) / 2 + .4, z + side * (depth / 2 + .03), width - 1, (height - base) * .5, .1);
      box(architecture, 'dark', x, base / 2, z, 1.5, base, 2);
      box(architecture, 'roof', x, height + .15, z, width, .3, depth);
      if (width > 20) {
        for (const side of [-1, 1]) for (let dx = -width / 2 + 5; dx < width / 2; dx += 7) box(architecture, 'white', x + dx, (height + base) / 2 + .4, z + side * (depth / 2 + .1), .22, (height - base) * .52, .16);
      } else {
        for (const dx of [-width / 2 + .4, width / 2 - .4]) {
          box(architecture, 'dark', x + dx, (height + base) / 2, z, .5, height - base, depth);
          for (let dz = -depth / 2 + 1; dz < depth / 2; dz += 1.4) box(architecture, 'metal', x + dx * .95, (height + base) / 2, z + dz, .3, height - base - .5, .2);
        }
      }
    } else if (kind === 'windsock') {
      cylinder('metal', x, 4.5, z, .18, 9, 8);
      for (let i = 0; i < 5; i++) {
        const sock = new THREE.Mesh(new THREE.CylinderGeometry(1 - (i + 1) * .13, 1 - i * .13, 1.4, 10), materials[i % 2 ? 'white' : 'orange']);
        const distance = .7 + i * 1.4;
        sock.rotation.z = -Math.PI / 2 - .1; sock.position.set(x + distance * Math.cos(.1), 9 - distance * Math.sin(.1), z); architecture.add(sock);
      }
      box(pavement, 'white', x, .35, z, 12, .04, 12);
      box(pavement, 'asphalt', x, .39, z, 10, .04, 10);
    } else if (kind === 'fuel') {
      for (const dx of [-28, 28]) for (const dz of [-28, 28]) {
        cylinder('white', x + dx, 8, z + dz, 19, 16);
        cylinder('metal', x + dx, 16.4, z + dz, 19.5, .8);
        box(architecture, 'yellow', x + dx, 9, z + dz - 19.1, 12, 2, .3);
      }
    } else {
      box(architecture, kind === 'hangar' ? 'metal' : 'concrete', x + (kind === 'terminal' ? 9 : 0), (height - 3) / 2, z, width - (kind === 'terminal' ? 18 : 0), height - 3, depth);
      box(architecture, 'roof', x, height - 1.5, z, width, 3, depth);
      if (kind === 'terminal' || kind === 'terminal-wing') {
        box(architecture, 'glass', x + width / 2 + .1, height * .54, z, .2, height * .55, depth - 12);
        for (let dz = -depth / 2 + 12; dz < depth / 2; dz += 25) box(architecture, 'white', x + width / 2 + .3, height * .54, z + dz, .6, height * .57, .9);
        box(architecture, 'white', x + width / 2 + .6, height * .4, z, 1.2, 1, depth - 8);
        for (let dz = -depth / 2 + 30; dz < depth / 2; dz += 65) box(architecture, 'glass', x, height + .15, z + dz, width * .7, .3, 12);
        for (const side of [-1, 1]) {
          box(architecture, 'glass', x + 4, height * .54, z + side * (depth / 2 + .1), width - 28, height * .55, .2);
          for (let dx = -width / 2 + 18; dx < width / 2 - 8; dx += 25) box(architecture, 'white', x + dx, height * .54, z + side * (depth / 2 + .25), .65, height * .57, .4);
        }
        for (let dz = -depth / 2 + 8; dz < depth / 2; dz += 65) box(architecture, 'metal', x, height + .3, z + dz, width - 8, .6, 1.2);
        for (let dz = -depth / 2 + 40; dz < depth / 2; dz += 100) {
          box(architecture, 'metal', x - 65, height + 1, z + dz, 13, 2, 10);
          for (const dx of [-3, 3]) cylinder('dark', x - 65 + dx, height + 2.1, z + dz, 2.2, .2, 10);
        }
        if (kind === 'terminal') {
          const front = x - width / 2;
          box(architecture, 'glass', front + 17.9, 17, z, .15, 24, depth - 20);
          box(architecture, 'roof', front + 9, 8, z, 18, 1.1, depth - 12);
          for (let dz = -depth / 2 + 18; dz < depth / 2; dz += 26) {
            box(architecture, 'metal', front + 1.3, 4, z + dz, .7, 8, .7);
            box(architecture, 'white', front + 17.7, 17, z + dz, .4, 25, .6);
          }
        }
      } else if (kind === 'hangar') {
        box(architecture, 'dark', x - width / 2 - .15, 21, z, .3, 38, depth - 22);
        for (let dz = -depth / 2 + 14; dz <= depth / 2 - 14; dz += 23.3) box(architecture, 'metal', x - width / 2 - .4, 21, z + dz, .6, 38, 1.2);
        box(architecture, 'glass', x - width / 2 - .6, 33, z, .3, 6, depth - 25);
        for (let dx = -width / 2 + 20; dx < width / 2; dx += 60) box(architecture, 'dark', x + dx, height + .08, z, 8, .16, depth - 15);
        for (const side of [-1, 1]) {
          box(architecture, 'glass', x, 35, z + side * (depth / 2 + .1), width - 12, 7, .15);
          for (let dx = -width / 2 + 10; dx < width / 2; dx += 14) box(architecture, 'white', x + dx, 23, z + side * (depth / 2 + .25), .65, 44, .4);
        }
      } else if (kind === 'fire-station' || kind === 'cargo') {
        for (let dz = -depth / 2 + 20; dz < depth / 2 - 10; dz += 30) {
          box(architecture, 'dark', x - width / 2 - .1, 8, z + dz, .2, 14, 22);
          for (let y = 3; y < 15; y += 3) box(architecture, kind === 'fire-station' ? 'orange' : 'metal', x - width / 2 - .25, y, z + dz, .2, .6, 21);
        }
      } else if (kind === 'city') box(architecture, 'glass', x + width / 2 + .1, height * .55, z, .2, height * .65, depth - 11);
    }
  }
  for (const z of [-360, -150, 60, 270]) {
    for (let d = 0; d < 80; d += 12) box(pavement, 'line', -205 - d, .48, z + 65, 7, .04, 1);
    box(pavement, 'white', -264, .49, z + 40, 70, .04, .7);
    box(pavement, 'white', -264, .49, z + 90, 70, .04, .7);
    for (const dx of [-298, -229]) box(pavement, 'white', dx, .49, z + 65, .7, .04, 50);
    cylinder('metal', -320, 16, z + 90, .45, 32, 8);
    box(architecture, 'white', -320, 32, z + 90, 8, 1.5, 2);
    for (let dx = -300; dx <= -220; dx += 10) box(pavement, 'line', dx, .51, z + 108, 5, .03, .6);
    for (const dx of [-213, -203]) box(pavement, 'line', dx, .51, z + 65, .6, .03, 105);
  }
  for (const bridge of AIRPORT_BUILDINGS.filter(building => building.kind === 'jetway' && building.width > 20 && building.x > 0)) {
    const x = bridge.x + bridge.width / 2 + 35, z = bridge.z + 65;
    box(pavement, 'line', (x + 1550) / 2, .48, z, 1550 - x, .04, .65);
    box(pavement, 'line', x, .49, z, .7, .04, 14);
    for (const dz of [-50, 50]) box(pavement, 'white', x + 10, .48, z + dz, 100, .04, .7);
    for (const dx of [-40, 60]) box(pavement, 'white', x + dx, .48, z, .7, .04, 100);
    for (let dz = -45; dz <= 45; dz += 10) box(pavement, 'line', x - 50, .49, z + dz, 6, .04, .65);
  }
  for (let z = -380; z < 200; z += 34) for (const x of [-880, -820, -740]) {
    box(pavement, 'white', x, .34, z, 12, .04, .6);
  }
  for (const group of [architecture, pavement]) batchMeshes(group);
  return root;
}
