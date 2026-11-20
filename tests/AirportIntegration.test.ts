import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { AirportWorld } from '../src/aviation/AirportWorld';
import { AIRCRAFT, createAircraftFlight, updateAircraftFlight } from '../src/aviation/aircraft-flight.js';

describe('airports in the Cloud Roads world', () => {
  it('hands the same model between apron and flight without releasing its resources', () => {
    const height = new HeightFunction('CLOUD-AIRPORT'), airports = new AirportWorld(new Scene(), height, (x, z) => height.sample(x, z));
    const model = new Group(), gear = new Group(), geometry = new BoxGeometry();
    let disposals = 0; geometry.addEventListener('dispose', () => disposals++);
    gear.add(new Mesh(geometry, new MeshBasicMaterial())); model.add(gear); model.userData.gear = [gear];
    expect(airports.parkAircraft('a380', model)).toBe(true);
    const stand = model.position.clone();
    expect(model.parent).toBe(airports.roots[0]);
    expect(airports.takeAircraft('su30')).toBeUndefined();
    expect(airports.takeAircraft('a380')).toBe(model);
    expect(model.position.length()).toBe(0); expect(model.rotation.y).toBe(0);
    expect(model.parent).toBeNull(); expect(airports.aircraftState).toBe('idle');
    model.visible = false; gear.visible = false; model.rotation.set(.2, .4, .6);
    expect(airports.parkAircraft('a380', model)).toBe(true);
    expect(model.position).toEqual(stand); expect(model.rotation.x).toBe(0); expect(model.rotation.z).toBe(0);
    expect(model.visible).toBe(true); expect(gear.visible).toBe(true); expect(disposals).toBe(0);
    expect(airports.takeAircraft('a380')).toBe(model);
    airports.dispose(); expect(disposals).toBe(0);
    expect(airports.parkAircraft('a380', model)).toBe(false);
    geometry.dispose();
  });

  it('rejects obsolete aircraft and disposes a parked model exactly once when changing selection', () => {
    const height = new HeightFunction('CLOUD-AIRPORT'), airports = new AirportWorld(new Scene(), height, (x, z) => height.sample(x, z));
    const model = new Group(), geometry = new BoxGeometry(); model.userData.gear = [];
    model.add(new Mesh(geometry, new MeshBasicMaterial()));
    let disposals = 0; geometry.addEventListener('dispose', () => disposals++);
    airports.parkAircraft('a380', model); airports.selectAircraft('su30');
    expect(disposals).toBe(1); expect(airports.takeAircraft('a380')).toBeUndefined();
    expect(airports.parkAircraft('a380', model)).toBe(false);
    airports.dispose(); expect(disposals).toBe(1);
  });

  it('places the starting hub deterministically and preserves terrain outside airports', () => {
    const a = new HeightFunction('CLOUD-AIRPORT'), b = new HeightFunction('CLOUD-AIRPORT');
    expect(a.airports).toEqual(b.airports);
    expect(a.airports).toHaveLength(3);
    expect(a.sample(128, 128)).toBe(a.airports[0].elevation);
    for (const point of [[-5000, 128], [-5000, -1000], [12000, 8000]]) {
      expect(a.sample(point[0], point[1])).toBe(a.naturalSample(point[0], point[1]));
    }
    for (const site of a.airports) {
      expect(Number.isFinite(site.elevation)).toBe(true);
      for (const x of [-50, 0, 50]) for (const z of [-site.length / 2, 0, site.length / 2]) {
        expect(a.sample(site.x + x, site.z - 400 + z)).toBe(site.elevation);
      }
    }
  });

  it('uses the same flattened ground in terrain workers and excludes runway vegetation', () => {
    const generator = new TerrainGenerator('CLOUD-AIRPORT', DEFAULT_OPTIONS), site = generator.height.airports[0];
    const cx = Math.floor(site.x / 256), cz = Math.floor((site.z - 400) / 256);
    for (const cells of [8, 16, 64] as const) {
      const tile = generator.generate(cx, cz, cells);
      for (let i = 1; i < tile.positions.length; i += 3) expect(tile.positions[i]).toBeCloseTo(site.elevation, 3);
      expect(tile.vegetation.length).toBe(0);
    }
  });

  it('rebases airport models with the world and releases only airport resources', () => {
    const scene = new Scene(), height = new HeightFunction('CLOUD-AIRPORT');
    const airports = new AirportWorld(scene, height, (x, z) => height.sample(x, z));
    const unrelated = new Scene(); scene.add(unrelated);
    expect(airports.sites).toHaveLength(3);
    airports.update({ x: 5120, z: -5120 });
    airports.roots.forEach((root, i) => {
      expect(root.position.x).toBe(airports.sites[i].worldX - 5120);
      expect(root.position.z).toBe(airports.sites[i].worldZ + 5120);
    });
    airports.dispose();
    expect(scene.children).toEqual([unrelated]);
  });

  it('spawns every plane on both runway directions and collides with real map terrain', () => {
    const height = new HeightFunction('CLOUD-AIRPORT'), airports = new AirportWorld(new Scene(), height, (x, z) => height.sample(x, z));
    for (const aircraft of AIRCRAFT) for (const airport of airports.sites) for (const runwayDirection of ['18', '36']) {
      const flight = createAircraftFlight(aircraft.id, false, { airport, runwayDirection });
      flight.status = 'running'; updateAircraftFlight(flight, {}, 1 / 60);
      expect(flight.status).toBe('running');
      expect(flight.y).toBeCloseTo(airport.elevation + airport.runway.surfaceHeight + flight.aircraft.gearHeight);
    }
    const airport = airports.sites[0], flight = createAircraftFlight('su30', true, { airport });
    Object.assign(flight, { x: 12000, z: 8000, y: height.sample(airport.worldX + 12000, airport.worldZ + 8000) - 1, speed: 0 });
    updateAircraftFlight(flight, {}, 1 / 60);
    expect(flight.status).toBe('running');
    expect(flight.events).toContain('recovery');
    expect(flight.y).toBeGreaterThan(height.sample(airport.worldX + flight.x, airport.worldZ + flight.z) + 200);
    airports.dispose();
  });
});
