import { HUB_LAYOUT } from './airport-layout.js';

const structures = [
  { kind: 'terminal', x: -440, z: -100, width: 220, depth: 800, roofHeight: 49, height: 52 },
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

export function navigateAirport(flight, sites) {
  const x = flight.airport.worldX + flight.x, z = flight.airport.worldZ + flight.z;
  let next = flight.airport, distance = flight.x ** 2 + flight.z ** 2;
  for (const site of sites) {
    const dx = x - site.worldX, dz = z - site.worldZ, squared = dx ** 2 + dz ** 2;
    if (Math.abs(dx) <= site.bounds.x && Math.abs(dz) <= site.bounds.z && squared < distance) { next = site; distance = squared; }
  }
  if (next === flight.airport) return false;
  flight.x = x - next.worldX; flight.z = z - next.worldZ; flight.airport = next;
  flight.runwayIndex = 0; flight.gates = 0;
  return true;
}

export function airportSurfaceHeight(x, z, airport) {
  if (Math.abs(x) > airport.bounds.x || Math.abs(z) > airport.bounds.z) return airportHeight(x, z, airport);
  for (const runway of airport.runways) if (Math.abs(x - runway.x) <= runway.width / 2 && z >= runway.end && z <= runway.start) return airport.elevation + runway.surfaceHeight;
  let height = airportHeight(x, z, airport);
  for (const pavement of airport.pavements) if (Math.abs(x - pavement.x) <= pavement.width / 2 && Math.abs(z - pavement.z) <= pavement.depth / 2) height = Math.max(height, airport.elevation + pavement.surfaceHeight);
  return height;
}

function createSite(config) {
  const { length, width, side = 1, offsetZ = 0, ...metadata } = config;
  const runway = Object.freeze({ x: 0, width, shoulder: 15, start: -400 + length / 2, end: -400 - length / 2, length, center: -400, surfaceHeight: .45,
    north: config.id === 'coast' ? '36L' : '36', south: config.id === 'coast' ? '18R' : '18' });
  const hub = config.id === 'coast';
  const runways = Object.freeze(hub ? [runway, Object.freeze({ ...runway, x: HUB_LAYOUT.eastRunwayX, north: '36R', south: '18L' })] : [runway]);
  const localBuildings = structures.filter(building => building.kind !== 'city' || config.biome !== 'coast' && building.x > -1800 && building.z < 1200).map(building => ({ base: 0, ...building }));
  if (config.biome === 'desert') localBuildings.push({ kind: 'hangar', x: 700, z: 600, width: 180, depth: 190, base: 0, height: 51 });
  if (hub) localBuildings.push(
    { kind: 'terminal', x: 930, z: -500, width: 300, depth: 1700, base: 0, roofHeight: 44, height: 48 },
    { kind: 'terminal-wing', x: 930, z: 420, width: 620, depth: 100, base: 0, roofHeight: 30, height: 33 },
    ...[-1150, -850, -550, -250, 50].flatMap(z => [
      { kind: 'jetway', x: 1140, z, width: 120, depth: 10, base: 7, height: 14 },
      { kind: 'jetway', x: 1200, z, width: 14, depth: 20, base: 4, height: 16 },
    ]),
    ...[1000, 1450, 1900].map(z => ({ kind: 'hangar', x: 2600, z, width: 300, depth: 320, base: 0, height: 65 })),
    { kind: 'cargo', x: 2650, z: -1500, width: 420, depth: 600, base: 0, height: 42 },
    { kind: 'fire-station', x: 2250, z: -450, width: 150, depth: 120, base: 0, height: 22 },
    { kind: 'fuel', x: 2900, z: -700, width: 160, depth: 160, base: 0, height: 24 },
  );
  localBuildings.push(
    ...[-360, -150, 60, 270].map(z => ({ kind: 'service-vehicle', x: -195, z: z + 95, width: 4, depth: 9, base: .34, height: 3.34 })),
    ...[-380, -330].map(z => ({ kind: 'fire-truck', x: 355, z, width: 5, depth: 12, base: .34, height: 4.34 })),
    ...Array.from({ length: 18 }, (_, index) => -380 + index * 34).filter(z => config.biome !== 'coast' || Math.abs(z + 115) > 22).flatMap(z => [-880, -820, -740].map(x => ({ kind: 'parked-car', x, z: z + 15, width: 4.4, depth: 8, base: .3, height: 2.8 }))),
    ...[-1, 1].flatMap(sign => {
      const start = runway.center - offsetZ - (length + 500) / 2, end = start + length + 500;
      return (config.biome === 'coast' && sign < 0 ? [[start, -122], [-78, end]] : [[start, end]])
        .map(([a, b]) => ({ kind: 'fence', x: hub && sign > 0 ? 3200 : sign * 1010, z: (a + b) / 2, width: 1, depth: b - a, base: 0, height: 3.5 }));
    }),
  );
  const buildings = localBuildings.map(building => Object.freeze({ ...building, x: building.x * side, z: building.z + offsetZ }));
  const taxiways = [
    { x: -170, z: runway.center - offsetZ, width: 32, depth: length - 200 },
    ...[runway.start - 300, runway.center - 800, runway.end + 200].map(z => ({ x: -85, z: z - offsetZ, width: 170, depth: 30 })),
    { x: 160, z: 1250, width: 320, depth: 30 },
    ...(hub ? [
      { x: 1550, z: -400, width: 38, depth: length - 200 },
      { x: 2020, z: -400, width: 38, depth: length - 200 },
      ...[-2600, 1800].flatMap(z => [
        { x: 900, z, width: 1800, depth: 45 },
        { x: 2110, z, width: 620, depth: 45 },
      ]),
      ...[-1700, -500, 800].map(z => ({ x: 1800, z, width: 500, depth: 38 })),
    ] : []),
  ].map(item => Object.freeze({ ...item, x: item.x * side, z: item.z + offsetZ }));
  const localPavements = [
    { x: -325, z: -100, width: 310, depth: 1300, surfaceHeight: .34 },
    { x: 330, z: 850, width: 370, depth: 900, surfaceHeight: .34 },
    { x: -610, z: -100, width: 30, depth: 1150, surfaceHeight: .3 },
    { x: -790, z: -100, width: 280, depth: 700, surfaceHeight: .3 },
    { x: 490, z: -530, width: 450, depth: 850, surfaceHeight: .34 },
    { x: 272, z: 100, width: 30, depth: 1800, surfaceHeight: .34 },
    { x: -720, z: -650, width: 28, depth: 1100, surfaceHeight: .3 },
    { x: -435, z: 450, width: 380, depth: 24, surfaceHeight: .34 },
    ...(hub ? [
      { x: 1100, z: -500, width: 900, depth: 2300, surfaceHeight: .34 },
      { x: 2500, z: 0, width: 950, depth: 4600, surfaceHeight: .34 },
      { x: 1300, z: -3250, width: 3200, depth: 40, surfaceHeight: .3 },
      { x: 1300, z: 2450, width: 3200, depth: 40, surfaceHeight: .3 },
      { x: -290, z: -1800, width: 30, depth: 2900, surfaceHeight: .3 },
      { x: -290, z: 1600, width: 30, depth: 1700, surfaceHeight: .3 },
    ] : []),
  ].map(Object.freeze);
  const pavements = [...localPavements.map(item => Object.freeze({ ...item, x: item.x * side, z: item.z + offsetZ })), ...taxiways.map(item => Object.freeze({ ...item, surfaceHeight: .4 }))];
  const bounds = [...buildings, ...pavements, ...runways.map(item => ({ x: item.x, z: item.center, width: item.width, depth: item.length + 1800 }))].reduce((bounds, item) => ({ x: Math.max(bounds.x, Math.abs(item.x) + item.width / 2 + 100), z: Math.max(bounds.z, Math.abs(item.z) + item.depth / 2 + 100) }), { x: 0, z: 0 });
  const site = { ...metadata, side, offsetZ, runway, runways, buildings: Object.freeze(buildings), localBuildings: Object.freeze(localBuildings.map(Object.freeze)), taxiways: Object.freeze(taxiways), localPavements: Object.freeze(localPavements), pavements: Object.freeze(pavements), bounds: Object.freeze(bounds) };
  const positions = [[0, 180, -2000], [0, 420, -4600], [2600, 650, -6600], [5600, 650, -3400], [3200, 420, 3600], [0, 180, 3000]].map(([x, y, z]) => [x, Math.max(site.elevation + y, airportHeight(x, z, site) + 180), z]);
  site.gates = Object.freeze(positions.map(([x, y, z], index) => {
    const previous = positions[index - 1] ?? [0, site.elevation, 1000], direction = [x - previous[0], y - previous[1], z - previous[2]], distance = Math.hypot(...direction);
    return Object.freeze({ x, y, z, radius: 155, normal: Object.freeze(direction.map(value => value / distance)) });
  }));
  return Object.freeze(site);
}

export const AIRPORTS = Object.freeze([
  createSite({ id: 'coast', name: '云海国际机场', description: '双跑道枢纽 · 5 km 平行跑道与中央航站区', biome: 'coast', elevation: 0, length: HUB_LAYOUT.length, width: 60 }),
  createSite({ id: 'alpine', name: '云岭高原机场', description: '高原山谷 · 平整台地与东侧航站区', biome: 'alpine', elevation: 820, length: 3600, width: 45, side: -1, offsetZ: -280 }),
  createSite({ id: 'desert', name: '赤沙枢纽机场', description: '海拔 160 m · 沙丘盆地与扩建货运机库', biome: 'desert', elevation: 160, length: 4600, width: 60, offsetZ: 240 }),
]);
export const RUNWAY = AIRPORTS[0].runway;
export const TAXIWAYS = AIRPORTS[0].taxiways;
export const AIRPORT_BUILDINGS = AIRPORTS[0].buildings;
