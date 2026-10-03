import { element } from '../debug/DebugUI';
import { setUserMessage } from '../i18n/DomLocalizer';
import { trafficControlFields } from './TrafficControlPanel';
import { audioChannels } from '../audio/AudioSystem';
import { trafficTuning } from '../traffic/TrafficSystem';
import { transmissionTuning } from '../vehicle/Transmission';
import { steeringTuning } from '../vehicle/VehiclePhysics';
import { graphicsControls as graphics } from '../game/GraphicsSettings';
import { roadNames, terrainNames, type WorldOptions } from '../world/WorldOptions';
import { parsePreset, PresetStore, PRESET_MAX_BYTES, type SettingRules, type SettingsPreset } from './SettingsPreset';

const controls = ['vehicle-kind', 'hud-style', 'beginner-mode', 'vehicle-energy', 'ev-regeneration', 'transmission-mode', 'vehicle-max-speed', 'vehicle-power', 'vehicle-brake', 'vehicle-steering',
  ...trafficControlFields, 'engine-response', 'music-ducking', 'steering-assist', 'steering-assist-strength', 'drift-enabled', 'custom-turning-radius', 'turning-radius', 'steering-response', 'road-grip', 'handbrake-strength', 'countersteer-assist',
  'drift-min-speed', 'drift-delay', 'stability-assist',
  'audio-resume-fade', 'audio-test-volume', 'music-recovery', 'audio-limiter-release',
  'vehicle-paint', 'driving-view', 'driving-fov', 'camera-distance', 'camera-height', 'suspension', 'suspension-damping',
  'vehicle-lights', 'light-power', 'light-range', 'vehicle-wipers', 'vehicle-windows', 'cabin-fan', 'fog-visibility', 'fridge-temperature',
  'traffic-density', 'traffic-limit', 'traffic-scenario', 'garage-density', 'garage-kind', 'garage-paint', 'garage-loading', 'garage-light', 'season-kind', 'weather-kind', 'fog-density', 'daylight', 'frame-limit', 'radio-station', 'music-style', 'music-pace', 'speed',
  ...Object.keys(trafficTuning).map(key => `traffic-${key}`), ...Object.keys(transmissionTuning).map(key => `engine-${key}`),
  ...Object.keys(steeringTuning).map(key => `steering-${key}`),
  ...audioChannels.map(([name]) => `${name}-volume`), 'horn-focus', 'cabin-isolation', 'vehicle-fog-lights'];
const toggles = ['vegetation-toggle', 'cloud-toggle', 'lights-toggle', 'audio-toggle', 'cabin-light', 'ambient-light', 'vehicle-roof', 'vehicle-fridge'];

export class PresetPanel {
  private readonly events = new AbortController();
  private readonly rules: SettingRules = {};
  private readonly store: PresetStore;
  private imported?: SettingsPreset;
  private entries: SettingsPreset[] = [];
  private importVersion = 0;
  private restoring = false;
  get applying(): boolean { return this.restoring; }

