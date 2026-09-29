import { expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { parsePreset, validatePreset, PresetStore, type SettingRules } from '../src/settings/SettingsPreset';

const rules: SettingRules = { 'vehicle-kind': { choices: ['roadster', 'crane'] }, 'hud-style': { choices: ['digital', 'dial', 'minimal'] },
  'steering-assist': { boolean: true }, 'vehicle-max-speed': { min: 20, max: 400 } };
const preset = () => ({ format: 'cloud-roads-preset', version: 9, name: '雨中山路', seed: 'preset-seed', world: { ...DEFAULT_OPTIONS },
  factorySpeed: true, settings: { 'vehicle-kind': 'crane', 'hud-style': 'dial', 'steering-assist': false, 'vehicle-max-speed': 79 } });

it('round-trips settings without runtime position, speed, mileage or device consumption', () => {
  const data = preset(); expect(parsePreset(JSON.stringify(data), rules)).toEqual(data);
  expect(validatePreset({ ...data, position: { x: 1, z: 2 } }, rules)).toBe(false);
  expect(validatePreset({ ...data, settings: { ...data.settings, 'vehicle-trip': 250 } }, rules)).toBe(false);
});

it('restores an explicit startup snapshot independently of named presets and safely cancels it', () => {
  const data = new Map<string, string>();
  const store = new PresetStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, rules);
  const saved = parsePreset(JSON.stringify(preset()), rules);
  expect(store.startup()).toBeUndefined(); store.save(saved); store.setStartup(saved);
  expect(store.startup()).toEqual(saved);
  store.save({ ...saved, seed: 'changed' }); expect(store.startup()!.seed).toBe(saved.seed);
  store.setStartup(null); expect(store.startup()).toBeUndefined(); expect(store.list()).toHaveLength(1);
});

it('rejects malformed, oversized, out-of-range and incomplete imports before they can apply', () => {
  for (const text of ['{bad', 'null', '[]', ' '.repeat(70000)]) expect(() => parsePreset(text, rules)).toThrow();
  for (const data of [
    { ...preset(), version: 99 }, { ...preset(), name: '' }, { ...preset(), seed: 'x'.repeat(129) },
    { ...preset(), world: { ...DEFAULT_OPTIONS, mountainMin: 2000, mountainMax: 500 } },
    { ...preset(), world: { ...DEFAULT_OPTIONS, altitudeMin: 700, altitudeMax: 100 } },
    { ...preset(), world: { ...DEFAULT_OPTIONS, vegetationDensity: 300 } },
    { ...preset(), world: { ...DEFAULT_OPTIONS, mountainDensity: 0 } },
    { ...preset(), settings: {} }, { ...preset(), settings: { ...preset().settings, 'hud-style': 'script' } },
    { ...preset(), settings: { ...preset().settings, 'vehicle-max-speed': Infinity } },
  ]) expect(validatePreset(data, rules)).toBe(false);
});

it('saves, reloads, replaces and deletes named browser presets without changing them on failed writes', () => {
  const data = new Map<string, string>(); let fail = false;
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {
    if (fail) throw new Error('Quota exceeded'); data.set(key, value);
  } };
  const store = new PresetStore(storage, rules), a = parsePreset(JSON.stringify(preset()), rules);
  store.save(a); expect(new PresetStore(storage, rules).list()).toEqual([a]);
  store.save({ ...a, seed: 'changed' }); expect(store.list()).toHaveLength(1);
  fail = true; expect(() => store.save({ ...a, name: 'another' })).toThrow(); expect(store.list()).toHaveLength(1);
  fail = false; store.remove(a.name); expect(new PresetStore(storage, rules).list()).toEqual([]);
});

it('reports corrupt storage without overwriting it or making the game depend on storage availability', () => {
  let raw = '{broken';
  const store = new PresetStore({ getItem: () => raw, setItem: (_key, value) => { raw = value; } }, rules);
  expect(() => store.list()).toThrow(); expect(raw).toBe('{broken');
  const blocked = new PresetStore({ getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } }, rules);
  expect(() => blocked.list()).toThrow();
});

it('keeps earlier preset storage untouched without blocking saves of the current settings', () => {
  const legacy = JSON.stringify([{ ...preset(), version: 2 }]);
  const data = new Map([['cloud-roads.presets.v2', legacy]]);
  const store = new PresetStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, rules);
  expect(store.list()).toEqual([]);
  const value = parsePreset(JSON.stringify(preset()), rules); store.save(value);
  expect(store.list()).toEqual([value]);
  expect(data.get('cloud-roads.presets.v2')).toBe(legacy);
  expect(() => parsePreset(JSON.stringify({ ...preset(), version: 2 }), rules)).toThrow();
});
