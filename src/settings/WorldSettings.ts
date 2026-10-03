import { element } from '../debug/DebugUI';
import { DEFAULT_OPTIONS, minimumRoadWidth, validWorldOptions, type WorldOptions } from '../world/WorldOptions';

const fields: Record<keyof WorldOptions, [string, number?]> = {
  terrain: ['terrain-kind'], roadType: ['road-type'], roadWidth: ['road-width'], highwayRadius: ['highway-radius'], routeStyle: ['route-style'],
  roadLanes: ['road-lanes'], oneWay: ['road-one-way'],
  crossroads: ['crossroads'], crossroadInterval: ['crossroad-interval', 0.001],
  maxGrade: ['max-grade', 100], elevationMode: ['elevation-mode'], climbMin: ['climb-min'], climbMax: ['climb-max'],
  altitudeMin: ['altitude-min'], altitudeMax: ['altitude-max'], elevationDirection: ['elevation-direction'],
  mountainHeight: ['mountain-height'], mountainMin: ['mountain-min'], mountainMax: ['mountain-max'],
  mountainDensity: ['mountain-density', 100], vegetationDensity: ['vegetation-density', 100], junctions: ['junctions'], interchanges: ['interchanges'],
  terrainFollow: ['terrain-follow', 100], bridgeHeight: ['bridge-height'], landmarkBridges: ['landmark-bridges'],
  landmarkMin: ['landmark-min', 0.001], landmarkMax: ['landmark-max', 0.001], landmarkLength: ['landmark-length'], landmarkClearance: ['landmark-clearance'],
};

export class WorldSettings {
  private readonly events = new AbortController();
  private applied: Readonly<WorldOptions> = DEFAULT_OPTIONS;
  constructor() {
    for (const [id] of Object.values(fields)) element(id).addEventListener('input', () => this.sync(id), { signal: this.events.signal });
    this.sync();
  }
  read(): WorldOptions {
    const value = Object.fromEntries(Object.entries(fields).map(([key, [id, scale = 1]]) => {
      const node = element<HTMLInputElement>(id), type = typeof DEFAULT_OPTIONS[key as keyof WorldOptions];
      const number = Number(node.value), steps = (number - Number(node.min || 0)) / Number(node.step || 1);
      if (type === 'number' && (!node.value.trim() || !Number.isFinite(number) || number < Number(node.min) || node.max && number > Number(node.max)
        || Math.abs(steps - Math.round(steps)) > 1e-7)) {
        if (node.disabled) return [key, this.applied[key as keyof WorldOptions]];
        throw new Error('道路宽度、高度与密度数值必须在允许范围内。');
      }
      return [key, type === 'boolean' ? node.checked : type === 'number' ? Number(node.value) / scale : node.value];
    }));
    for (const prefix of ['climb', 'altitude', 'mountain', 'landmark'] as const) {
      const min = `${prefix}Min` as const, max = `${prefix}Max` as const;
      if (element<HTMLInputElement>(`${prefix}-min`).disabled && Number(value[min]) > Number(value[max])) {
        value[min] = this.applied[min]; value[max] = this.applied[max];
      }
    }
    if (!validWorldOptions(value)) throw new Error('请检查道路宽度、车道与高度范围；车道不能过窄，上限不能低于下限。');
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
  sync(changed?: string): void {
    const type = element<HTMLSelectElement>('road-type').value as WorldOptions['roadType'];
    const oneWay = element<HTMLInputElement>('road-one-way').checked, lanes = element<HTMLSelectElement>('road-lanes');
    element<HTMLInputElement>('crossroads').disabled = type === 'highway' || oneWay;
    element<HTMLInputElement>('crossroad-interval').disabled = type === 'highway' || oneWay || !element<HTMLInputElement>('crossroads').checked;
    for (const option of lanes.options) option.disabled = type === 'highway' ? Number(option.value) > 3 : !oneWay && Number(option.value) % 2 !== 0;
    if (lanes.selectedOptions[0]?.disabled) lanes.value = '2';
    const width = element<HTMLInputElement>('road-width'), min = minimumRoadWidth(type, Number(lanes.value));
    if (['road-type', 'road-one-way', 'road-lanes'].includes(changed ?? '') && Number(width.value) < min) width.value = String(min);
    width.setCustomValidity(Number(width.value) < min ? `此布局至少需要 ${min} 米宽路面。` : '');
    element('road-lanes-label').textContent = type === 'highway' && !oneWay ? '每个方向的车道数' : '总车道数';
    element('road-width-help').textContent = `5–12 米，步进 0.5 米，不含路肩；${type === 'highway' && !oneWay ? '每个方向单独计算，中央分隔带 4 米。' : '单幅路面总宽。'}当前布局至少 ${min} 米。`;
    const radius = element<HTMLInputElement>('highway-radius');
    radius.disabled = element<HTMLSelectElement>('road-type').value !== 'highway';
    element('highway-radius-value').textContent = `${radius.value} m${radius.disabled ? ' · 仅高速生效' : ''}`;
    for (const id of ['max-grade', 'mountain-density', 'vegetation-density', 'terrain-follow']) element(`${id}-value`).textContent = `${element<HTMLInputElement>(id).value}%`;
    for (const id of ['bridge-height', 'landmark-length', 'landmark-clearance']) element(`${id}-value`).textContent = `${element<HTMLInputElement>(id).value} m`;
    const landmarks = element<HTMLInputElement>('landmark-bridges').checked;
    for (const id of ['landmark-min', 'landmark-max', 'landmark-length', 'landmark-clearance']) element<HTMLInputElement>(id).disabled = !landmarks;
    element<HTMLInputElement>('landmark-max').setCustomValidity(landmarks && Number(element<HTMLInputElement>('landmark-min').value) > Number(element<HTMLInputElement>('landmark-max').value) ? '上限不能低于下限。' : '');
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
