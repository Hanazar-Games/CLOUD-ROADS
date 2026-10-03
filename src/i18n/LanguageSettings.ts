import { DomLocalizer } from './DomLocalizer';
import { LanguagePreference } from './Localization';

export class LanguageSettings {
  private readonly preference = new LanguagePreference({
    getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
  });
  private readonly localizer = new DomLocalizer(document.body, this.preference.language);
  private readonly events = new AbortController();
  constructor() {
    const select = document.getElementById('interface-language') as HTMLSelectElement;
    select.value = this.preference.language;
    select.addEventListener('change', () => {
      if (!this.preference.select(select.value)) return;
      const search = document.getElementById('settings-search') as HTMLInputElement;
      search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true }));
      this.localizer.setLanguage(this.preference.language); this.status();
    }, { signal: this.events.signal });
    this.status();
  }
  private status(): void {
    document.getElementById('language-status')!.textContent = this.preference.saved
      ? '界面语言已保存到本机，下次打开自动使用。'
      : '语言已切换；浏览器阻止本机存储，本次会话仍可使用。';
  }
  dispose(): void { this.events.abort(); this.localizer.dispose(); }
}
