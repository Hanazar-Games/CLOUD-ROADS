import { describe, expect, it } from 'vitest';
import { SeasonState } from '../src/season/SeasonState';
import { VegetationMesh } from '../src/vegetation/VegetationMesh';
import { Scene, InstancedMesh, BufferAttribute } from 'three';
import { RoadMesh } from '../src/road/RoadMesh';
import { RoadSpine } from '../src/road/RoadSpine';

describe('seasonal climate', () => {
  it('keeps both edges of a streamed tunnel interior free of seasonal snow', () => {
    const scene = new Scene(), mesh = new RoadMesh(scene), road = new RoadSpine('covered-window', { sample: () => 100 });
    while (!road.update(0)) { /* Complete the local route. */ }
    const samples = road.samples, start = samples[0], end = samples.at(-1)!;
    mesh.update(road, 0, 0, true, [], [{ start, end, samples, openStart: true, openEnd: true }]);
    const exposure = mesh.mesh.geometry.getAttribute('seasonExposure') as BufferAttribute;
    expect(exposure.getX(0)).toBe(0); expect(exposure.getX((samples.length - 1) * 2)).toBe(0);
    mesh.dispose();
  });

  it('keeps tunnel road vertices sheltered while exposing the open approaches', () => {
    const scene = new Scene(), mesh = new RoadMesh(scene), road = new RoadSpine('season', { sample: () => 100 });
    while (!road.update(0)) { /* Complete the local route. */ }
    const start = road.samples[90], end = road.samples[110];
    mesh.update(road, 0, 0, true, [], [{ start, end, samples: road.samples.slice(90, 111) }]);
    const exposure = mesh.mesh.geometry.getAttribute('seasonExposure') as BufferAttribute;
    expect(exposure.getX(80 * 2)).toBe(1); expect(exposure.getX(100 * 2)).toBe(0);
    const version = exposure.version;
    mesh.update(road, 8192, -8192, true, [], [{ start, end, samples: road.samples.slice(90, 111) }]);
    expect(exposure.version).toBe(version);
    mesh.dispose();
  });
  it('keeps warm deserts dry and makes cold winter roads slippery, except inside tunnels', () => {
    const forest = new SeasonState('forest'), desert = new SeasonState('desert');
    const summer = forest.grip(800);
    forest.set('winter'); desert.set('winter');
    expect(forest.temperature(800)).toBeLessThan(0);
    expect(forest.snow(800)).toBeGreaterThan(0.8);
    expect(forest.grip(800)).toBeLessThan(summer * 0.7);
    expect(forest.grip(800, true)).toBe(1);
    expect(desert.snow(0)).toBe(0);
    expect(desert.snow(2000)).toBeLessThan(forest.snow(2000));
    forest.set('summer'); expect(forest.grip(800)).toBe(summer);
  });

  it('changes tree geometry and flower cover without moving trees or regenerating chunks', () => {
    const scene = new Scene(), season = new SeasonState('forest'), plants = new VegetationMesh(scene);
    plants.setSeason(season);
    plants.setChunk('0,0', 0, 0, new Float32Array([50, 800, 50, 1, 0, 2, 1, 70, 800, 60, 1, 0, 8, 1]));
    plants.update(0, 0);
    const tree = scene.children.find(mesh => mesh.name === 'vegetation-broadleaf') as InstancedMesh;
    const geometry = tree.geometry, matrix = tree.instanceMatrix.array.slice();
    season.set('winter'); plants.setSeason(season); plants.update(0, 0);
    expect(tree.geometry).not.toBe(geometry);
    expect(tree.geometry.getAttribute('position').count).toBeLessThan(geometry.getAttribute('position').count);
    expect(tree.instanceMatrix.array).toEqual(matrix);
    expect(scene.children.filter(mesh => mesh.name === 'vegetation-flowers').every(mesh => !mesh.visible)).toBe(true);
    season.set('spring'); plants.setSeason(season); plants.update(0, 0);
    expect(tree.instanceMatrix.array).toEqual(matrix);
    expect(scene.children.some(mesh => mesh.name === 'vegetation-flowers' && mesh.visible)).toBe(true);
    plants.dispose(); expect(scene.children).toHaveLength(0);
  });
});
