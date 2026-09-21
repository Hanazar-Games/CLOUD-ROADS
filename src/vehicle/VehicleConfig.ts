export const suspensionLevels = [1, 2, 3, 4, 5] as const;
export type Suspension = typeof suspensionLevels[number];
export const suspensionNames: Record<Suspension, string> = { 1: '1 档 · 柔软', 2: '2 档 · 舒适', 3: '3 档 · 均衡', 4: '4 档 · 支撑', 5: '5 档 · 硬朗' };
export interface WheelPoint { x: number; along: number; steer: boolean }
export function vehicleOffset(x: number, along: number, pitch: number, roll: number): { x: number; y: number; z: number } {
  return { x: x * Math.cos(roll), y: x * Math.sin(roll) * Math.cos(pitch) + along * Math.sin(pitch),
    z: x * Math.sin(roll) * Math.sin(pitch) - along * Math.cos(pitch) };
}
export interface TrailerConfig { body: 'box' | 'flatbed'; length: number; wheelbase: number; hitchAlong: number; front: number; wheels: readonly WheelPoint[] }
export interface VehicleProfile {
  name: string; shape: 'roadster' | 'sedan' | 'suv' | 'truck' | 'tractor' | 'bus' | 'motorcycle' | 'flatbed' | 'crane';
  length: number; chassisLength: number; width: number; height: number; mass: number;
  power: number; force: number; maxSpeed: number; reverseSpeed: number; brake: number; drag: number;
  radius: number; rest: number; travel: number; suspensionRate: number; cg: number; steer: number; steerRate: number;
  wheels: readonly WheelPoint[]; eye: { x: number; y: number; along: number }; paint: number;
  trailer?: TrailerConfig;
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
export const vehicleProfiles = {
  roadster: { ...base, name: '敞篷跑车' },
  sedan: { ...base, name: '旅行轿车', shape: 'sedan', length: 4.7, chassisLength: 4.7, height: 1.65, mass: 1600,
    power: 150000, force: 8800, rest: 0.46, wheels: axles(1.6, [1.43, -1.43]), eye: { x: -0.43, y: 0.7, along: -0.2 }, paint: 0x769caf },
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
    power: 420000, force: 190000, maxSpeed: 25, wheels: axles(2.08, [2.3, -0.65, -1.65]), trailer: trailer(15), paint: 0x657caa },
  semi20: { ...heavy, name: '20 米超长半挂', shape: 'tractor', length: 20, chassisLength: 5.6, height: 3.9, mass: 43000,
    power: 480000, force: 215000, maxSpeed: 23.5, wheels: axles(2.08, [2.3, -0.65, -1.65]), trailer: trailer(20), paint: 0x9d5148 },
  heavySemi: { ...heavy, name: '1,020 马力重载半挂', shape: 'tractor', length: 20, chassisLength: 5.6, height: 3.9, mass: 50000,
    power: 750000, force: 310000, maxSpeed: 25, brake: 7, cg: 1.25, wheels: axles(2.08, [2.3, -0.65, -1.65]),
    trailer: { ...trailer(20), body: 'flatbed' }, paint: 0x974b3a },
  minibus: { ...heavy, name: '8 米小客车', shape: 'bus', length: 8, chassisLength: 8, width: 2.35, height: 3.05, mass: 7800,
    power: 160000, force: 35000, maxSpeed: 30, radius: 0.44, rest: 0.76, cg: 1.1, drag: 3.2,
    wheels: axles(1.95, [2.25, -2.25]), eye: { x: -0.61, y: 1.35, along: 3.3 }, paint: 0xc0cbb2 },
  coach: { ...heavy, name: '12 米长途客车', shape: 'bus', length: 12, chassisLength: 12, height: 3.65, mass: 18000,
    power: 300000, force: 80000, maxSpeed: 28, wheels: axles(2.08, [3.8, -1.3, -2.5]),
    eye: { x: -0.65, y: 1.8, along: 5.2 }, paint: 0x76a8a2 },
  motorcycle: { ...base, name: '山路摩托车', shape: 'motorcycle', length: 2.15, chassisLength: 2.15, width: 0.8, height: 1.65, mass: 280,
    power: 48000, force: 2200, maxSpeed: 47, reverseSpeed: 1.5, brake: 9.5, drag: 0.3,
    radius: 0.32, rest: 0.47, travel: 0.22, suspensionRate: 1.12, cg: 0.62, steer: 0.5, steerRate: 2,
    wheels: [{ x: 0, along: 0.73, steer: true }, { x: 0, along: -0.73, steer: false }],
    eye: { x: 0, y: 0.91, along: 0.05 }, paint: 0xc6a065 },
} as const satisfies Record<string, VehicleProfile>;
export type VehicleKind = keyof typeof vehicleProfiles;
export function suspensionTuning(level: Suspension, profile: VehicleProfile = vehicleProfiles.roadster, damping = 1): { spring: number; damping: number } {
  const frequency = [1.3, 1.55, 1.8, 2.05, 2.3][level - 1] * profile.suspensionRate, omega = Math.PI * 2 * frequency;
  return { spring: omega * omega, damping: 2 * omega * (0.75 + level * 0.025) * Math.max(0.7, Math.min(1.3, damping)) };
}
