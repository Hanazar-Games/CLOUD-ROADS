import { element } from '../debug/DebugUI';

export class SettingsDialog {
  private readonly dialog = element<HTMLDialogElement>('explorer');
  private readonly events = new AbortController();
  private readonly sliders = new Map<HTMLInputElement, HTMLInputElement>();
  private readonly content = element('settings-content');
  private readonly categories = [...this.content.querySelectorAll<HTMLElement>('.settings-category')];
  private readonly tabs = [...this.dialog.querySelectorAll<HTMLButtonElement>('[data-settings-target]')];
  private readonly positions = new Map<HTMLElement, number>();
  private active = this.categories[0];
  get open(): boolean { return this.dialog.open; }

  constructor(private readonly clearInput: () => void) {
    const options = { signal: this.events.signal }, button = element('controls-toggle');
    const content = this.content;
    const descriptions: Record<string, string> = {
      driving: '从车型到转向手感，调整适合自己的驾驶方式。', autopilot: '选择接管范围，再调整速度与舒适度。',
      bindings: '按自己的习惯安排按键，也可以恢复默认绑定。', equipment: '灯光、车窗与座舱设备，支持情况随车型变化。',
      traffic: '调整车流规模、速度差异与驾驶行为。', garage: '设置停车场车辆、楼层加载与照明。',
      world: '规划地形与路线；生成参数需应用后生效，并返回起点。', weather: '切换季节、光线与天气，观察沿途风景变化。',
      graphics: '平衡画面细节与性能；先选预设，再微调滑条。', audio: '分层调整音乐、车辆与环境声音，可即时试听。',
      presets: '将喜欢的组合保存到本机，或用 JSON 导入导出。', explore: '快速前往沿途景观，或切换自由探索工具。',
    };
    for (const section of content.querySelectorAll<HTMLElement>('.settings-category')) {
      const heading = section.querySelector('h3')!, row = document.createElement('div'); row.className = 'settings-category-heading';
      heading.before(row); row.append(heading);
      const intro = document.createElement('p'); intro.className = 'settings-intro';
      intro.textContent = descriptions[section.id.replace('settings-', '')]; row.after(intro);
      if (!section.querySelector('details')) continue;
      const actions = document.createElement('div'); actions.className = 'settings-fold-actions'; row.append(actions);
      for (const open of [true, false]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = open ? '展开全部' : '收起全部';
        button.dataset[open ? 'settingsExpand' : 'settingsCollapse'] = '';
        button.setAttribute('aria-label', `${open ? '展开' : '收起'}${heading.textContent}全部分组`);
        button.addEventListener('click', () => {
          section.querySelectorAll('details').forEach(detail => { detail.open = open; });
          if (!open) row.scrollIntoView({ block: 'nearest' });
        }, options);
        actions.append(button);
      }
    }
    content.addEventListener('invalid', event => this.revealControl(event.target as HTMLElement), { ...options, capture: true });
    for (const label of content.querySelectorAll<HTMLLabelElement>('label:not([for])')) {
      const input = label.querySelector<HTMLInputElement>('input[id]'); if (input) label.htmlFor = input.id;
    }
    for (const event of ['input', 'change', 'click']) this.dialog.addEventListener(event, () => this.syncParameters(this.active), options);
    const tabs = this.tabs;
    const search = element<HTMLInputElement>('settings-search'), results = element('settings-search-results');
    const clear = element<HTMLButtonElement>('settings-search-clear'), status = element('settings-search-status');
    const find = () => {
      const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      clear.disabled = !search.value; results.replaceChildren(); results.hidden = !terms.length; status.textContent = '';
      if (!terms.length) return;
      const candidates = new Map<HTMLElement, HTMLElement>();
      for (const label of content.querySelectorAll<HTMLLabelElement>('label[for]')) {
        const target = document.getElementById(label.htmlFor);
        if (target && !target.hidden) candidates.set(target, label);
      }
      for (const target of content.querySelectorAll<HTMLButtonElement>('button[id]:not([hidden]), button[data-binding]')) if (!candidates.has(target)) candidates.set(target, target);
      const matches = [...candidates].map(([target, label]) => {
        const section = target.closest<HTMLElement>('.settings-category')!, groups: string[] = [];
        for (let detail = target.closest('details'); detail; detail = detail.parentElement?.closest('details') ?? null) groups.unshift(detail.querySelector('summary')!.textContent!);
        const copy = label.cloneNode(true) as HTMLElement; copy.querySelectorAll('output').forEach(output => output.remove());
        const title = (label === target ? target.getAttribute('aria-label') : null) ?? copy.textContent!.trim();
        const path = [section.querySelector('h3')!.textContent, ...groups].join(' / ');
        const searchable = `${title} ${target.id} ${path} ${target.closest('.binding-row')?.textContent ?? ''} ${target.closest('fieldset')?.querySelector('legend')?.textContent ?? ''} ${target instanceof HTMLSelectElement ? target.textContent : ''}`.toLocaleLowerCase();
        return { target, label, title, path, searchable };
      }).filter(item => terms.every(term => item.searchable.includes(term)));
      results.hidden = !matches.length;
      status.textContent = matches.length ? `找到 ${matches.length} 项 · ↑↓ 选择，Enter 直达` : '没有匹配项，请尝试“转速”“声音”或“道路”。';
      for (const { target, label, title, path } of matches) {
        const result = document.createElement('button'); result.type = 'button';
        const location = document.createElement('small'), name = document.createElement('strong');
        location.textContent = path; name.textContent = title; result.append(location, name);
        if (target.matches(':disabled')) { const unavailable = document.createElement('span'); unavailable.textContent = '当前不可用 · 查看说明'; result.append(unavailable); }
        result.onclick = () => {
          search.value = ''; find();
          this.revealControl(target); target.focus({ preventScroll: true }); reveal(label);
          if (document.activeElement !== target) { label.tabIndex = -1; label.focus({ preventScroll: true }); }
        };
        results.append(result);
      }
    };
    search.addEventListener('input', find, options);
    search.addEventListener('keydown', event => {
      if (event.isComposing || !['Enter', 'ArrowDown'].includes(event.key)) return;
      const first = results.querySelector('button'); if (!first) return;
      event.preventDefault(); if (event.key === 'Enter') first.click(); else first.focus();
    }, options);
    results.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...results.querySelectorAll('button')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      if (event.key === 'ArrowUp' && index === 0) { search.focus(); return; }
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
    }, options);
    clear.addEventListener('click', () => { search.value = ''; find(); search.focus(); }, options);
    const reveal = (target: HTMLElement) => {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) target.animate([
        { backgroundColor: '#79e5ed30' }, { backgroundColor: 'transparent' },
      ], { duration: 500, easing: 'ease-out' });
    };
    this.dialog.addEventListener('keydown', event => {
      if (!event.isComposing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); event.stopPropagation(); search.focus(); search.select();
      }
    }, options);
    this.dialog.addEventListener('pointerdown', event => {
      if (search.value && !(event.target as HTMLElement).closest('.settings-search')) { search.value = ''; find(); }
    }, options);
    for (const shortcut of this.dialog.querySelectorAll<HTMLButtonElement>('[data-settings-shortcut]')) shortcut.addEventListener('click', () => {
      const target = element<HTMLElement>(shortcut.dataset.settingsShortcut!); this.revealControl(target); target.focus({ preventScroll: true }); reveal(target);
    }, options);
    element('settings-presets-shortcut').addEventListener('click', () => {
      const target = element<HTMLInputElement>('preset-name'); this.revealControl(target); target.focus({ preventScroll: true });
    }, options);
    this.selectCategory(this.active);
    button.addEventListener('click', () => this.show(), options);
    element('settings-close').addEventListener('click', () => this.close(), options);
    this.dialog.addEventListener('close', () => {
      search.value = ''; find();
      button.setAttribute('aria-expanded', 'false');
      this.focusWorld();
    }, options);
    this.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (search.value) { search.value = ''; find(); search.focus(); }
      else this.close();
    }, options);
    this.dialog.addEventListener('beforetoggle', clearInput, options);
    this.dialog.addEventListener('toggle', () => {
      button.setAttribute('aria-expanded', String(this.open));
    }, options);
    for (const tab of tabs) {
      tab.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = tabs.indexOf(tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (index + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
        tabs[next].focus(); tabs[next].click();
      }, options);
      tab.addEventListener('click', () => {
        const section = element(`settings-${tab.dataset.settingsTarget}`);
        this.selectCategory(section, section === this.active); reveal(section.querySelector('h3')!);
      }, options);
    }
  }

  show(): void {
    if (this.dialog.inert || this.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.syncParameters(); this.clearInput(); this.dialog.showModal();
    this.content.scrollTop = this.positions.get(this.active) ?? 0;
    this.tabs.find(tab => tab.dataset.settingsTarget === this.active.id.replace('settings-', ''))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  private selectCategory(section: HTMLElement, top = false): void {
    if (section !== this.active) this.positions.set(this.active, this.content.scrollTop);
    this.active = section;
    for (const category of this.categories) category.hidden = category !== section;
    for (const tab of this.tabs) {
      if (`settings-${tab.dataset.settingsTarget}` === section.id) {
        tab.setAttribute('aria-current', 'true'); if (this.open) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else tab.removeAttribute('aria-current');
    }
    this.content.scrollTop = top ? 0 : this.positions.get(section) ?? 0;
    element('settings-context').textContent = section.id === 'settings-world' ? '生成参数需应用 · 应用后返回起点'
      : section.id === 'settings-presets' ? '主动保存后保留设置 · 不保存行驶进度'
        : section.id === 'settings-bindings' ? '按键修改自动保存到本机 · 可恢复默认' : '参数即时生效 · 下次保留请保存预设';
    this.syncParameters(section);
  }
  private revealControl(target: HTMLElement): void {
    const section = target.closest<HTMLElement>('.settings-category'); if (section) this.selectCategory(section);
    for (let detail = target.parentElement?.closest('details'); detail; detail = detail.parentElement?.closest('details')) detail.open = true;
    target.scrollIntoView({ block: 'center' });
  }
  private syncParameters(root: HTMLElement = this.dialog): void {
    for (const slider of root.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      let number = this.sliders.get(slider);
      if (!number) {
        const label = this.dialog.querySelector<HTMLLabelElement>(`label[for="${slider.id}"]`);
        if (!label) continue;
        const copy = label.cloneNode(true) as HTMLElement; copy.querySelectorAll('output').forEach(output => output.remove());
        number = document.createElement('input'); number.type = 'number'; number.id = `${slider.id}-number`; number.className = 'parameter-number';
        number.hidden = slider.hasAttribute('data-discrete');
        number.setAttribute('aria-label', `${copy.textContent!.trim()} · 精确数值`);
        number.setAttribute('aria-describedby', slider.getAttribute('aria-describedby') ?? 'settings-help');
        const wrapper = document.createElement('div'); wrapper.className = 'parameter-control'; slider.before(wrapper); wrapper.append(slider, number);
        wrapper.classList.toggle('parameter-discrete', number.hidden);
        const field = number, commit = () => {
          const previous = slider.value;
          if (Number.isFinite(field.valueAsNumber)) slider.value = field.value;
          field.value = slider.value;
          if (slider.value !== previous) slider.dispatchEvent(new Event('input', { bubbles: true }));
        };
        field.addEventListener('change', commit, { signal: this.events.signal });
        field.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); field.value = slider.value; slider.focus(); }
        }, { signal: this.events.signal });
        this.sliders.set(slider, field);
      }
      number.min = slider.min; number.max = slider.max; number.step = slider.step; number.disabled = slider.disabled;
      number.title = `${slider.min}–${slider.max}，步长 ${slider.step || 1}`;
      if (document.activeElement !== number) number.value = slider.value;
      const fill = (slider.valueAsNumber - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
      slider.style.setProperty('--range-fill', `${Math.max(0, Math.min(1, fill)) * 100}%`);
    }
  }
  close(): void { if (this.open) { this.positions.set(this.active, this.content.scrollTop); this.clearInput(); this.dialog.close(); this.focusWorld(); } }
  private focusWorld(): void { if (!element('world').inert && !document.querySelector('dialog[open]')) element('world').focus(); }
  dispose(): void { this.close(); this.events.abort(); }
}
