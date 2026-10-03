import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LanguagePreference, translate, LANGUAGE_STORAGE_KEY, catalog } from '../src/i18n/Localization';
import { messages } from '../src/i18n/Messages';
import { signalMessages } from '../src/i18n/SignalMessages';
import { additionalMessages } from '../src/i18n/AdditionalMessages';
import { interfaceMessages } from '../src/i18n/InterfaceMessages';

it('defaults to Chinese, validates saved languages and persists only the language preference', () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const preference = new LanguagePreference(storage);
  expect(preference.language).toBe('zh-CN'); expect(preference.select('ja')).toBe(true);
  expect(new LanguagePreference(storage).language).toBe('ja'); expect(values.size).toBe(1);
  expect(preference.select('invalid')).toBe(false); expect(preference.language).toBe('ja');
  values.set(LANGUAGE_STORAGE_KEY, 'invalid'); expect(new LanguagePreference(storage).language).toBe('zh-CN');
});

it('keeps language switching available when storage is blocked', () => {
  const preference = new LanguagePreference({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  expect(preference.select('en')).toBe(true); expect(preference.language).toBe('en'); expect(preference.saved).toBe(false);
});

it('translates interface labels without altering key chords, percentages or unknown text', () => {
  expect(translate('  旅程设置  ', 'en')).toBe('  Journey settings  ');
  expect(translate('旅程设置', 'ja')).toBe('旅の設定');
  expect(translate('声音已开启', 'en')).toBe('Sound enabled');
  expect(translate('Shift+F · 雾灯 · 75%', 'en')).toBe('Shift+F · Fog lights · 75%');
  expect(translate('CLOUD ROADS 123', 'ja')).toBe('CLOUD ROADS 123');
  expect(translate('声音已开启', 'zh-CN')).toBe('声音已开启');
  expect(translate('冷藏箱 · 关闭 · Shift+U', 'en')).toBe('Fridge · Off · Shift+U');
  expect(translate('动力已关闭 · · 启动', 'ja')).toBe('動力オフ · · で始動');
  expect(translate('F8 下到车外；Shift+O 在客车 / 房车中离座、就近坐下，或从货厢尾门进入。Shift+I 切换燃油 / 电动。均可在快捷键分类修改。', 'en')).toContain('F8 exits the vehicle; Shift+O');
});

it('has complete, unique translation rows', () => {
  const rows = `${messages}\n${signalMessages}\n${interfaceMessages}`.trim().split('\n'); expect(catalog.size).toBe(rows.length);
  for (const row of rows) expect(row.split('\t').every(Boolean)).toBe(true);
  const extra = additionalMessages.trim().split('\n').map(row => row.split('\t'));
  expect(new Set(extra.map(row => row[0])).size).toBe(extra.length);
  for (const row of extra) { expect(row).toHaveLength(3); expect(row.every(Boolean)).toBe(true); }
  for (const translations of catalog.values()) for (const language of ['en', 'ja', 'ko', 'es'] as const) expect(translations[language]).toBeTruthy();
});

it('persists Korean and Spanish and translates signal controls, bound keys and weather without mixing meanings', () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  for (const language of ['ko', 'es'] as const) {
    const preference = new LanguagePreference(storage); expect(preference.select(language)).toBe(true);
    expect(new LanguagePreference(storage).language).toBe(language);
    expect(translate('红绿灯与交规提醒', language)).not.toMatch(/[\u3400-\u9fff]/);
    expect(translate('动力已关闭 · F8 启动', language)).toContain('F8');
  }
  expect(translate('旅程设置', 'ko')).toBe('여정 설정'); expect(translate('旅程设置', 'es')).toBe('Ajustes del viaje');
  expect(translate('清除', 'es')).toBe('Borrar'); expect(translate('晴天', 'es')).toBe('Despejado');
  expect(translate('主路红灯 17 s · 支路红灯 19 s', 'ko')).toBe('주도로 적색 17 s · 교차 도로 적색 19 s');
});

it('covers every built-in HTML label and explanation in English, Korean and Spanish', () => {
  const html = readFileSync('index.html', 'utf8').replace(/<select id="interface-language"[\s\S]*?<\/select>/, '');
  const strings = [...html.matchAll(/>([^<>]+)</g)].map(m => m[1])
    .concat([...html.matchAll(/(?:aria-label|placeholder|data-help)="([^"]+)"/g)].map(m => m[1]));
  for (const language of ['en', 'ko', 'es'] as const) {
    const missing = [...new Set(strings.filter(text => /[\u3400-\u9fff]/.test(translate(text, language))))];
    expect(missing).toEqual([]);
  }
});

it('translates recovery, validation and storage failure messages in all interface languages', () => {
  const messages = [
    '当前浏览器无法开启音频，仍可继续探索。', '音频设备已关闭，请点击强制开启声音重建。',
    '音频设备响应超时，请点击强制开启声音重试。', '音频恢复失败，请点击强制开启声音重试。',
    '声音设置已保留 · 点击页面或按键后开启声音',
    '请调高总音量、全部音效及「发动机」音量。', '请调高总音量、全部音效及「发动机与换挡机械声」音量。',
    '请调高总音量、全部音效及「本车喇叭」音量。',
    '3D 世界未启动 · 请重新加载页面', '本机按键数据无法读取，已使用默认按键。',
    '系统组合键保留，请选择其他按键。', '按键已生效并保存到当前浏览器。',
    '按键已生效，但浏览器不允许本机保存；刷新后会恢复默认。',
    '预设文件不能超过 64 KB。', '文件不是有效的 JSON。',
    '预设格式或参数范围不正确，请使用本版（格式 20）导出的 JSON。当前设置未改变。',
    '本机预设数据过大，请先导出或清理。', '本机预设数据不完整，原数据已保留。',
    '最多保存 32 个预设，请先删除不需要的预设。', '道路宽度、高度与密度数值必须在允许范围内。',
    '请检查道路宽度、车道与高度范围；车道不能过窄，上限不能低于下限。', '上限不能低于下限。',
    '沿当前分支寻找可衔接的大桥，可再次点击取消。', '当前范围未找到可衔接桥位，请提高最大坡度或使用自然起伏。',
    '当前筛选下没有日志。',
  ];
  for (const text of messages) for (const language of ['en', 'ja', 'ko', 'es'] as const) {
    expect(translate(text, language), `${language}: ${text}`).not.toBe(text);
    if (language !== 'ja') expect(translate(text, language), `${language}: ${text}`).not.toMatch(/[\u3400-\u9fff]/);
  }
});
