import { element } from '../debug/DebugUI';

export class SettingsDialog {
  private readonly dialog = element<HTMLDialogElement>('explorer');
  private readonly events = new AbortController();
  get open(): boolean { return this.dialog.open; }

  constructor(private readonly clearInput: () => void) {
    const options = { signal: this.events.signal }, button = element('controls-toggle');
    const content = element('settings-content');
    const tabs = [...this.dialog.querySelectorAll<HTMLButtonElement>('[data-settings-target]')];
    const syncCategory = () => {
      let current = tabs[0];
      if (this.open) for (const tab of tabs) {
        if (element(`settings-${tab.dataset.settingsTarget}`).offsetTop <= content.scrollTop + 25) current = tab;
      }
      for (const tab of tabs) {
        if (tab === current) tab.setAttribute('aria-current', 'true');
        else tab.removeAttribute('aria-current');
      }
    };
    content.addEventListener('scroll', syncCategory, options);
    syncCategory();
    button.addEventListener('click', () => this.show(), options);
    element('settings-close').addEventListener('click', () => this.close(), options);
    this.dialog.addEventListener('close', () => {
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
