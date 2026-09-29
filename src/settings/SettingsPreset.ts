import { validWorldOptions, type WorldOptions } from '../world/WorldOptions';

export type SettingRule = { boolean: true } | { choices: readonly string[] } | { min: number; max: number; step?: number };
export type SettingRules = Record<string, SettingRule>;
export interface SettingsPreset {
  format: 'cloud-roads-preset'; version: 11; name: string; seed: string; world: WorldOptions;
  factorySpeed: boolean; settings: Record<string, string | number | boolean>;
}
export const PRESET_STORAGE_KEY = 'cloud-roads.presets.v11';
export const STARTUP_STORAGE_KEY = 'cloud-roads.startup.v11';
export const PRESET_MAX_BYTES = 65536;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function validatePreset(value: unknown, rules: SettingRules): value is SettingsPreset {
  if (!record(value) || Object.keys(value).sort().join() !== 'factorySpeed,format,name,seed,settings,version,world'
    || value.format !== 'cloud-roads-preset' || value.version !== 11 || typeof value.factorySpeed !== 'boolean'
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 60
    || typeof value.seed !== 'string' || !value.seed.trim() || value.seed.length > 128
    || !validWorldOptions(value.world) || !record(value.settings)) return false;
  const settings = value.settings;
  if (Object.keys(settings).length !== Object.keys(rules).length) return false;
  return Object.entries(rules).every(([key, rule]) => {
    if (!Object.hasOwn(settings, key)) return false;
    const v = settings[key];
    if ('boolean' in rule) return typeof v === 'boolean';
    if ('choices' in rule) return typeof v === 'string' && rule.choices.includes(v);
    return typeof v === 'number' && Number.isFinite(v) && v >= rule.min && v <= rule.max
      && (!rule.step || Math.abs((v - rule.min) / rule.step - Math.round((v - rule.min) / rule.step)) < 1e-7);
  });
}

export function parsePreset(text: string, rules: SettingRules): SettingsPreset {
  if (text.length > PRESET_MAX_BYTES) throw new Error('预设文件不能超过 64 KB。');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON。'); }
  if (!validatePreset(data, rules)) throw new Error('预设格式或参数范围不正确，请使用本版（格式 11）导出的 JSON。当前设置未改变。');
  return data;
}

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export class PresetStore {
  constructor(private readonly storage: StorageAccess, private readonly rules: SettingRules) {}
  startup(): SettingsPreset | undefined {
    const raw = this.storage.getItem(STARTUP_STORAGE_KEY);
    return raw === null || raw === 'null' ? undefined : parsePreset(raw, this.rules);
  }
  setStartup(preset: SettingsPreset | null): void {
    if (preset !== null && !validatePreset(preset, this.rules)) throw new Error('启动设置不完整。');
    this.storage.setItem(STARTUP_STORAGE_KEY, JSON.stringify(preset));
  }
  list(): SettingsPreset[] {
    const raw = this.storage.getItem(PRESET_STORAGE_KEY);
    if (raw === null) return [];
    if (raw.length > PRESET_MAX_BYTES * 32) throw new Error('本机预设数据过大，请先导出或清理。');
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > 32 || !data.every(p => validatePreset(p, this.rules))
      || new Set(data.map(p => p.name)).size !== data.length) throw new Error('本机预设数据不完整，原数据已保留。');
    return data;
  }
  save(preset: SettingsPreset): void {
    if (!validatePreset(preset, this.rules)) throw new Error('预设参数不正确。');
    const entries = this.list(), index = entries.findIndex(p => p.name === preset.name);
    if (index < 0) entries.push(preset); else entries[index] = preset;
    if (entries.length > 32) throw new Error('最多保存 32 个预设，请先删除不需要的预设。');
    this.storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(entries));
  }
  remove(name: string): void { this.storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(this.list().filter(p => p.name !== name))); }
}
