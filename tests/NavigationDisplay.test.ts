import { expect, it } from 'vitest';
import { NavigationDisplay } from '../src/vehicle/NavigationDisplay';
import { buildNavigation } from '../src/road/NavigationMap';

it('uploads only changed navigation artwork and clears the previous route during regeneration', () => {
  const screen = new NavigationDisplay();
  const samples = [0, 100, 200].map(distance => ({ distance, position: { x: 0, y: 0, z: -distance }, heading: 0, grade: 0 }));
  const map = buildNavigation({ samples, bridges: [], tunnels: [], services: [], junctions: [], passes: [] },
    samples[0], { x: 0, y: 0, z: 0, heading: 0, speed: 0 }, 8)!;
  screen.update(map); const version = screen.texture.version;
  screen.update(map); expect(screen.texture.version).toBe(version);
  expect(screen.root.userData.navigation.status).toBe('route');
  screen.update(undefined);
  expect(screen.texture.version).toBe(version + 1);
  expect(screen.root.userData.navigation).toEqual({ status: 'loading', points: 0 });
  screen.dispose();
});