  constructor(private readonly snapshot: () => { seed: string; world: WorldOptions; factorySpeed: boolean },
    private readonly loadWorld: (preset: SettingsPreset) => void, private readonly finish: (preset: SettingsPreset) => void) {
    for (const id of [...controls, ...graphics]) {
      const node = element<HTMLInputElement | HTMLSelectElement | HTMLFieldSetElement>(id);
      this.rules[id] = node instanceof HTMLFieldSetElement ? { choices: [...node.querySelectorAll<HTMLInputElement>('input[type=radio]')].map(o => o.value) }
        : node instanceof HTMLSelectElement ? { choices: [...node.options].filter(o => !o.disabled).map(o => o.value) }
        : node.type === 'checkbox' ? { boolean: true } : { min: Number(node.min), max: Number(node.max), step: Number(node.step || 1) };
    }
    for (const id of toggles) this.rules[id] = { boolean: true };
    this.store = new PresetStore({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, this.rules);
    const options = { signal: this.events.signal };
    element('preset-save').addEventListener('click', () => this.attempt(() => {
      const preset = this.capture(); this.store.save(preset); this.refresh(preset.name);
      this.status('已保存「{name}」到本机浏览器。', { name: preset.name });
    }), options);
    element('preset-export').addEventListener('click', () => this.attempt(() => {
      const preset = this.capture(), url = URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `cloud-roads-${preset.name.replace(/[^\p{L}\p{N}_-]/gu, '_')}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.status('已导出当前设置，可在另一台设备导入。');
    }), options);
    element('preset-list').addEventListener('change', () => this.describe(), options);
    element('preset-apply').addEventListener('click', () => this.attempt(() => {
      const selected = this.selected(); if (!selected) return;
      const preset = parsePreset(JSON.stringify(selected), this.rules);
      this.apply(preset); this.status('已应用「{name}」，关闭设置后可从新起点出发。', { name: preset.name });
    }), options);
    element('preset-delete').addEventListener('click', () => this.attempt(() => {
      const selected = this.selected(); if (!selected || selected === this.imported) return;
      this.store.remove(selected.name); this.refresh(); this.status('本机预设「{name}」已删除。', { name: selected.name });
    }), options);
    element('preset-import').addEventListener('change', () => { void this.importFile(); }, options);
    element('preset-import-open').addEventListener('click', () => element<HTMLInputElement>('preset-import').click(), options);
    element('startup-save').addEventListener('click', () => this.attempt(() => {
      const preset = this.capture(); this.store.setStartup(preset);
      setUserMessage(element('startup-status'), '已保存「{name}」；下次打开自动恢复，后续调整请再次保存。', { name: preset.name });
    }), options);
    element('startup-clear').addEventListener('click', () => this.attempt(() => {
      this.store.setStartup(null); element('startup-status').textContent = '已取消启动恢复，命名预设仍保留。';
    }), options);
    this.refresh();
  }

  restoreStartup(seed?: string): boolean {
    try {
      const preset = this.store.startup(); if (!preset) return false;
      this.apply(seed ? { ...preset, seed } : preset);
      setUserMessage(element('startup-status'), `已恢复「{name}」${seed ? '，使用链接中的世界种子' : ''}。`, { name: preset.name });
      return true;
    } catch (error) { this.error(error); return false; }
  }

  private apply(preset: SettingsPreset): void {
    this.restoring = true;
    try {
      this.loadWorld(preset);
      for (const id of [...controls, ...graphics]) {
        const node = element<HTMLInputElement | HTMLSelectElement | HTMLFieldSetElement>(id), value = preset.settings[id];
        if (node instanceof HTMLFieldSetElement) {
          for (const radio of node.querySelectorAll<HTMLInputElement>('input[type=radio]')) radio.checked = radio.value === value;
        } else if (node instanceof HTMLInputElement && node.type === 'checkbox') node.checked = value as boolean;
        else node.value = String(value);
        if (controls.includes(id)) node.dispatchEvent(new Event(node instanceof HTMLFieldSetElement || node instanceof HTMLSelectElement || node.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
      }
      for (const id of toggles) {
        const node = element<HTMLButtonElement>(id);
        if ((node.getAttribute('aria-pressed') === 'true') !== preset.settings[id] && !node.disabled) node.click();
      }
      this.finish(preset);
    } finally { this.restoring = false; }
  }

  private capture(): SettingsPreset {
    const settings: SettingsPreset['settings'] = {};
    for (const id of [...controls, ...graphics]) {
      const node = element<HTMLInputElement | HTMLSelectElement | HTMLFieldSetElement>(id);
      settings[id] = node instanceof HTMLFieldSetElement ? node.querySelector<HTMLInputElement>('input:checked')!.value
        : node instanceof HTMLSelectElement ? node.value : node.type === 'checkbox' ? node.checked : Number(node.value);
    }
    for (const id of toggles) settings[id] = element(id).getAttribute('aria-pressed') === 'true';
    const preset = { format: 'cloud-roads-preset', version: 20, name: element<HTMLInputElement>('preset-name').value.trim(), ...this.snapshot(), settings };
    return parsePreset(JSON.stringify(preset), this.rules);
  }
  private async importFile(): Promise<void> {
    const input = element<HTMLInputElement>('preset-import'), file = input.files?.[0], version = ++this.importVersion;
    if (!file) return;
    try {
      if (file.size > PRESET_MAX_BYTES) throw new Error('预设文件不能超过 64 KB。');
      const preset = parsePreset(await file.text(), this.rules);
      if (version !== this.importVersion || this.events.signal.aborted) return;
      this.imported = preset; this.refresh(); element<HTMLSelectElement>('preset-list').value = 'import'; this.describe();
      this.status('已校验「{name}」。点击应用后生效，当前旅程尚未改变。', { name: preset.name });
    } catch (error) { if (version === this.importVersion && !this.events.signal.aborted) this.error(error); }
    finally { if (version === this.importVersion) input.value = ''; }
  }
  private selected(): SettingsPreset | undefined {
    const value = element<HTMLSelectElement>('preset-list').value;
    return value === 'import' ? this.imported : value === '' ? undefined : this.entries[Number(value)];
  }
  private refresh(name?: string): void {
    try { this.entries = this.store.list(); } catch (error) { this.entries = []; this.error(error); }
    const select = element<HTMLSelectElement>('preset-list');
    const namedOption = (name: string, value: string) => { const option = new Option(name, value); option.translate = false; return option; };
    select.replaceChildren(...this.entries.map((preset, i) => namedOption(preset.name, String(i))));
    if (this.imported) {
      const preview = new Option('', 'import');
      setUserMessage(preview, '导入预览 · {name}', { name: this.imported.name }); select.add(preview);
    }
    if (!select.options.length) select.add(new Option('尚无预设', ''));
    if (name) select.value = String(this.entries.findIndex(p => p.name === name));
    this.describe();
  }
  private describe(): void {
    const preset = this.selected();
    element<HTMLButtonElement>('preset-apply').disabled = !preset;
    element<HTMLButtonElement>('preset-delete').disabled = !preset || preset === this.imported;
    if (preset) element<HTMLInputElement>('preset-name').value = preset.name;
    setUserMessage(element('preset-summary'), preset ? `${terrainNames[preset.world.terrain]} · ${roadNames[preset.world.roadType]} · 种子 {seed} · 应用将返回起点` : '保存当前设置，或选择一个 JSON 文件导入。', { seed: preset?.seed ?? '' });
  }
  private status(message: string, values?: Record<string, string>): void { setUserMessage(element('preset-status'), message, values); }
  private error(error: unknown): void { this.status(`操作未完成：${error instanceof Error ? error.message : String(error)} 可使用 JSON 导入导出。`); }
  private attempt(action: () => void): void { try { action(); } catch (error) { this.error(error); } }
  dispose(): void { this.events.abort(); this.importVersion++; }
}
