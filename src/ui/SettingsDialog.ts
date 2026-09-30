import { element } from '../debug/DebugUI';

export class SettingsDialog {
  private readonly dialog = element<HTMLDialogElement>('explorer');
  private readonly events = new AbortController();
  private readonly sliders = new Map<HTMLInputElement, HTMLInputElement>();
  get open(): boolean { return this.dialog.open; }

  constructor(private readonly clearInput: () => void) {
    const options = { signal: this.events.signal }, button = element('controls-toggle');
    const content = element('settings-content');
    for (const label of content.querySelectorAll<HTMLLabelElement>('label:not([for])')) {
      const input = label.querySelector<HTMLInputElement>('input[id]'); if (input) label.htmlFor = input.id;
    }
    for (const event of ['input', 'change', 'click']) this.dialog.addEventListener(event, () => this.syncParameters(), options);
    const tabs = [...this.dialog.querySelectorAll<HTMLButtonElement>('[data-settings-target]')];
    let activeTab: HTMLButtonElement | undefined;
    const search = element<HTMLInputElement>('settings-search'), results = element('settings-search-results');
    const clear = element<HTMLButtonElement>('settings-search-clear'), status = element('settings-search-status');
    const find = () => {
      const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      clear.disabled = !search.value; results.replaceChildren(); results.hidden = !terms.length; status.textContent = '';
      if (!terms.length) return;
      const matches = [...content.querySelectorAll<HTMLLabelElement>('label[for]')].filter(label => {
        const control = document.getElementById(label.htmlFor);
        return control && terms.every(term => `${label.textContent} ${control.id} ${control.closest('fieldset')?.querySelector('legend')?.textContent ?? ''} ${control instanceof HTMLSelectElement ? control.textContent : ''}`.toLocaleLowerCase().includes(term));
      });
      results.hidden = !matches.length;
      status.textContent = matches.length ? `找到 ${matches.length} 项 · ↑↓ 选择，Enter 直达` : '没有匹配项，请尝试“转速”“声音”或“道路”。';
      for (const label of matches) {
        const target = element<HTMLElement>(label.htmlFor), section = label.closest<HTMLElement>('.settings-category')!;
        const result = document.createElement('button'); result.type = 'button';
        result.textContent = `${section.querySelector('h3')!.textContent} · ${label.textContent!.trim()}`;
        result.onclick = () => {
          search.value = ''; find();
          section.querySelectorAll('details').forEach(detail => { detail.open = true; });
          target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); syncCategory(); reveal(label);
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
    const syncCategory = () => {
      let current = tabs[0];
      if (this.open) for (const tab of tabs) {
        if (element(`settings-${tab.dataset.settingsTarget}`).offsetTop <= content.scrollTop + 25) current = tab;
      }
      for (const tab of tabs) {
        if (tab === current) tab.setAttribute('aria-current', 'true');
        else tab.removeAttribute('aria-current');
      }
      if (this.open && current !== activeTab) { activeTab = current; current.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    };
    content.addEventListener('scroll', syncCategory, options);
    syncCategory();
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
      syncCategory();
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
        section.querySelectorAll('details').forEach(detail => { detail.open = true; });
        content.scrollTo({ top: section.offsetTop - parseFloat(getComputedStyle(content).paddingTop) });
        syncCategory(); reveal(section.querySelector('h3')!);
      }, options);
    }
  }

  show(): void {
    if (this.dialog.inert || this.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.syncParameters(); this.clearInput(); this.dialog.showModal();
  }
  private syncParameters(): void {
    for (const slider of this.dialog.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      let number = this.sliders.get(slider);
      if (!number) {
        const label = this.dialog.querySelector<HTMLLabelElement>(`label[for="${slider.id}"]`);
        if (!label) continue;
        const copy = label.cloneNode(true) as HTMLElement; copy.querySelectorAll('output').forEach(output => output.remove());
        number = document.createElement('input'); number.type = 'number'; number.id = `${slider.id}-number`; number.className = 'parameter-number';
        number.setAttribute('aria-label', `${copy.textContent!.trim()} · 精确数值`);
        number.setAttribute('aria-describedby', slider.getAttribute('aria-describedby') ?? 'settings-help');
        const wrapper = document.createElement('div'); wrapper.className = 'parameter-control'; slider.before(wrapper); wrapper.append(slider, number);
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
  close(): void { if (this.open) { this.clearInput(); this.dialog.close(); this.focusWorld(); } }
  private focusWorld(): void { if (!element('world').inert && !document.querySelector('dialog[open]')) element('world').focus(); }
  dispose(): void { this.close(); this.events.abort(); }
}
