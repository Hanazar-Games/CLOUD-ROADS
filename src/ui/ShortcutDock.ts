import { element } from '../debug/DebugUI';
import { availableShortcuts, type ShortcutContext } from '../input/AvailableShortcuts';
import type { KeyBindings } from '../input/KeyBindings';

const names = { flight: '自由探索', walking: '车外步行', driver: '驾驶员', passenger: '乘客', operator: '吊车操作席', interior: '车内步行' };
export class ShortcutDock {
  private last = '';
  constructor(private readonly bindings: KeyBindings) {}
  update(context: ShortcutContext): void {
    const enabled = element<HTMLInputElement>('beginner-mode').checked, dock = element('shortcut-dock');
    document.body.classList.toggle('beginner', enabled); dock.hidden = !enabled;
    if (!enabled) return;
    const items = availableShortcuts(context).map(item => ({ ...item, key: item.id === 'Escape' ? 'Esc' : this.bindings.label(item.id) }));
    const signature = JSON.stringify([context.mode, context.paused, context.accessing, items]);
    if (signature === this.last) return;
    this.last = signature;
    element('shortcut-context').textContent = `新手模式 · ${names[context.mode]}${context.paused ? ' · 已暂停' : context.accessing ? ' · 等待车门' : ''} · ${items.length} 项可用操作 · 滚动查看`;
    const list = element('shortcut-items'), scroll = list.scrollTop;
    list.replaceChildren(...items.map(({ id, label, group, key }) => {
      const item = document.createElement('span'), kbd = document.createElement('kbd'); item.dataset.action = id; item.title = group;
      kbd.textContent = key; item.append(kbd, ` ${label}`); return item;
    }));
    list.scrollTop = scroll;
  }
}
