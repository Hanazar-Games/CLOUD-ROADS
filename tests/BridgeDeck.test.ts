import { MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { BridgeDeck } from '../src/bridge/BridgeDeck';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { roadFrame } from '../src/road/RoadFrame';
import { bridgeDeckDepth } from '../src/bridge/BridgeProfile';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it('scales box girders to each carriageway while keeping a substantial slab', () => {
  const depths = [6, 8, 10].map(roadWidth => bridgeDeckDepth({ ...DEFAULT_OPTIONS, roadWidth }));
  expect(depths[0]).toBeGreaterThan(1.5); expect(depths[2]).toBeLessThan(2.7);
  expect(depths[0]).toBeLessThan(depths[1]); expect(depths[1]).toBeLessThan(depths[2]);
  expect(bridgeDeckDepth({ ...DEFAULT_OPTIONS, roadType: 'highway' })).toBe(depths[1]);
});

it('follows banked bend joints without cracks, overlap ridges or missing soffits', () => {
  const start = new RoadGenerator('joint', { sample: () => 200 }).start;
  const segment = new RoadSegment(start, -Math.PI * 5 / 6, 0.06, 144, 'hairpin');
  const samples = Array.from({ length: 49 }, (_, i) => segment.sample(i / 48));
  const span = { start: samples[0], end: samples.at(-1)!, samples, depth: 180, openStart: false, openEnd: false };
  const material = new MeshStandardMaterial(), deck = new BridgeDeck(material);
  deck.rebuild([span], 0, 0); deck.updateMatrixWorld(true);
  const ray = new Raycaster();
  for (let i = 1; i < samples.length - 1; i++) for (const offset of [-4, 0, 4]) {
    const a = samples[i - 1], b = samples[i], ar = roadFrame(a).right, br = roadFrame(b).right;
    const x = (a.position.x + ar.x * offset) * 0.01 + (b.position.x + br.x * offset) * 0.99;
    const z = (a.position.z + ar.z * offset) * 0.01 + (b.position.z + br.z * offset) * 0.99;
    const y = (a.position.y + ar.y * offset) * 0.01 + (b.position.y + br.y * offset) * 0.99;
    ray.set(new Vector3(x, y + 2, z), new Vector3(0, -1, 0));
    const top = ray.intersectObject(deck)[0];
    expect(top).toBeDefined(); expect(y - top.point.y).toBeGreaterThan(0.025); expect(y - top.point.y).toBeLessThan(0.07);
    ray.set(new Vector3(x, y - 6, z), new Vector3(0, 1, 0));
    const bottom = ray.intersectObject(deck)[0];
    expect(bottom).toBeDefined(); expect(top.point.y - bottom.point.y).toBeGreaterThan(0.45);
  }
  const buffer = deck.geometry.getAttribute('position');
  deck.rebuild([span], 0, 0);
  expect(deck.geometry.getAttribute('position')).toBe(buffer);
  const previous = deck.geometry, dispose = vi.fn();
  previous.addEventListener('dispose', dispose);
  deck.rebuild(Array.from({ length: 4 }, () => span), 0, 0);
  expect(dispose).toHaveBeenCalledOnce();
  expect(deck.geometry).not.toBe(previous);
  expect(deck.geometry.drawRange.count).toBeGreaterThan(previous.drawRange.count);
  deck.rebuild([], 0, 0); expect(deck.geometry.drawRange.count).toBe(0);
  deck.geometry.dispose(); material.dispose();
});
