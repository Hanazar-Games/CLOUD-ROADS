import { element } from '../debug/DebugUI';
import type { InputManager } from '../input/InputManager';
import { bindingActions, keyLabel } from '../input/KeyBindings';

const storageKey = 'cloud-roads.key-bindings.v5';
export class KeyBindingPanel {
  private readonly events = new AbortController();
  private pending?: string;
  private shiftCandidate?: string;
  private readonly hints: { node: Text; text: string; rendered: string }[] = [];
  constructor(private readonly input: InputManager) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.parentElement?.closest('script, style, #release-notes, #shortcut-list, #binding-list, option')) continue;
      const text = node.data;
      if (input.bindings.format(text) !== text || /(?<![A-Za-z0-9])(?:F[2-8]|[A-Z]|Space)(?![A-Za-z0-9])/.test(text)) this.hints.push({ node, text, rendered: text });
    }
    try { const raw = localStorage.getItem(storageKey); if (raw) input.bindings.load(JSON.parse(raw)); }
    catch { this.status('本机按键数据无法读取，已使用默认按键。'); }
    this.render();
    const options = { signal: this.events.signal };
    const cancel = () => {
      if (!this.pending) return;
      this.pending = undefined; this.shiftCandidate = undefined; this.render(); this.status('已取消修改。');
    };
    window.addEventListener('blur', cancel, options);
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Element && !event.target.closest('[data-binding]')) cancel();
    }, options);
    element('bindings-reset').addEventListener('click', () => { input.bindings.reset(); this.pending = undefined; this.save(); this.render(); }, options);
    element('explorer').addEventListener('beforetoggle', event => { if ((event as ToggleEvent).newState === 'closed') cancel(); }, options);
    window.addEventListener('keydown', event => {
      if (!this.pending) return;
      event.preventDefault(); event.stopImmediatePropagation(); input.clear();
      if (event.code === 'Escape') { this.pending = undefined; this.render(); this.status('已取消修改。'); return; }
      if (event.repeat || event.isComposing) return;
      if (event.altKey || event.metaKey || event.ctrlKey && !event.code.startsWith('Control')) {
        this.shiftCandidate = undefined; this.status('系统组合键保留，请选择其他按键。'); return;
      }
      if (event.code.startsWith('Shift')) { this.shiftCandidate = event.code; return; }
      this.shiftCandidate = undefined;
      const key = event.shiftKey && !event.code.startsWith('Shift') ? `Shift+${event.code}` : event.code;
      try { input.bindings.bind(this.pending, key); this.pending = undefined; this.save(); this.render(); }
      catch (error) { this.status((error as Error).message); }
    }, { ...options, capture: true });
    window.addEventListener('keyup', event => {
      if (!this.pending || event.code !== this.shiftCandidate) return;
      this.shiftCandidate = undefined;
      event.preventDefault(); event.stopImmediatePropagation();
      try { input.bindings.bind(this.pending, event.code); this.pending = undefined; this.save(); this.render(); }
      catch (error) { this.status((error as Error).message); }
    }, { ...options, capture: true });
  }
  private render(): void {
    this.input.clear();
    const focused = this.pending ?? (document.activeElement as HTMLElement | null)?.dataset.binding;
    const list = element('binding-list'); list.replaceChildren();
    for (const [id, , group, label] of bindingActions) {
      const row = document.createElement('div'); row.className = 'binding-row';
      const text = document.createElement('span'); text.textContent = `${group} · ${label}`;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.binding = id;
      button.textContent = this.pending === id ? '请按键…' : this.input.bindings.label(id);
      button.setAttribute('aria-label', `修改 ${label} 快捷键`); button.setAttribute('aria-pressed', String(this.pending === id));
      button.addEventListener('click', () => { this.pending = id; this.shiftCandidate = undefined; this.render(); this.status('按下新按键；Shift 可组合，Esc 取消。'); });
      row.append(text, button); list.append(row);
      if (id === focused && element<HTMLDialogElement>('explorer').open) button.focus({ preventScroll: true });
    }
    for (const hint of this.hints) if (hint.node.isConnected && hint.node.data === hint.rendered) {
      hint.rendered = this.input.bindings.format(hint.text); hint.node.data = hint.rendered;
    }
    const footer = (id: string, actions: string[][]) => {
      element(id).replaceChildren(...actions.map(([action, label]) => {
        const span = document.createElement('span'), key = document.createElement('kbd'); key.textContent = this.input.bindings.label(action);
        span.append(key, ` ${label}`); return span;
      }));
    };
    footer('driving-controls', [['KeyW', '油门'], ['KeyS', '制动'], ['KeyA', '左转'], ['KeyD', '右转'], ['Autopilot', '巡航'], ['KeyM', '菜单']]);
    footer('walking-controls', [['KeyW', '前进'], ['Space', '跳跃'], ['KeyE', '疾跑'], ['KeyF', '上车'], ['KeyM', '菜单']]);
    footer('flight-controls', [['KeyW', '前进'], ['Space', '上升'], ['ShiftLeft', '下降'], ['ControlLeft', '加速'], ['KeyM', '菜单']]);
    element('bindings-current').textContent = `自动驾驶 ${this.input.bindings.label('Autopilot')} · 模式 ${this.input.bindings.label('AutoMode')} · 速度 ${this.input.bindings.label('AutoSlower')} / ${this.input.bindings.label('AutoFaster')}`;
    element('bindings-reset').title = `恢复 ${bindingActions.length} 项默认按键（例如自动驾驶 ${keyLabel('Semicolon')}）`;
  }
  private save(): void {
    try { localStorage.setItem(storageKey, JSON.stringify(this.input.bindings.snapshot())); this.status('按键已生效并保存到当前浏览器。'); }
    catch { this.status('按键已生效，但浏览器不允许本机保存；刷新后会恢复默认。'); }
  }
  private status(text: string): void { element('bindings-status').textContent = text; }
  dispose(): void { this.events.abort(); }
}
