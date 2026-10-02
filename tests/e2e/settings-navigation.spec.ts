import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('shows one category at a time and restores its scroll and folds on return', async ({ page }) => {
  await page.goto('/?seed=SETTINGS-NAV'); await openSettings(page);
  await expect(page.locator('.settings-category:visible')).toHaveCount(1);
  await expect(page.locator('#settings-driving')).toBeVisible();
  await page.locator('#steering-settings > summary').click();
  await page.locator('#steering-directness').scrollIntoViewIfNeeded();
  const position = await page.locator('#settings-content').evaluate(node => node.scrollTop);
  expect(position).toBeGreaterThan(100);
  await page.locator('[data-settings-target="graphics"]').click();
  await expect(page.locator('#settings-driving')).toBeHidden();
  await expect(page.locator('[data-settings-target="graphics"]')).toHaveAttribute('aria-current', 'true');
  await page.locator('[data-settings-target="driving"]').click();
  expect(await page.locator('#settings-content').evaluate(node => node.scrollTop)).toBeCloseTo(position, 0);
  await expect(page.locator('#steering-settings')).toHaveAttribute('open', '');
  await closeSettings(page); await openSettings(page);
  await expect(page.locator('#steering-directness')).toBeInViewport();
  await page.locator('[data-settings-target="driving"]').press('ArrowDown');
  await expect(page.locator('#settings-autopilot')).toBeVisible();
  await expect(page.locator('[data-settings-target="autopilot"]')).toBeFocused();
});

test('jumps to common controls and searches actions without executing them', async ({ page }) => {
  await page.goto('/?seed=SETTINGS-SEARCH'); await openSettings(page);
  await page.locator('[data-settings-shortcut="tree-density"]').click();
  await expect(page.locator('#tree-density')).toBeFocused();
  await expect(page.locator('#settings-graphics')).toBeVisible();
  await page.keyboard.press('Control+k'); await expect(page.locator('#settings-search')).toBeFocused();
  await page.locator('#settings-search').fill('声音 恢复默认混音');
  await expect(page.locator('#settings-search-results')).toContainText('声音与音乐');
  await page.locator('#settings-search').press('Enter');
  await expect(page.locator('#audio-mix-reset')).toBeFocused();
  await expect(page.locator('#settings-audio')).toBeVisible();
  await (await control(page, page.locator('#master-volume'))).fill('55');
  await page.locator('#settings-search').fill('恢复默认混音'); await page.locator('#settings-search').press('Enter');
  await expect(page.locator('#master-volume')).toHaveValue('55');
  await page.locator('#settings-presets-shortcut').click();
  await expect(page.locator('#preset-name')).toBeFocused();
  await expect(page.locator('#settings-presets')).toBeVisible();
});

test('keeps navigation, search and controls reachable on short touch screens', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 450 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?seed=SETTINGS-SMALL'); await openSettings(page);
  for (const category of ['world', 'graphics', 'weather', 'audio', 'presets']) {
    await page.locator(`[data-settings-target="${category}"]`).click();
    await expect(page.locator('.settings-category:visible')).toHaveCount(1);
    await expect(page.locator('#settings-close')).toBeInViewport();
    await expect(page.locator('#settings-presets-shortcut')).toBeInViewport();
    expect(await page.locator('#settings-content').evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.clientHeight >= 100)).toBe(true);
  }
  await page.locator('[data-settings-target="world"]').click();
  await expect(page.locator('#settings-context')).toContainText('应用');
  await page.locator('#settings-search').fill('植被 树木'); await page.locator('#settings-search').press('Enter');
  await expect(page.locator('#tree-density')).toBeFocused(); await expect(page.locator('#tree-density')).toBeInViewport();
  expect(await page.locator('#explorer').evaluate(node => node.scrollTop)).toBe(0);
  const dialog = await page.locator('#explorer').boundingBox(), title = await page.locator('#settings-title').boundingBox();
  expect(title!.y).toBeGreaterThan(dialog!.y);
  await expect(page.locator('#settings-presets-shortcut')).toBeInViewport();
  const content = await page.locator('#settings-content').boundingBox(), footer = await page.locator('.settings-footer').boundingBox();
  expect(content!.y + content!.height).toBeLessThanOrEqual(footer!.y + 1);
  const slider = await page.locator('#tree-density').boundingBox(); expect(slider!.height).toBeGreaterThanOrEqual(32);
  await page.screenshot({ path: info.outputPath('settings-short.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-settings-target="graphics"]').click();
  await page.screenshot({ path: info.outputPath('settings-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-settings-target="graphics"]').click();
  await page.screenshot({ path: info.outputPath('settings-desktop.png') });
});

test('keeps settings search shortcuts independent of vehicle key bindings', async ({ page }) => {
  await page.goto('/?seed=SETTINGS-KEYS');
  await (await control(page, page.locator('[data-binding="KeyK"]'))).click(); await page.keyboard.press('F10');
  await expect(page.locator('[data-binding="KeyK"]')).toHaveText('F10');
  await expect(page.locator('#settings-help')).toContainText('Ctrl / ⌘ K');
  await page.keyboard.press('Control+k'); await expect(page.locator('#settings-search')).toBeFocused();
});
