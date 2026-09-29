import { element } from '../debug/DebugUI';

export class SettingsDialog {
  private readonly dialog = element<HTMLDialogElement>('explorer');
  private readonly events = new AbortController();
  get open(): boolean { return this.dialog.open; }

  constructor(private readonly clearInput: () => void) {
    const options = { signal: this.events.signal }, button = element('controls-toggle');
    const content = element('settings-content');
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
        return control && terms.every(term => `${label.textContent} ${control.id} ${control instanceof HTMLSelectElement ? control.textContent : ''}`.toLocaleLowerCase().includes(term));
      });
      results.hidden = !matches.length;
      status.textContent = matches.length ? `找到 ${matches.length} 项${matches.length > 8 ? '，显示前 8 项' : ''} · 选择后直达` : '没有匹配项，请尝试“转速”“声音”或“道路”。';
      for (const label of matches.slice(0, 8)) {
        const target = element<HTMLElement>(label.htmlFor), section = label.closest<HTMLElement>('.settings-category')!;
        const result = document.createElement('button'); result.type = 'button';
        result.textContent = `${section.querySelector('h3')!.textContent} · ${label.textContent!.trim()}`;
        result.onclick = () => {
          search.value = ''; find();
          section.querySelectorAll('details').forEach(detail => { detail.open = true; });
          target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); syncCategory();
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
    clear.addEventListener('click', () => { search.value = ''; find(); search.focus(); }, options);
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
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); }, options);
    this.dialog.addEventListener('beforetoggle', clearInput, options);
    this.dialog.addEventListener('toggle', () => {
      button.setAttribute('aria-expanded', String(this.open));
      syncCategory();
    }, options);
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const section = element(`settings-${tab.dataset.settingsTarget}`);
        section.querySelectorAll('details').forEach(detail => { detail.open = true; });
        content.scrollTo({ top: section.offsetTop - parseFloat(getComputedStyle(content).paddingTop) });
        syncCategory();
      }, options);
    }
  }

  show(): void {
    if (this.dialog.inert || this.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.clearInput(); this.dialog.showModal();
  }
  close(): void { if (this.open) { this.clearInput(); this.dialog.close(); this.focusWorld(); } }
  private focusWorld(): void { if (!element('world').inert && !document.querySelector('dialog[open]')) element('world').focus(); }
  dispose(): void { this.close(); this.events.abort(); }
}
