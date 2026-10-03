import { translate, type Language } from './Localization';

interface TextRecord { source: string; rendered: string }
const originals = new WeakMap<Text, TextRecord>();
const attributes = new WeakMap<Element, Map<string, TextRecord>>();
const attributeNames = ['aria-label', 'aria-valuetext', 'placeholder', 'title'];
const excluded = 'script, style, textarea, code, pre, [translate="no"], #debug-values';

export function setUserMessage(node: HTMLElement, template: string, values: Record<string, string> = {}): void {
  node.replaceChildren(...template.split(/(\{\w+\})/).map(part => {
    const value = values[part.slice(1, -1)];
    if (!part.startsWith('{') || value === undefined) return document.createTextNode(part);
    const span = document.createElement('span'); span.translate = false; span.textContent = value; return span;
  }));
}

export function sourceText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const record = originals.get(node as Text), text = node.textContent ?? '';
    return record?.rendered === text ? record.source : text;
  }
  return [...node.childNodes].map(sourceText).join('');
}

export function sourceClone<T extends Node>(node: T): T {
  const copy = node.cloneNode(false) as T;
  if (node.nodeType === Node.TEXT_NODE) copy.textContent = sourceText(node);
  else for (const child of node.childNodes) copy.appendChild(sourceClone(child));
  return copy;
}

export class DomLocalizer {
  private readonly observer = new MutationObserver(records => {
    this.observer.disconnect();
    const roots = new Set<Node>();
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) roots.add(node);
      else roots.add(record.target);
    }
    for (const node of roots) if (node.isConnected) this.walk(node);
    this.observe();
  });
  constructor(private readonly root: HTMLElement, private language: Language) { this.setLanguage(language); }
  setLanguage(language: Language): void {
    this.observer.disconnect(); this.language = language;
    document.documentElement.lang = language; this.walk(this.root); this.observe();
  }
  private observe(): void {
    this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributeNames });
  }
  private walk(node: Node): void {
    const element = node instanceof Element ? node : node.parentElement;
    if (element?.closest(excluded)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text, source = sourceText(text), rendered = translate(source, this.language);
      if (source !== rendered || originals.has(text)) originals.set(text, { source, rendered });
      if (text.data !== rendered) text.data = rendered;
      return;
    }
    if (node instanceof Element) for (const name of attributeNames) {
      const current = node.getAttribute(name); if (current === null) continue;
      const records = attributes.get(node) ?? new Map<string, TextRecord>(), previous = records.get(name);
      const source = previous?.rendered === current ? previous.source : current, rendered = translate(source, this.language);
      if (source !== rendered || previous) { records.set(name, { source, rendered }); attributes.set(node, records); }
      if (current !== rendered) node.setAttribute(name, rendered);
    }
    for (const child of node.childNodes) this.walk(child);
  }
  dispose(): void { this.observer.disconnect(); }
}
