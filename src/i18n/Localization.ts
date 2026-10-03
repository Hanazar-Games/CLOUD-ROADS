import { messages } from './Messages';
import { additionalMessages } from './AdditionalMessages';
import { signalMessages } from './SignalMessages';
import { interfaceMessages } from './InterfaceMessages';

export type Language = 'zh-CN' | 'ja' | 'en' | 'ko' | 'es';
export const LANGUAGE_STORAGE_KEY = 'cloud-roads.language';
const additional = new Map(additionalMessages.trim().split('\n').map(row => {
  const [source, ko, es] = row.split('\t'); return [source, { ko, es }] as const;
}));
export const catalog = new Map(`${messages}\n${signalMessages}\n${interfaceMessages}`.trim().split('\n').map(row => {
  const [source, en, ja, ko, es] = row.split('\t');
  const extra = source === '晴天' ? { ko: '맑음', es: 'Despejado' } : additional.get(en);
  return [source, { en, ja, ko: ko ?? extra!.ko, es: es ?? extra!.es }] as const;
}));
const chinese = /[\u3400-\u9fff]/;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrases = new RegExp([...catalog.keys()].sort((a, b) => b.length - a.length).map(escape).join('|'), 'g');
const keys = /(?<![A-Za-z0-9°])(?:\{\w+\}|[A-Z]|PageUp|PageDown|Home|End|Backspace|Space)(?![A-Za-z0-9])/g;
const keyTemplates = [...catalog].flatMap(([source, translations]) => {
  const matches = [...source.matchAll(keys)].filter(match => !(match[0] === 'L' && /\d\s?$/.test(source.slice(0, match.index))));
  if (!matches.length) return [];
  let position = 0, pattern = '^';
  for (const match of matches) { pattern += escape(source.slice(position, match.index)) + '(.{1,32}?)'; position = match.index + match[0].length; }
  return [{ expression: new RegExp(pattern + escape(source.slice(position)) + '$'), keys: matches.map(match => match[0]), translations }];
});
const caches = { en: new Map<string, string>(), ja: new Map<string, string>(), ko: new Map<string, string>(), es: new Map<string, string>() };

export function translate(text: string, language: Language): string {
  if (language === 'zh-CN' || !chinese.test(text)) return text;
  const cache = caches[language], known = cache.get(text); if (known !== undefined) return known;
  const literal = catalog.get(text.trim())?.[language];
  let translated = literal === undefined ? undefined : text.replace(text.trim(), () => literal);
  if (translated === undefined) for (const template of keyTemplates) {
    const match = template.expression.exec(text.trim()); if (!match) continue;
    const bound = new Map(template.keys.map((key, i) => [key, match[i + 1]]));
    translated = text.replace(text.trim(), template.translations[language].replace(keys, key => bound.get(key) ?? key)); break;
  }
  translated ??= text.replace(phrases, source => catalog.get(source)![language]);
  if (cache.size >= 1000) cache.clear(); cache.set(text, translated); return translated;
}

export class LanguagePreference {
  language: Language = 'zh-CN';
  saved = true;
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {
    try { const value = storage.getItem(LANGUAGE_STORAGE_KEY); if (validLanguage(value)) this.language = value; }
    catch { this.saved = false; }
  }
  select(value: string): boolean {
    if (!validLanguage(value)) return false;
    this.language = value;
    try { this.storage.setItem(LANGUAGE_STORAGE_KEY, value); this.saved = true; }
    catch { this.saved = false; }
    return true;
  }
}

function validLanguage(value: unknown): value is Language { return value === 'zh-CN' || value === 'ja' || value === 'en' || value === 'ko' || value === 'es'; }
