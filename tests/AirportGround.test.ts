import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { AirportWorld } from '../src/aviation/AirportWorld';
import { AIRCRAFT, createAircraftFlight, updateAircraftFlight } from '../src/aviation/aircraft-flight.js';
import { airportPavementHeight, airportSpawn } from '../src/aviation/AirportGround';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

describe('starting airport ground access', () => {
  const height = new HeightFunction('STARTING-AIRPORT');
  const airports = new AirportWorld(new Scene(), height, (x, z) => height.sample(x, z));
  const site = airports.sites[0];

  it('anchors the international airport to the original world starting road', () => {
    expect(site.worldX).toBe(4608);
    expect(site.worldZ).toBe(228);
    expect(site.runway.length).toBeGreaterThanOrEqual(4000);
    expect(height.sample(128, 128)).toBe(site.elevation);
    expect(airportPavementHeight(site, 128, 128)).toBeCloseTo(site.elevation + 1);
    for (let x = 128; x <= site.worldX - 610; x += 5) {
      const surface = airportPavementHeight(site, x, 128);
      expect(surface).toBeDefined();
      expect(surface! - site.elevation).toBeGreaterThanOrEqual(.29);
      const body = { x, y: surface!, z: 128 };
      expect(airports.constrain(body, x - 5, 128, 1, surface!, 2)).toBe(false);
    }
  });

  it('spawns outside buildings on visible pavement and blocks swept building crossings', () => {
    const spawn = airportSpawn(site);
    expect(airportPavementHeight(site, spawn.x, spawn.z)).toBeCloseTo(spawn.y);
    expect(airports.constrain({ ...spawn }, spawn.x, spawn.z, .42, spawn.y, 1.75)).toBe(false);
    const wall = site.buildings.find((building: { kind: string }) => building.kind === 'terminal')!;
    const x = site.worldX + wall.x, z = site.worldZ + wall.z;
    const body = { x: x + wall.width, y: site.elevation + .34, z };
    expect(airports.constrain(body, x - wall.width, z, .42, body.y, 1.75)).toBe(true);
    expect(body.x).toBeLessThan(x - wall.width / 2);
    const over = { x: x + wall.width, y: site.elevation + wall.height + 1, z };
    expect(airports.constrain(over, x - wall.width, z, .42, over.y, 1.75)).toBe(false);
  });

  it('lets all twelve aircraft board the apron without spawning in a building', () => {
    for (const aircraft of AIRCRAFT) {
      const flight = createAircraftFlight(aircraft.id, false, { airport: site, departure: 'apron' });
      expect(flight.x).toBe(-265);
      expect(flight.z).toBe(-295);
      expect(flight.heading).toBeCloseTo(Math.PI / 2);
      expect(flight.y).toBeCloseTo(site.elevation + .34 + aircraft.gearHeight);
      expect(flight.systems.parkingBrake).toBe(true);
      flight.status = 'running';
      for (let i = 0; i < 120; i++) updateAircraftFlight(flight, {}, 1 / 60);
      expect(flight.status).toBe('running');
      expect(flight.speed).toBeLessThan(.01);
    }
  });

  it('joins the starting road at its configured absolute elevation', () => {
    for (const elevationDirection of ['up', 'down', 'random'] as const) {
      const options = { ...DEFAULT_OPTIONS, elevationMode: 'fixed' as const, elevationDirection, altitudeMin: 600, altitudeMax: 1800 };
      const terrain = new HeightFunction('AIRPORT-ALTITUDE', 'alpine', 'mountain', options);
      const road = new RoadGenerator('AIRPORT-ALTITUDE', terrain, options);
      const airport = new AirportWorld(new Scene(), terrain, (x, z) => terrain.sample(x, z));
      expect(airport.surface(128, 128)).toBeCloseTo(road.start.position.y);
      airport.dispose();
    }
  });

  it('turns at taxi speeds and can leave the apron without clipping a jetway', () => {
    for (const id of ['a380', 'su30', 't6']) {
      const flight = createAircraftFlight(id, false, { airport: site, departure: 'apron' });
      flight.status = 'running'; flight.systems.parkingBrake = false;
      Object.assign(flight, { speed: 5, throttle: .2, engineOutput: .2 });
      for (let i = 0; i < 120; i++) updateAircraftFlight(flight, { yaw: -.65 }, 1 / 60);
      expect(flight.status).toBe('running');
      expect(Math.PI / 2 - flight.heading).toBeGreaterThan(.12);
      expect(flight.x).toBeGreaterThan(-260);
    }
  });

  it('keeps pavement height queries bounded and honors ceilings', () => {
    expect(airports.surface(site.worldX, site.worldZ + site.runway.center)).toBeCloseTo(site.elevation + .45);
    expect(airports.surface(site.worldX, site.worldZ + site.runway.center, site.elevation)).toBeUndefined();
    expect(airports.surface(1e8, 1e8)).toBeUndefined();
  });
});
