export const suspensionLevels = [1, 2, 3, 4, 5] as const;
export type Suspension = typeof suspensionLevels[number];
export const suspensionNames: Record<Suspension, string> = { 1: '1 档 · 柔软', 2: '2 档 · 舒适', 3: '3 档 · 均衡', 4: '4 档 · 支撑', 5: '5 档 · 硬朗' };
export interface WheelPoint { x: number; along: number; steer: boolean }
export function vehicleOffset(x: number, along: number, pitch: number, roll: number): { x: number; y: number; z: number } {
  return { x: x * Math.cos(roll), y: x * Math.sin(roll) * Math.cos(pitch) + along * Math.sin(pitch),
    z: x * Math.sin(roll) * Math.sin(pitch) - along * Math.cos(pitch) };
}
export interface TrailerConfig { body: 'box' | 'flatbed' | 'stake'; length: number; wheelbase: number; hitchAlong: number; front: number; wheels: readonly WheelPoint[] }
export interface VehicleProfile {
  name: string; shape: 'roadster' | 'sedan' | 'supercar' | 'suv' | 'truck' | 'tractor' | 'bus' | 'motorcycle' | 'flatbed' | 'crane';
  length: number; chassisLength: number; width: number; height: number; mass: number;
  power: number; force: number; maxSpeed: number; reverseSpeed: number; brake: number; drag: number;
  radius: number; rest: number; travel: number; suspensionRate: number; cg: number; steer: number; steerRate: number;
  wheels: readonly WheelPoint[]; eye: { x: number; y: number; along: number }; paint: number;
  trailers?: readonly TrailerConfig[];
  body?: 'hatchback' | 'wagon' | 'pickup' | 'van' | 'camper' | 'ambulance' | 'firetruck' | 'dumptruck' | 'tanker' | 'sprinkler' | 'citybus' | 'coupe' | 'rally' | 'limousine' | 'expedition' | 'schoolbus' | 'shuttle' | 'mixer' | 'garbage' | 'refrigerated' | 'towtruck';
  bus?: { rows: readonly number[]; deckHeight: number };
  edition?: 'taxi' | 'surf' | 'patrol' | 'parcel' | 'adventure' | 'panorama' | 'livestock' | 'logging' | 'maintenance' | 'touring';
}
const axles = (track: number, positions: number[], steeringAxles = 1): WheelPoint[] => positions.flatMap((along, axle) =>
  [-1, 1].map(side => ({ x: side * track / 2, along, steer: axle < steeringAxles })));
const base = { shape: 'roadster', length: 4.2, chassisLength: 4.2, width: 1.84, height: 1.95, mass: 1250,
  power: 140000, force: 7500, maxSpeed: 48, reverseSpeed: 8, brake: 10, drag: 0.5,
  radius: 0.34, rest: 0.6, travel: 0.28, suspensionRate: 1, cg: 0.55, steer: 0.52, steerRate: 1.8,
  wheels: axles(1.64, [1.35, -1.35]), eye: { x: -0.43, y: 0.76, along: -0.2 }, paint: 0xb9cbb3 } as const;
const heavy = { ...base, width: 2.5, radius: 0.51, rest: 0.87, travel: 0.32, suspensionRate: 0.86, cg: 1.35,
  reverseSpeed: 4, brake: 7.2, drag: 5.5, steer: 0.64, steerRate: 0.9, eye: { x: -0.65, y: 1.8, along: 1.6 } };
