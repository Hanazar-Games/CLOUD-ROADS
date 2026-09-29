import { describe, expect, it } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { BiomeSystem } from '../src/biome/BiomeSystem';
import { SeasonState } from '../src/season/SeasonState';
import { SunSystem } from '../src/atmosphere/SunSystem';
import { WeatherSystem } from '../src/atmosphere/WeatherSystem';
import { DEFAULT_OPTIONS, surfaceGravity, validWorldOptions } from '../src/world/WorldOptions';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadSpine } from '../src/road/RoadSpine';
import { WalkingPhysics } from '../src/walking/WalkingPhysics';

describe.each(['moon', 'mars'] as const)('%s world', terrain => {
  it('streams drivable roads and rock-only chunks without seams', () => {
    const options = { ...DEFAULT_OPTIONS, terrain }, generator = new TerrainGenerator('planet', options);
    const left = generator.generate(-1, 0, 64), right = generator.generate(0, 0, 16);
    let edges = 0;
    for (let i = 0; i < left.positions.length; i += 3) if (left.positions[i] === 256) {
      const z = left.positions[i + 2];
      for (let j = 0; j < right.positions.length; j += 3) if (right.positions[j] === 0 && right.positions[j + 2] === z) {
        expect(left.positions[i + 1]).toBe(right.positions[j + 1]);
        expect(left.normals.slice(i, i + 3)).toEqual(right.normals.slice(j, j + 3)); edges++; break;
      }
    }
    expect(edges).toBeGreaterThan(8);
    expect(left.vegetation.length).toBeGreaterThan(0);
    for (let i = 5; i < left.vegetation.length; i += 7) expect(left.vegetation[i]).toBe(5);
    const road = new RoadSpine('planet', generator.height, options);
    for (let i = 0; i < 200; i++) if (road.update(-16000, 4)) break;
    expect(road.samples.at(-1)!.distance).toBeGreaterThanOrEqual(12000);
    for (const sample of road.samples) {
      expect(Number.isFinite(sample.position.y)).toBe(true);
      expect(Math.abs(sample.grade)).toBeLessThanOrEqual(options.maxGrade + 1e-6);
    }
  });
  it('generates seeded, continuous terrain at chunk boundaries and far coordinates', () => {
    const a = new HeightFunction('planet', terrain), b = new HeightFunction('planet', terrain), c = new HeightFunction('other', terrain);
    expect(validWorldOptions({ ...DEFAULT_OPTIONS, terrain })).toBe(true);
    const points = [-1e6, -2304, -256, 0, 256, 2304, 1e6];
    for (const x of points) {
      const h = a.sample(x, x * 0.73);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBe(b.sample(x, x * 0.73));
      expect(Math.abs(h - a.sample(x + 0.001, x * 0.73))).toBeLessThan(0.1);
    }
    expect(a.sample(128, 128)).not.toBe(c.sample(128, 128));
    expect(surfaceGravity(terrain)).toBeLessThan(9.81);
  });
  it('has bare rock without terrestrial seasonal snow or rain', () => {
    const biomes = new BiomeSystem('planet', terrain), season = new SeasonState(terrain);
    expect(biomes.barren).toBe(true);
    for (const y of [0, 3000, 6000]) {
      const b = biomes.sample(20, 40, y, 1);
      expect(b.weights.rock).toBe(1);
      expect(b.weights.forest + b.weights.valley + b.weights.snow + b.weights.desert).toBe(0);
      season.set('winter'); expect(season.snow(y)).toBe(0);
      expect(season.phase.value.toArray()).toEqual([0, 0, 0, 0]);
    }
    const weather = new WeatherSystem(new Scene());
    weather.setKind('storm', true); weather.setSeason(season); weather.update(0.1, new PerspectiveCamera(), 0);
    expect(weather.liquidRain).toBe(0); expect(weather.snowfall).toBe(0); expect(weather.wetness).toBe(0);
    expect(weather.rain.visible || weather.snow.visible).toBe(false);
    weather.setSeason(new SeasonState('alpine')); weather.update(0.1, new PerspectiveCamera(), 0);
    expect(weather.kind).toBe('storm'); expect(weather.profile.rain).toBeGreaterThan(0); weather.dispose();
  });
});

it('keeps walking jumps higher under reduced gravity and still lands on the surface', () => {
  const heights: number[] = [], surface = { sample: () => ({ height: 0 }), constrainWalker: () => false };
  for (const terrain of ['alpine', 'mars', 'moon'] as const) {
    const person = new WalkingPhysics(); person.gravity = 18 * surfaceGravity(terrain) / 9.81;
    person.reset(0, 0, 0, 0); let peak = 0;
    for (let i = 0; i < 1200; i++) {
      person.update(1 / 120, { forward: 0, lateral: 0, run: false, sprint: false, jump: i === 0 }, surface); peak = Math.max(peak, person.y);
    }
    expect(person.grounded).toBe(true); heights.push(peak);
  }
  expect(heights[2]).toBeGreaterThan(heights[1]); expect(heights[1]).toBeGreaterThan(heights[0]);
});

it('changes sky palettes without replacing shared uniforms and restores Earth', () => {
  const sun = new SunSystem(), color = sun.zenith, earth = color.clone();
  sun.setTerrain('moon'); expect(color).toBe(sun.zenith); expect(color.getHex()).toBe(0);
  sun.setTerrain('mars'); expect(color.r).toBeGreaterThan(color.b);
  sun.setTime(0.95); expect(sun.horizon.b).toBeGreaterThan(sun.horizon.r);
  sun.setTerrain('alpine'); sun.setTime(0.7); expect(color.equals(earth)).toBe(true);
});
