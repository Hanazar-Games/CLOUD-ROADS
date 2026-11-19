import { constrainObstacle } from '../service/ServiceCollision';

export interface AirportGroundSite {
  id: string; worldX: number; worldZ: number; elevation: number;
  runways: readonly { x: number; width: number; start: number; end: number; surfaceHeight: number }[];
  bounds: { x: number; z: number };
  pavements: readonly { x: number; z: number; width: number; depth: number; surfaceHeight: number }[];
  buildings: readonly { x: number; z: number; width: number; depth: number; base: number; height: number }[];
}

export const AIRPORT_STAND = Object.freeze({ x: -265, z: -295 });
export const AIRPORT_ACCESS = Object.freeze({ start: -4480, ramp: -4380, end: -610, z: -100, halfWidth: 10 });

export function airportPavementHeight(site: AirportGroundSite, x: number, z: number): number | undefined {
  x -= site.worldX; z -= site.worldZ;
  let surface: number | undefined;
  for (const runway of site.runways) if (Math.abs(x - runway.x) <= runway.width / 2 && z >= runway.end && z <= runway.start) surface = runway.surfaceHeight;
  for (const pad of site.pavements) if (Math.abs(x - pad.x) <= pad.width / 2 && Math.abs(z - pad.z) <= pad.depth / 2)
    surface = Math.max(surface ?? -Infinity, pad.surfaceHeight);
  const access = AIRPORT_ACCESS;
  if (site.id === 'coast' && x >= access.start && x <= access.end && Math.abs(z - access.z) <= access.halfWidth)
    surface = Math.max(surface ?? -Infinity, .3 + .7 * Math.max(0, (access.ramp - x) / (access.ramp - access.start)));
  return surface === undefined ? undefined : site.elevation + surface;
}

export function airportSpawn(site: AirportGroundSite) {
  return { x: site.worldX + AIRPORT_STAND.x - 45, y: site.elevation + .34, z: site.worldZ + AIRPORT_STAND.z + 95, heading: .44 };
}

export function constrainAirport(site: AirportGroundSite, body: { x: number; z: number }, previousX: number, previousZ: number,
  radius: number, feet: number, height: number): boolean {
  if (Math.max(body.x, previousX) < site.worldX - site.bounds.x || Math.min(body.x, previousX) > site.worldX + site.bounds.x
    || Math.max(body.z, previousZ) < site.worldZ - site.bounds.z || Math.min(body.z, previousZ) > site.worldZ + site.bounds.z) return false;
  let hit = false;
  for (const building of site.buildings) {
    if (feet >= site.elevation + building.height || feet + height <= site.elevation + building.base) continue;
    hit = constrainObstacle(body, previousX, previousZ, radius, { x: site.worldX + building.x, z: site.worldZ + building.z,
      heading: 0, width: building.width, front: building.depth / 2, rear: -building.depth / 2 }) || hit;
  }
  return hit;
}
