const structures = [
  { kind: 'terminal', x: -440, z: -100, width: 220, depth: 680, roofHeight: 49, height: 52 },
  { kind: 'terminal-wing', x: -340, z: 310, width: 220, depth: 70, roofHeight: 27, height: 30 },
  ...[600, 900].map(z => ({ kind: 'hangar', x: 400, z, width: 180, depth: 190, height: 51 })),
  { kind: 'tower', x: -240, z: -700, width: 48, depth: 48, height: 113 },
  ...[-360, -150, 60, 270].flatMap(z => [
    { kind: 'jetway', x: -281, z, width: 102, depth: 9, base: 7, height: 13 },
    { kind: 'jetway', x: -224, z, width: 12, depth: 18, base: 4, height: 15 },
  ]),
  { kind: 'depot', x: -700, z: -650, width: 200, depth: 120, height: 24 },
  { kind: 'fuel', x: 580, z: 1200, width: 120, depth: 120, height: 20 },
  ...[1000, -1850].map(z => ({ kind: 'windsock', x: -112, z, width: 20, depth: 8, height: 10 })),
  ...Array.from({ length: 70 }, (_, index) => ({ kind: 'city', x: -1300 - index % 10 * 110, z: 700 + Math.floor(index / 10) * 150, width: 60, depth: 70, height: 35 + index * 37 % 105 })),
  { kind: 'fire-station', x: 440, z: -350, width: 130, depth: 110, height: 22 },
  { kind: 'cargo', x: 560, z: -750, width: 230, depth: 210, height: 34 },
  { kind: 'radar', x: -850, z: -1000, width: 36, depth: 36, height: 48 },
];

export function airportHeight(x, z, airport = AIRPORTS[0]) {
  return airport.terrainHeight ? airport.terrainHeight(x, z) : airport.elevation;
}

export function airportSurfaceHeight(x, z, airport) {
  const runway = airport.runway;
  if (Math.abs(x) <= runway.width / 2 && z >= runway.end && z <= runway.start) return airport.elevation + runway.surfaceHeight;
  let height = airportHeight(x, z, airport);
  for (const pavement of airport.pavements) if (Math.abs(x - pavement.x) <= pavement.width / 2 && Math.abs(z - pavement.z) <= pavement.depth / 2) height = Math.max(height, airport.elevation + pavement.surfaceHeight);
  return height;
}

function createSite(config) {
  const { length, width, side = 1, offsetZ = 0, ...metadata } = config;
  const runway = Object.freeze({ width, shoulder: 15, start: -400 + length / 2, end: -400 - length / 2, length, center: -400, surfaceHeight: .45 });
  const localBuildings = structures.filter(building => building.kind !== 'city' || config.biome === 'coast' || building.x > -1800 && building.z < 1200).map(building => ({ base: 0, ...building }));
  if (config.biome === 'desert') localBuildings.push({ kind: 'hangar', x: 700, z: 600, width: 180, depth: 190, base: 0, height: 51 });
  localBuildings.push(
    ...[-360, -150, 60, 270].map(z => ({ kind: 'service-vehicle', x: -195, z: z + 95, width: 4, depth: 9, base: .34, height: 3.34 })),
    ...[-380, -330].map(z => ({ kind: 'fire-truck', x: 355, z, width: 5, depth: 12, base: .34, height: 4.34 })),
    ...Array.from({ length: 18 }, (_, index) => -380 + index * 34).flatMap(z => [-880, -820, -740].map(x => ({ kind: 'parked-car', x, z: z + 15, width: 4.4, depth: 8, base: .3, height: 2.8 }))),
    ...[-1, 1].map(sign => ({ kind: 'fence', x: sign * 1010, z: runway.center - offsetZ, width: 1, depth: length + 500, base: 0, height: 3.5 })),
  );
  const buildings = localBuildings.map(building => Object.freeze({ ...building, x: building.x * side, z: building.z + offsetZ }));
  const taxiways = [
    { x: -170, z: runway.center - offsetZ, width: 32, depth: length - 200 },
    ...[runway.start - 300, runway.center - 800, runway.end + 200].map(z => ({ x: -85, z: z - offsetZ, width: 170, depth: 30 })),
    { x: 160, z: 1250, width: 320, depth: 30 },
  ].map(item => Object.freeze({ ...item, x: item.x * side, z: item.z + offsetZ }));
  const localPavements = [
    { x: -325, z: -100, width: 310, depth: 1300, surfaceHeight: .34 },
    { x: 330, z: 850, width: 370, depth: 900, surfaceHeight: .34 },
    { x: -610, z: -100, width: 30, depth: 1150, surfaceHeight: .3 },
    { x: -790, z: -100, width: 280, depth: 700, surfaceHeight: .3 },
    { x: 490, z: -530, width: 450, depth: 850, surfaceHeight: .34 },
    { x: 272, z: 100, width: 30, depth: 1800, surfaceHeight: .34 },
    { x: -720, z: -650, width: 28, depth: 1100, surfaceHeight: .3 },
  ].map(Object.freeze);
  const pavements = [...localPavements.map(item => Object.freeze({ ...item, x: item.x * side, z: item.z + offsetZ })), ...taxiways.map(item => Object.freeze({ ...item, surfaceHeight: .4 }))];
  const bounds = buildings.reduce((bounds, building) => ({ x: Math.max(bounds.x, Math.abs(building.x) + building.width / 2 + 100), z: Math.max(bounds.z, Math.abs(building.z) + building.depth / 2 + 100) }), { x: 0, z: 0 });
  const site = { ...metadata, side, offsetZ, runway, buildings: Object.freeze(buildings), localBuildings: Object.freeze(localBuildings.map(Object.freeze)), taxiways: Object.freeze(taxiways), localPavements: Object.freeze(localPavements), pavements: Object.freeze(pavements), bounds: Object.freeze(bounds) };
  const positions = [[0, 180, -2000], [0, 420, -4600], [2600, 650, -6600], [5600, 650, -3400], [3200, 420, 3600], [0, 180, 3000]].map(([x, y, z]) => [x, Math.max(site.elevation + y, airportHeight(x, z, site) + 180), z]);
  site.gates = Object.freeze(positions.map(([x, y, z], index) => {
    const previous = positions[index - 1] ?? [0, site.elevation, 1000], direction = [x - previous[0], y - previous[1], z - previous[2]], distance = Math.hypot(...direction);
    return Object.freeze({ x, y, z, radius: 155, normal: Object.freeze(direction.map(value => value / distance)) });
  }));
  return Object.freeze(site);
}

export const AIRPORTS = Object.freeze([
  createSite({ id: 'coast', name: '蓝湾国际机场', description: '海岛海岸 · 城市航站楼与四座登机桥', biome: 'coast', elevation: 0, length: 4000, width: 60 }),
  createSite({ id: 'alpine', name: '云岭高原机场', description: '高原山谷 · 平整台地与东侧航站区', biome: 'alpine', elevation: 820, length: 3600, width: 45, side: -1, offsetZ: -280 }),
  createSite({ id: 'desert', name: '赤沙枢纽机场', description: '海拔 160 m · 沙丘盆地与扩建货运机库', biome: 'desert', elevation: 160, length: 4600, width: 60, offsetZ: 240 }),
]);
export const RUNWAY = AIRPORTS[0].runway;
export const TAXIWAYS = AIRPORTS[0].taxiways;
export const AIRPORT_BUILDINGS = AIRPORTS[0].buildings;
