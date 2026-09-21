import { PerspectiveCamera, Scene } from 'three';
import { expect, it } from 'vitest';
import { SunSystem } from '../src/atmosphere/SunSystem';
import { WeatherSystem, weatherProfiles } from '../src/atmosphere/WeatherSystem';
import { CloudSystem } from '../src/atmosphere/CloudSystem';
import { SeasonState } from '../src/season/SeasonState';

it('uses snow in cold air without rain audio or accumulating liquid wetness, and shelters both particle types', () => {
  const scene = new Scene(), weather = new WeatherSystem(scene), camera = new PerspectiveCamera(), season = new SeasonState('forest');
  camera.position.y = 800; season.set('winter'); weather.setSeason(season); weather.setKind('rain', true);
  weather.update(0.1, camera, 0);
  expect(weather.snow.visible).toBe(true); expect(weather.rain.visible).toBe(false);
  expect(weather.liquidRain).toBe(0); expect(weather.wetness).toBe(0);
  const phase = weather.phase;
  weather.update(0, camera, 0, { x: 8192, z: -8192 }); expect(weather.phase).toBe(phase);
  weather.update(0, camera, 1); expect(weather.snow.visible).toBe(false);
  season.set('summer'); weather.update(0.1, camera, 0);
  expect(weather.snow.visible).toBe(false); expect(weather.rain.visible).toBe(true); expect(weather.wetness).toBeGreaterThan(0);
  weather.dispose(); expect(scene.children).toHaveLength(0);
});

it('supports morning and night while keeping the sunset palette and shared values stable', () => {
  const sun = new SunSystem(), direction = sun.direction;
  sun.setTime(-1);
  expect(sun.label).toBe('清晨');
  expect(sun.direction.x).toBeGreaterThan(0);
  expect(sun.light.x).toBeGreaterThan(0);
  sun.setTime(1.5);
  expect(sun.label).toBe('夜晚');
  expect(sun.light.x).toBe(0);
  expect(sun.night).toBe(1);
  expect(sun.ambient.r).toBeLessThan(0.1);
  expect(sun.direction).toBe(direction);
  sun.setTime(0.7);
  expect(sun.label).toBe('金色时刻');
  expect(sun.night).toBe(0);
});

it('applies weather fog independently of cloud visibility and shelters rain inside tunnels', () => {
  const scene = new Scene(), weather = new WeatherSystem(scene), sun = new SunSystem();
  const clouds = new CloudSystem('weather', sun), camera = new PerspectiveCamera();
  camera.position.set(128, 1000, 128);
  clouds.enabled = false;
  weather.setKind('fog', true);
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile);
  expect(clouds.fog.far).toBeLessThan(500);
  weather.setKind('rain', true);
  weather.update(1, camera, 0);
  expect(weather.rain.visible).toBe(true);
  const phase = weather.phase;
  weather.update(0, camera, 0);
  expect(weather.phase).toBe(phase);
  weather.update(1, camera, 1);
  expect(weather.rain.visible).toBe(false);
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile, 1);
  expect(clouds.fog.far).toBeGreaterThan(1000);
  weather.setKind('clear', true);
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile);
  expect([clouds.fog.near, clouds.fog.far]).toEqual([1000, 1950]);
  weather.dispose(); clouds.dispose();
  expect(scene.children).toHaveLength(0);
});

it('transitions rain and fog smoothly, retains wet grip after rain, and freezes weather when paused', () => {
  const scene = new Scene(), weather = new WeatherSystem(scene), camera = new PerspectiveCamera();
  weather.setKind('storm');
  expect(weather.profile.rain).toBe(0);
  weather.update(0.1, camera, 0);
  expect(weather.profile.rain).toBeGreaterThan(0);
  expect(weather.profile.rain).toBeLessThan(weatherProfiles.storm.rain);
  const snapshot = { ...weather.profile }, wetness = weather.wetness;
  weather.update(0, camera, 0);
  expect(weather.profile).toEqual(snapshot); expect(weather.wetness).toBe(wetness);
  for (let i = 0; i < 600; i++) weather.update(1 / 60, camera, 0);
  expect(weather.wetness).toBeGreaterThan(0.8);
  weather.setKind('clear');
  for (let i = 0; i < 300; i++) weather.update(1 / 60, camera, 0);
  expect(weather.rain.visible).toBe(false); expect(weather.wetness).toBeGreaterThan(0.5);
  weather.setKind('fog', true);
  weather.setFogDensity(2, true);
  expect(weather.profile.far).toBeCloseTo(weatherProfiles.fog.far / 2);
  const clouds = new CloudSystem('weather', new SunSystem()); clouds.enabled = false;
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile, 0, 1024);
  expect(clouds.fog.far).toBeLessThan(250);
  weather.setFogDensity(0.5, true); weather.setKind('clear', true);
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile, 0, 1024);
  expect(clouds.fog.far).toBeLessThanOrEqual(1950 / 2);
  weather.dispose(); clouds.dispose();
});
