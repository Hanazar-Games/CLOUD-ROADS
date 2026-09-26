import { element } from '../debug/DebugUI';
import { DEFAULT_OPTIONS, validWorldOptions, type WorldOptions } from '../world/WorldOptions';

const fields: Record<keyof WorldOptions, [string, number?]> = {
  terrain: ['terrain-kind'], roadType: ['road-type'], roadWidth: ['road-width'], highwayRadius: ['highway-radius'], routeStyle: ['route-style'],
  maxGrade: ['max-grade', 100], elevationMode: ['elevation-mode'], climbMin: ['climb-min'], climbMax: ['climb-max'],
  altitudeMin: ['altitude-min'], altitudeMax: ['altitude-max'], elevationDirection: ['elevation-direction'],
  mountainHeight: ['mountain-height'], mountainMin: ['mountain-min'], mountainMax: ['mountain-max'],
  mountainDensity: ['mountain-density', 100], vegetationDensity: ['vegetation-density', 100], junctions: ['junctions'], interchanges: ['interchanges'],
};

export class WorldSettings {
  private readonly events = new AbortController();
  private applied: Readonly<WorldOptions> = DEFAULT_OPTIONS;
  constructor() {
    for (const [id] of Object.values(fields)) element(id).addEventListener('input', () => this.sync(), { signal: this.events.signal });
    this.sync();
  }
  read(): WorldOptions {
    const value = Object.fromEntries(Object.entries(fields).map(([key, [id, scale = 1]]) => {
      const node = element<HTMLInputElement>(id), type = typeof DEFAULT_OPTIONS[key as keyof WorldOptions];
      const number = Number(node.value), steps = (number - Number(node.min || 0)) / Number(node.step || 1);
      if (type === 'number' && (!node.value.trim() || !Number.isFinite(number) || number < Number(node.min) || node.max && number > Number(node.max)
        || Math.abs(steps - Math.round(steps)) > 1e-7)) {
        if (node.disabled) return [key, this.applied[key as keyof WorldOptions]];
        throw new Error('高度与密度数值必须在允许范围内。');
      }
      return [key, type === 'boolean' ? node.checked : type === 'number' ? Number(node.value) / scale : node.value];
    }));
    for (const prefix of ['climb', 'altitude', 'mountain'] as const) {
      const min = `${prefix}Min` as const, max = `${prefix}Max` as const;
      if (element<HTMLInputElement>(`${prefix}-min`).disabled && Number(value[min]) > Number(value[max])) {
        value[min] = this.applied[min]; value[max] = this.applied[max];
      }
    }
    if (!validWorldOptions(value)) throw new Error('请检查海拔、爬升和山脉范围：上限不能低于下限，所有数值必须在允许范围内。');
    return value;
  }
  write(value: Readonly<WorldOptions>): void {
    this.applied = value;
    for (const [key, [id, scale = 1]] of Object.entries(fields)) {
      const v = value[key as keyof WorldOptions], node = element<HTMLInputElement>(id);
      if (typeof v === 'boolean') node.checked = v;
      else node.value = String(typeof v === 'number' ? v * scale : v);
    }
    this.sync();
  }
  sync(): void {
    const radius = element<HTMLInputElement>('highway-radius');
    radius.disabled = element<HTMLSelectElement>('road-type').value !== 'highway';
    element('highway-radius-value').textContent = `${radius.value} m${radius.disabled ? ' · 仅高速生效' : ''}`;
    for (const id of ['max-grade', 'mountain-density', 'vegetation-density']) element(`${id}-value`).textContent = `${element<HTMLInputElement>(id).value}%`;
    const mode = element<HTMLSelectElement>('elevation-mode').value, absolute = mode === 'fixed' || mode === 'random';
    element<HTMLSelectElement>('elevation-direction').disabled = !absolute;
    for (const [prefix, enabled] of [['climb', mode === 'cycles'], ['altitude', absolute], ['mountain', element<HTMLSelectElement>('mountain-height').value === 'range']] as const) {
      const min = element<HTMLInputElement>(`${prefix}-min`), max = element<HTMLInputElement>(`${prefix}-max`);
      min.disabled = max.disabled = !enabled;
      max.setCustomValidity(enabled && Number(min.value) > Number(max.value) ? '上限不能低于下限。' : '');
    }
  }
  dispose(): void { this.events.abort(); }
}
