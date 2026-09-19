import { PerspectiveCamera, Scene } from 'three';
import { expect, it } from 'vitest';
import { SunSystem } from '../src/atmosphere/SunSystem';
import { WeatherSystem } from '../src/atmosphere/WeatherSystem';
import { CloudSystem } from '../src/atmosphere/CloudSystem';

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
  weather.setKind('fog');
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile);
  expect(clouds.fog.far).toBeLessThan(500);
  weather.setKind('rain');
  weather.update(1, camera, 0);
  expect(weather.rain.visible).toBe(true);
  const phase = weather.phase;
  weather.update(0, camera, 0);
  expect(weather.phase).toBe(phase);
  weather.update(1, camera, 1);
  expect(weather.rain.visible).toBe(false);
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile, 1);
  expect(clouds.fog.far).toBeGreaterThan(1000);
  weather.setKind('clear');
  clouds.update(0, camera, { x: 0, z: 0 }, weather.profile);
  expect([clouds.fog.near, clouds.fog.far]).toEqual([1000, 1950]);
  weather.dispose(); clouds.dispose();
  expect(scene.children).toHaveLength(0);
});
