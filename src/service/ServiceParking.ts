import { hashSeed, createRng } from '../world/WorldSeed';
import { padPoint } from './ServiceTerrain';
import type { ServiceArea } from './ServicePlanner';
import { vehicleProfiles, type VehicleKind } from '../vehicle/VehicleConfig';

export interface ParkingSlot { x: number; along: number; heading: number; length: number; width: number; zone: number; kinds: readonly VehicleKind[] }
export interface ParkedEntry { id: string; slot: number; kind: VehicleKind; paint: number; x: number; y: number; z: number; heading: number; grade: number; padHeading: number }
const paints = [0xd8dedb, 0x29485e, 0x377d78, 0xa73d32, 0xdca632, 0x353d43, 0x7d658e, 0x9b7453, 0x83b3bb, 0xd4bc97];
export const PARK_HALF_WIDTH = 80, PARK_HALF_LENGTH = 110;
const slots: ParkingSlot[] = [];
for (const x of [-57, -39]) for (let along = -80; along <= 80; along += 4)
  slots.push({ x, along, heading: x < -48 ? Math.PI / 2 : -Math.PI / 2, length: 6.5, width: 3.2, zone: 0, kinds: ['roadster', 'sedan', 'suv', 'supercar', 'hatchback', 'wagon', 'pickup', 'van', 'coupe', 'rally', 'taxi', 'surfWagon', 'patrol', 'parcelVan'] });
for (const along of [-84, -61, -38, -15, 8, 31, 54, 77])
  slots.push({ x: -13, along, heading: 0, length: 19, width: 4, zone: 1, kinds: ['minibus', 'coach', 'coach15', 'doubleDecker', 'citybus', 'camper', 'limousine', 'expedition6', 'schoolbus', 'shuttle', 'adventureCamper', 'panoramicBus'] });
for (const along of [-84, -61, -38])
  slots.push({ x: 43, along, heading: 0, length: 17, width: 4.5, zone: 2, kinds: ['truck5', 'truck8', 'flatbed12', 'crane', 'ambulance', 'firetruck', 'dumptruck', 'tanker', 'sprinkler', 'mixer', 'garbage', 'refrigerated', 'towtruck', 'livestockTruck', 'loggingTruck', 'maintenanceTruck'] });
for (const along of [-84, -56, -28])
  slots.push({ x: 66, along, heading: 0, length: 25, width: 4.5, zone: 3, kinds: ['semi15', 'semi20', 'stake18', 'heavySemi'] });
for (let x = -9; x < 12; x += 1.8) slots.push({ x, along: -100, heading: 0, length: 3, width: 1.4, zone: 4, kinds: ['motorcycle', 'touringMotorcycle'] });
export const parkingSlots = (): readonly ParkingSlot[] => slots;

export function parkedAt(seed: string, site: ServiceArea): ParkedEntry[] {
  return site.ground.pads.flatMap(pad => {
    const key = `${seed}:${site.sample.routeId ?? 'root'}:${site.id}:${pad.side}`, rng = createRng(hashSeed(key)), zones = new Set<number>();
    return slots.flatMap((slot, index) => {
      const occupied = rng() < 0.48 || !zones.has(slot.zone); zones.add(slot.zone);
      const kind = slot.kinds[Math.floor(rng() * slot.kinds.length)];
      if (!occupied) return [];
      const profile = vehicleProfiles[kind], offset = (profile.length - profile.chassisLength) / 2;
      const p = padPoint(pad, slot.x * pad.side + Math.sin(slot.heading * pad.side) * offset, slot.along + Math.cos(slot.heading) * offset);
      const paint = paints[hashSeed(`${key}:${index}:paint`) % paints.length];
      return [{ ...p, id: `${key}:${index}`, slot: index, kind, paint, heading: pad.heading + slot.heading * pad.side,
        grade: pad.grade, padHeading: pad.heading }];
    });
  });
}
