import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openSettings } from './settings';

test('searches key binding actions without starting capture or changing the binding', async ({ page }) => {
  await page.goto('/?seed=RELEASE-064'); await openSettings(page);
  const search = page.locator('#settings-search'), binding = page.locator('[data-binding="KeyV"]');
  const original = await binding.textContent();
  await search.fill('鸣笛 快捷键');
  await expect(page.locator('#settings-search-results')).toContainText('修改 按住鸣笛 快捷键');
  await search.press('Enter');
  await expect(page.locator('#settings-bindings')).toBeVisible();
  await expect(binding).toBeFocused(); await expect(binding).toHaveText(original!);
  await expect(binding).toHaveAttribute('aria-pressed', 'false');
  await binding.press('Enter'); await page.keyboard.press('F10');
  await expect(binding).toHaveText('F10');
  await search.fill('鸣笛 快捷键'); await search.press('Enter');
  await expect(binding).toBeFocused(); await expect(binding).toHaveText('F10');
  await expect(binding).toHaveAttribute('aria-pressed', 'false');
});

test('shows the new announcement and preserves the previous release in history', async ({ page }, info) => {
  const changelog = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  const notes = (text: string) => text.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2));
  const current = notes(changelog.split('## 历史公告')[0]);
  const history = changelog.split('## 历史公告')[1].split('\n### ')[1];
  const previous = notes(history), previousVersion = history.split(' — ')[0];
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  await page.goto('/?seed=RELEASE-064'); await page.locator('#release-open').click();
  await expect(page.locator('#release-current h3')).toHaveText(`v${version} · ${changelog.match(/^## 当前版本：[^—]+— (.+)$/m)![1]}`);
  await expect(page.locator('#release-current li')).toHaveText(current);
  await expect(page.locator('#release-history article').first().locator('h3')).toContainText(`v${previousVersion}`);
  await expect(page.locator('#release-history article').first().locator('li')).toHaveText(previous);
  await page.screenshot({ path: info.outputPath('release-current.png') });
  await page.keyboard.press('Escape'); await expect(page.locator('#release-open')).toBeFocused();
});
