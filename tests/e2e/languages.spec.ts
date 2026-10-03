import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { control, closeSettings } from './settings';

test('switches languages live, translates settings, and preserves values and the driving session', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=LANGUAGE-AUDIT');
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#settings-title')).toHaveText('Journey settings');
  await expect(page.locator('[data-settings-target="audio"]')).toHaveText('Sound & music');
  await expect(page.locator('#interface-language option')).toHaveText(['中文（简体）', '日本語', 'English', '한국어', 'Español']);
  await (await control(page, page.locator('#master-volume'))).fill('55');
  await expect(page.locator('#master-volume-value')).toHaveText('55%');
  await page.locator('#settings-search').fill('master');
  await expect(page.locator('#settings-search-results')).toContainText('Master volume');
  await page.locator('#settings-search').press('Enter'); await expect(page.locator('#master-volume')).toBeFocused();
  await closeSettings(page); await page.locator('#drive-toggle').click();
  await expect(page.locator('#drive-toggle')).toHaveText('Exit driving');
  const language = await control(page, page.locator('#interface-language'));
  const position = await page.locator('[data-metric="Vehicle position"]').textContent();
  await language.selectOption('ja');
  await expect(page.locator('#settings-title')).toHaveText('旅の設定');
  await expect(page.locator('[data-settings-target="audio"]')).toHaveText('サウンドと音楽');
  await expect(page.locator('#master-volume')).toHaveValue('55');
  await expect(page.locator('[data-metric="Vehicle position"]')).toHaveText(position!);
  await page.setViewportSize({ width: 390, height: 700 });
  expect(await page.locator('#settings-content').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('japanese-mobile.png') });
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await (await control(page, page.locator('#interface-language'))).selectOption('zh-CN');
  await expect(page.locator('#settings-title')).toHaveText('旅程设置');
  await expect(page.locator('[data-settings-target="audio"]')).toHaveText('声音与音乐');
  expect(errors).toEqual([]);
});

test('uses saved language at startup and handles invalid or blocked storage', async ({ page }) => {
  await page.goto('/?seed=LANGUAGE-STARTUP');
  await page.evaluate(() => localStorage.setItem('cloud-roads.language', 'invalid'));
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.evaluate(() => localStorage.setItem('cloud-roads.language', 'ja'));
  await page.reload(); await expect(page.locator('#settings-title')).toHaveText('旅の設定');
  await page.evaluate(() => Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('blocked'); } }));
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await expect(page.locator('#language-status')).toContainText('storage is unavailable');
  await expect(page.locator('#settings-title')).toHaveText('Journey settings');
});

for (const locale of [
  { language: 'ko', title: '여정 설정', query: '신호', traffic: '신호등과 교통 규칙', audio: '소리와 음악', help: '직접 제동', power: '시동' },
  { language: 'es', title: 'Ajustes del viaje', query: 'semáforo', traffic: 'Semáforos y normas de tráfico', audio: 'Sonido y música', help: 'debes frenar', power: 'arrancar' },
]) test(`${locale.language} localizes settings, help, search and driving prompts on narrow screens`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=LANGUAGE-ADDITIONS');
  await (await control(page, page.locator('#interface-language'))).selectOption(locale.language);
  await expect(page.locator('#settings-title')).toHaveText(locale.title);
  await expect(page.locator('[data-settings-target="audio"]')).toHaveText(locale.audio);
  await page.locator('#settings-search').fill(locale.query);
  await expect(page.locator('#settings-search-results')).not.toContainText(/[\u3400-\u9fff]/);
  await expect(page.locator('#settings-search-results button').first()).toBeVisible();
  await page.locator('#settings-search').fill('');
  await (await control(page, page.locator('#signal-mainGreen'))).fill('18');
  await expect(page.locator('#settings-traffic')).toContainText(locale.traffic);
  await expect(page.locator('#settings-traffic')).toContainText(locale.help);
  await expect(page.locator('#signal-settings-status')).not.toContainText(/[\u3400-\u9fff]/);
  await page.setViewportSize({ width: 390, height: 700 });
  expect(await page.locator('#settings-content').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${locale.language}-traffic-mobile.png`) });
  await closeSettings(page); await page.locator('#drive-toggle').click();
  await expect(page.locator('#vehicle-status')).toContainText(locale.power);
  await expect(page.locator('#vehicle-status')).not.toContainText(/[\u3400-\u9fff]/);
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', locale.language);
  await (await control(page, page.locator('#interface-language'))).selectOption('zh-CN');
  await expect(page.locator('#settings-title')).toHaveText('旅程设置'); expect(errors).toEqual([]);
});

test('keeps rebound key prompts correct across language changes and does not translate preset names', async ({ page }) => {
  await page.goto('/?seed=LANGUAGE-KEYS');
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await (await control(page, page.locator('[data-binding="KeyF"]'))).click(); await page.keyboard.press('F8');
  await (await control(page, page.locator('#interface-language'))).selectOption('ja');
  await (await control(page, page.locator('#interface-language'))).selectOption('zh-CN');
  await expect(page.locator('#panel-exit')).toContainText('F8');
  await (await control(page, page.locator('#preset-name'))).fill('山谷 Sky 日本語'); await page.locator('#preset-save').click();
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await expect(page.locator('#preset-list option').first()).toHaveText('山谷 Sky 日本語');
  await expect(page.locator('#preset-status')).toContainText('山谷 Sky 日本語');
  await expect(page.locator('#preset-status')).toContainText('Saved');
  const exportButton = await control(page, page.locator('#preset-export'));
  const downloadPromise = page.waitForEvent('download'); await exportButton.click();
  const buffer = await readFile((await (await downloadPromise).path())!);
  await page.locator('#preset-import').setInputFiles({ name: 'language-preset.json', mimeType: 'application/json', buffer });
  await expect(page.locator('#preset-list option[value="import"]')).toHaveText('Import preview · 山谷 Sky 日本語');
  await (await control(page, page.locator('#interface-language'))).selectOption('ja');
  await expect(page.locator('#preset-list option[value="import"]')).toHaveText('読込プレビュー · 山谷 Sky 日本語');
});

test('translates live driving, seat and audio prompts and restores original panel text', async ({ page }) => {
  await page.goto('/?seed=LANGUAGE-DYNAMIC');
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await closeSettings(page); await page.locator('#drive-toggle').click();
  await expect(page.locator('#vehicle-status')).toHaveText('Power off · · to start');
  await expect(page.locator('#vehicle-lights-status')).not.toContainText(/[\u3400-\u9fff]/);
  await page.locator('#hud-vehicle-panel').click();
  await expect(page.locator('#vehicle-panel-help')).toContainText('hp');
  await page.locator('#vehicle-panel [data-close]').click();
  await (await control(page, page.locator('#interface-language'))).selectOption('zh-CN');
  await expect(page.locator('#vehicle-panel-help')).toContainText('马力');
  await expect(page.locator('#vehicle-panel-help')).not.toContainText('hp');
  await (await control(page, page.locator('#interface-language'))).selectOption('ja');
  await closeSettings(page); await page.locator('#hud-seats').click();
  await expect(page.locator('#seat-status')).toContainText('運転席のみ運転可能');
  await page.locator('#seat-dialog [data-close]').click();
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await (await control(page, page.locator('#audio-test'))).click();
  await expect(page.locator('#audio-test-status')).toContainText('Playing left');
});