const trailer = (length: number): TrailerConfig => {
  const wheelbase = length - 7.2;
  return { body: 'box', length: length - 3.6, wheelbase, hitchAlong: -1.8, front: 1,
    wheels: axles(2.08, length === 20 ? [-wheelbase + 1.2, -wheelbase, -wheelbase - 1.2] : [-wheelbase + 0.65, -wheelbase - 0.65]).map(w => ({ ...w, steer: false })) };
};
const fleet = {
  hatchback: { ...base, name: '都市两厢车', shape: 'sedan', body: 'hatchback', length: 3.85, chassisLength: 3.85, width: 1.72, height: 1.62, mass: 1120,
    power: 85000, force: 6100, maxSpeed: 43, rest: 0.43, radius: 0.3, cg: 0.5, drag: 0.43,
    wheels: axles(1.48, [1.19, -1.19]), eye: { x: -0.39, y: 0.7, along: -0.1 }, paint: 0xdab659 },
  wagon: { ...base, name: '长途旅行车', shape: 'suv', body: 'wagon', length: 4.85, chassisLength: 4.85, width: 1.88, height: 1.72, mass: 1750,
    power: 175000, force: 10200, maxSpeed: 55, rest: 0.45, cg: 0.57, drag: 0.56,
    wheels: axles(1.62, [1.48, -1.48]), eye: { x: -0.44, y: 0.76, along: 0 }, paint: 0x547b71 },
  pickup: { ...base, name: '四驱工具皮卡', shape: 'suv', body: 'pickup', length: 5.45, chassisLength: 5.45, width: 2.02, height: 2.08, mass: 2650,
    power: 210000, force: 15700, maxSpeed: 46, radius: 0.42, rest: 0.64, travel: 0.38, cg: 0.83, drag: 1.1,
    wheels: axles(1.76, [1.7, -1.7]), eye: { x: -0.48, y: 0.8, along: 0.45 }, paint: 0x99684b },
  van: { ...heavy, name: '城市厢式面包车', shape: 'truck', body: 'van', length: 5.8, chassisLength: 5.8, width: 2.02, height: 2.8, mass: 3100,
    power: 120000, force: 16600, maxSpeed: 40, radius: 0.36, rest: 0.57, travel: 0.28, cg: 0.95, brake: 8.5, drag: 1.8,
    wheels: axles(1.72, [1.8, -1.8]), eye: { x: -0.49, y: 1.25, along: 1.8 }, paint: 0xc9d6d5 },
  camper: { ...heavy, name: '6.4 米旅居房车', shape: 'truck', body: 'camper', length: 6.4, chassisLength: 6.4, width: 2.3, height: 3.35, mass: 4900,
    power: 150000, force: 25000, maxSpeed: 33, radius: 0.4, rest: 0.65, cg: 1.3, drag: 3.1,
    wheels: axles(1.94, [1.95, -1.95]), eye: { x: -0.55, y: 1.35, along: 2.2 }, paint: 0xe0d4b9 },
  ambulance: { ...heavy, name: '医疗救护车', shape: 'truck', body: 'ambulance', length: 6.1, chassisLength: 6.1, width: 2.15, height: 3.15, mass: 4100,
    power: 180000, force: 22000, maxSpeed: 43, radius: 0.38, rest: 0.61, cg: 1.14, brake: 8.7, drag: 2.4,
    wheels: axles(1.83, [1.85, -1.85]), eye: { x: -0.51, y: 1.3, along: 2.05 }, paint: 0xe2e4dd },
  firetruck: { ...heavy, name: '8.6 米消防救援车', shape: 'truck', body: 'firetruck', length: 8.6, chassisLength: 8.6, height: 3.65, mass: 16500,
    power: 310000, force: 90000, maxSpeed: 32, cg: 1.5, wheels: axles(2.08, [2.9, -0.95, -1.95]),
    eye: { x: -0.65, y: 1.65, along: 3.3 }, paint: 0xb9362e },
  dumptruck: { ...heavy, name: '三轴工程自卸车', shape: 'truck', body: 'dumptruck', length: 8.2, chassisLength: 8.2, height: 3.7, mass: 24500,
    power: 370000, force: 140000, maxSpeed: 26, cg: 1.6, drag: 5.7, wheels: axles(2.08, [2.7, -0.85, -1.85]),
    eye: { x: -0.65, y: 1.75, along: 3.1 }, paint: 0xd5a241 },
  tanker: { ...heavy, name: '10 米三轴罐车', shape: 'truck', body: 'tanker', length: 10, chassisLength: 10, height: 3.8, mass: 26500,
    power: 335000, force: 128000, maxSpeed: 26, cg: 1.65, drag: 4.5, steerRate: 0.78, wheels: axles(2.08, [3.5, -1.2, -2.3]),
    eye: { x: -0.65, y: 1.75, along: 4 }, paint: 0x598eac },
  citybus: { ...heavy, name: '10.5 米城市公交', shape: 'bus', body: 'citybus', length: 10.5, chassisLength: 10.5, height: 3.1, mass: 12000,
    power: 220000, force: 65000, maxSpeed: 23, radius: 0.43, rest: 0.67, cg: 1.12, drag: 3.5,
    wheels: axles(2.08, [3.2, -3.2]), eye: { x: -0.65, y: 1.35, along: 4.5 }, bus: { rows: [10], deckHeight: 0 }, paint: 0x4ca292 },
  roadster: { ...base, name: '敞篷跑车' },
  sedan: { ...base, name: '旅行轿车', shape: 'sedan', length: 4.7, chassisLength: 4.7, height: 1.65, mass: 1600,
    power: 150000, force: 8800, rest: 0.46, wheels: axles(1.6, [1.43, -1.43]), eye: { x: -0.43, y: 0.7, along: 0 }, paint: 0x769caf },
  supercar: { ...base, name: '350 极速超级跑车', shape: 'supercar', length: 4.65, chassisLength: 4.65, width: 2.02, height: 1.3, mass: 1520,
    power: 620000, force: 15000, maxSpeed: 350 / 3.6, brake: 12, drag: 0.4, rest: 0.33, travel: 0.18, cg: 0.39,
    suspensionRate: 1.2, steer: 0.46, radius: 0.34, wheels: axles(1.82, [1.38, -1.38]),
    eye: { x: -0.46, y: 0.55, along: -0.05 }, paint: 0xe26932 },
  suv: { ...base, name: '山地 SUV', shape: 'suv', length: 4.9, chassisLength: 4.9, width: 2, height: 2.05, mass: 2300,
    power: 185000, force: 12500, radius: 0.4, rest: 0.62, travel: 0.36, suspensionRate: 0.93, cg: 0.8, drag: 0.95,
    maxSpeed: 44, wheels: axles(1.72, [1.48, -1.48]), eye: { x: -0.46, y: 0.77, along: 0.05 }, paint: 0xc6ad73 },
  truck5: { ...heavy, name: '5 米轻型货车', shape: 'truck', length: 5, chassisLength: 5, width: 2.1, height: 2.95, mass: 4500,
    power: 130000, force: 22000, maxSpeed: 33, radius: 0.43, rest: 0.73, cg: 1.05, drag: 2.5,
    wheels: axles(1.75, [1.55, -1.55]), eye: { x: -0.5, y: 1.36, along: 1.4 }, paint: 0xc5d6d0 },
  truck8: { ...heavy, name: '8 米大型货车', shape: 'truck', length: 8, chassisLength: 8, height: 3.65, mass: 14500,
    power: 250000, force: 72000, maxSpeed: 28, wheels: axles(2.08, [2.6, -0.9, -1.7]),
    eye: { x: -0.65, y: 1.75, along: 3 }, paint: 0xc7815d },
  flatbed12: { ...heavy, name: '12 米平板车', shape: 'flatbed', length: 12, chassisLength: 12, height: 3.45, mass: 24000,
    power: 340000, force: 125000, maxSpeed: 27, cg: 1.2, wheels: axles(2.08, [4, 2, -2, -4], 2),
    eye: { x: -0.65, y: 1.7, along: 5 }, paint: 0x497e85 },
  crane: { ...heavy, name: '五轴重型移动吊车', shape: 'crane', length: 13.2, chassisLength: 13.2, width: 2.75, height: 4.2, mass: 48000,
    power: 600000, force: 260000, maxSpeed: 22, reverseSpeed: 3, brake: 6.8, cg: 1.7, drag: 6.8,
    steer: 0.59, steerRate: 0.72, suspensionRate: 0.95, wheels: axles(2.3, [4.8, 3.4, 0, -3.4, -4.8], 2),
    eye: { x: -0.72, y: 1.55, along: 5.6 }, paint: 0xe1ad38 },
  semi15: { ...heavy, name: '15 米半挂', shape: 'tractor', length: 15, chassisLength: 5.6, height: 3.9, mass: 36000,
    power: 420000, force: 190000, maxSpeed: 25, wheels: axles(2.08, [2.3, -0.65, -1.65]), trailers: [trailer(15)], paint: 0x657caa },
  semi20: { ...heavy, name: '20 米超长半挂', shape: 'tractor', length: 20, chassisLength: 5.6, height: 3.9, mass: 43000,
    power: 480000, force: 215000, maxSpeed: 23.5, wheels: axles(2.08, [2.3, -0.65, -1.65]), trailers: [trailer(20)], paint: 0x9d5148 },
  stake18: { ...heavy, name: '18 米高栏仓栅半挂', shape: 'tractor', length: 18, chassisLength: 5.6, height: 3.9, mass: 34000,
    power: 460000, force: 195000, maxSpeed: 27, wheels: axles(2.08, [2.3, -0.65, -1.65]),
    trailers: [{ ...trailer(18), body: 'stake', wheels: axles(2.08, [-9.6, -10.8, -12]).map(w => ({ ...w, steer: false })) }], paint: 0x51876a },
  heavySemi: { ...heavy, name: '1,020 马力重载半挂', shape: 'tractor', length: 20, chassisLength: 5.6, height: 3.9, mass: 50000,
    power: 750000, force: 310000, maxSpeed: 25, brake: 7, cg: 1.25, wheels: axles(2.08, [2.3, -0.65, -1.65]),
    trailers: [{ ...trailer(20), body: 'flatbed' }], paint: 0x974b3a },
  minibus: { ...heavy, name: '8 米小客车', shape: 'bus', length: 8, chassisLength: 8, width: 2.35, height: 3.05, mass: 7800,
    power: 160000, force: 35000, maxSpeed: 30, radius: 0.44, rest: 0.76, cg: 1.1, drag: 3.2,
    wheels: axles(1.95, [2.25, -2.25]), eye: { x: -0.61, y: 1.35, along: 3.3 }, bus: { rows: [8], deckHeight: 0 }, paint: 0xc0cbb2 },
  coach: { ...heavy, name: '12 米长途客车', shape: 'bus', length: 12, chassisLength: 12, height: 3.65, mass: 18000,
    power: 300000, force: 80000, maxSpeed: 28, wheels: axles(2.08, [3.8, -1.3, -2.5]),
    eye: { x: -0.65, y: 1.8, along: 5.2 }, bus: { rows: [13], deckHeight: 0 }, paint: 0x76a8a2 },
  coach15: { ...heavy, name: '15 米大型客车 · 16 排', shape: 'bus', length: 15, chassisLength: 15, height: 3.75, mass: 22000,
    power: 355000, force: 105000, maxSpeed: 28, cg: 1.45, wheels: axles(2.08, [5.2, -1.9, -3.3]),
    eye: { x: -0.65, y: 1.85, along: 6.7 }, bus: { rows: [16], deckHeight: 0 }, paint: 0x5379ac },
  doubleDecker: { ...heavy, name: '13.5 米双层客车 · 1F / 2F', shape: 'bus', length: 13.5, chassisLength: 13.5, height: 4.5, mass: 23500,
    power: 360000, force: 110000, maxSpeed: 25, radius: 0.45, rest: 0.72, cg: 1.9, steerRate: 0.75,
    wheels: axles(2.08, [4.75, -1.65, -3.1]), eye: { x: -0.65, y: 1.12, along: 5.85 },
    bus: { rows: [12, 12], deckHeight: 1.85 }, paint: 0xa13e46 },
  motorcycle: { ...base, name: '山路摩托车', shape: 'motorcycle', length: 2.15, chassisLength: 2.15, width: 0.8, height: 1.65, mass: 280,
    power: 48000, force: 2200, maxSpeed: 47, reverseSpeed: 1.5, brake: 9.5, drag: 0.3,
    radius: 0.32, rest: 0.47, travel: 0.22, suspensionRate: 1.12, cg: 0.62, steer: 0.5, steerRate: 2,
    wheels: [{ x: 0, along: 0.73, steer: true }, { x: 0, along: -0.73, steer: false }],
    eye: { x: 0, y: 0.91, along: 0.05 }, paint: 0xc6a065 },
} as const satisfies Record<string, VehicleProfile>;
export const vehicleProfiles = {
  ...fleet,
  taxi: { ...fleet.sedan, name: '城市巡游出租车', edition: 'taxi', mass: 1690, power: 128000, maxSpeed: 47, paint: 0xe6bc42 },
  surfWagon: { ...fleet.wagon, name: '海岸冲浪旅行车', edition: 'surf', mass: 1840, drag: 0.68, suspensionRate: 0.95, paint: 0x71b9b2 },
  patrol: { ...fleet.suv, name: '公路巡查越野车', edition: 'patrol', mass: 2350, power: 240000, force: 14200, maxSpeed: 55, paint: 0xd8deda },
  parcelVan: { ...fleet.van, name: '快递配送高顶厢车', edition: 'parcel', height: 3.05, mass: 3550, power: 135000, force: 18500, maxSpeed: 36, paint: 0xc89457 },
  adventureCamper: { ...fleet.camper, name: '太阳能远征房车', edition: 'adventure', mass: 5600, power: 195000, force: 31000, travel: 0.38, maxSpeed: 32, paint: 0xb2b990 },
  panoramicBus: { ...fleet.coach, name: '山景全景旅行客车', edition: 'panorama', mass: 19200, power: 330000, force: 86000,
    bus: { rows: [10], deckHeight: 0 }, suspensionRate: 0.8, paint: 0x729fbe },
  livestockTruck: { ...fleet.truck8, name: '通风畜牧运输车', edition: 'livestock', mass: 16800, power: 275000, force: 87000, maxSpeed: 26, paint: 0xb6baac },
  loggingTruck: { ...fleet.truck8, name: '三轴原木运输车', shape: 'flatbed', edition: 'logging', mass: 22800, power: 335000, force: 125000, maxSpeed: 25, cg: 1.55, paint: 0x577760 },
  maintenanceTruck: { ...fleet.truck5, name: '公路养护作业车', shape: 'flatbed', edition: 'maintenance', mass: 5800, power: 165000, force: 32000, maxSpeed: 28, paint: 0xe2ac37 },
  touringMotorcycle: { ...fleet.motorcycle, name: '双箱长途旅行摩托', edition: 'touring', width: 1.06, height: 1.8, mass: 365, power: 72000, force: 2900,
    maxSpeed: 53, drag: 0.4, steerRate: 1.7, travel: 0.26, paint: 0x596e9c },
  sprinkler: { ...fleet.tanker, name: '10 米道路洒水车', body: 'sprinkler', mass: 24000, power: 310000, force: 120000, maxSpeed: 25, paint: 0x6cb6b0 },
  roadTrain: { ...fleet.semi20, name: '三节公路列车 · 3 × 10 m', length: 39.4, chassisLength: 6.4, mass: 72000,
    power: 850000, force: 380000, maxSpeed: 25, reverseSpeed: 2.2, brake: 6.5, drag: 9, steerRate: 0.7,
    wheels: axles(2.08, [2.7, -0.8, -2]), eye: { x: -0.65, y: 1.8, along: 2 }, paint: 0xc59a46,
    trailers: [0, 1, 2].map(i => ({ body: 'box', length: 10, wheelbase: 8.2, hitchAlong: i ? -11.2 : -3,
      front: -0.8, wheels: axles(2.08, [-7.55, -8.85]).map(w => ({ ...w, steer: false })) })) },
  coupe: { ...fleet.sedan, name: '双门运动轿跑', body: 'coupe', length: 4.5, chassisLength: 4.5, height: 1.5, mass: 1480,
    power: 230000, force: 11200, maxSpeed: 69, rest: 0.4, travel: 0.23, cg: 0.48, steer: 0.5, paint: 0x587dba },
  rally: { ...fleet.hatchback, name: '四驱拉力赛车', body: 'rally', width: 1.86, mass: 1330, height: 1.76,
    power: 225000, force: 12400, maxSpeed: 61, radius: 0.34, rest: 0.48, travel: 0.36, cg: 0.55, suspensionRate: 1.13,
    wheels: axles(1.62, [1.19, -1.19]), eye: { ...fleet.hatchback.eye, along: 0 }, paint: 0xe3ce6a },
  limousine: { ...fleet.sedan, name: '7.2 米加长礼宾车', body: 'limousine', length: 7.2, chassisLength: 7.2, width: 1.96,
    mass: 3100, power: 260000, force: 17200, maxSpeed: 50, steerRate: 1.2, cg: 0.59, drag: 0.78,
    wheels: axles(1.7, [2.55, -2.55]), eye: { x: -0.46, y: 0.7, along: 1.45 }, paint: 0x303844 },
  expedition6: { ...fleet.suv, name: '6×6 远征越野车', body: 'expedition', length: 6.4, chassisLength: 6.4, width: 2.25,
    height: 2.7, mass: 4200, power: 295000, force: 26500, maxSpeed: 39, radius: 0.46, rest: 0.75, travel: 0.46,
    cg: 1, drag: 1.8, wheels: axles(1.92, [2.5, -0.65, -1.85]), eye: { x: -0.53, y: 0.87, along: 0.1 }, paint: 0x747e50 },
  schoolbus: { ...fleet.minibus, name: '9.5 米校车', body: 'schoolbus', length: 9.5, chassisLength: 9.5, width: 2.5, height: 3.25,
    mass: 10400, power: 195000, force: 55000, maxSpeed: 25, wheels: axles(2.08, [3, -3]),
    eye: { x: -0.65, y: 1.5, along: 3.95 }, bus: { rows: [10], deckHeight: 0 }, paint: 0xe8b43c },
  shuttle: { ...fleet.minibus, name: '6.8 米城市接驳巴士', body: 'shuttle', length: 6.8, chassisLength: 6.8, width: 2.25, height: 2.95,
    mass: 5800, power: 135000, force: 29000, maxSpeed: 27, radius: 0.39, rest: 0.68, cg: 1.03,
    wheels: axles(1.91, [1.95, -1.95]), eye: { x: -0.58, y: 1.3, along: 2.7 }, bus: { rows: [6], deckHeight: 0 }, paint: 0x83b8c5 },
  mixer: { ...fleet.dumptruck, name: '四轴混凝土搅拌车', body: 'mixer', length: 9.2, chassisLength: 9.2, height: 3.9,
    mass: 31000, power: 385000, force: 166000, maxSpeed: 25, cg: 1.7, wheels: axles(2.08, [3.3, 1.8, -1.95, -3.15], 2),
    eye: { x: -0.65, y: 1.75, along: 3.6 }, paint: 0xc6d9ce },
  garbage: { ...fleet.truck8, name: '8.2 米压缩式环卫车', body: 'garbage', length: 8.2, chassisLength: 8.2,
    mass: 19000, power: 280000, force: 104000, maxSpeed: 25, cg: 1.45, paint: 0x63a985 },
  refrigerated: { ...fleet.truck8, name: '8 米冷链厢式货车', body: 'refrigerated', mass: 15600, power: 280000, force: 82000,
    maxSpeed: 29, height: 3.85, paint: 0xdce6e3 },
  towtruck: { ...fleet.truck8, name: '8 米平台救援拖车', shape: 'flatbed', body: 'towtruck', mass: 9300, power: 245000,
    force: 65000, maxSpeed: 31, cg: 1, paint: 0xd9a63f },
} as const satisfies Record<string, VehicleProfile>;
export type VehicleKind = keyof typeof vehicleProfiles;
export function suspensionTuning(level: Suspension, profile: VehicleProfile = vehicleProfiles.roadster, damping = 1): { spring: number; damping: number } {
  const frequency = [1.3, 1.55, 1.8, 2.05, 2.3][level - 1] * profile.suspensionRate, omega = Math.PI * 2 * frequency;
  return { spring: omega * omega, damping: 2 * omega * (0.75 + level * 0.025) * Math.max(0.7, Math.min(1.3, damping)) };
}
