import { expect, test } from '@playwright/test';
import { closeSettings, control } from './settings';

test('keeps silent presets from creating an audio graph during apply and startup restore', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    Reflect.set(window, 'audioCreations', 0);
    window.AudioContext = class extends Native {
      constructor() { super(); Reflect.set(window, 'audioCreations', Reflect.get(window, 'audioCreations') + 1); }
    };
  });
  await page.goto('/?seed=RELEASE-063');
  await (await control(page, page.locator('#preset-name'))).fill('静音旅程');
  await page.locator('#preset-save').click(); await page.locator('#startup-save').click();
  await expect(page.locator('#startup-status')).toContainText('已保存');
  await page.locator('#preset-apply').click();
  await expect(page.locator('#preset-status')).toContainText('已应用');
  await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => Reflect.get(window, 'audioCreations'))).toBe(0);
  await page.reload();
  await expect(page.locator('#startup-status')).toContainText('已恢复');
  expect(await page.evaluate(() => Reflect.get(window, 'audioCreations'))).toBe(0);
  await (await control(page, page.locator('#radio-station'))).selectOption('3');
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
  expect(await page.evaluate(() => Reflect.get(window, 'audioCreations'))).toBe(1);
  await (await control(page, page.locator('#preset-save'))).click();
  await (await control(page, page.locator('#audio-toggle'))).click();
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('suspended');
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
  expect(await page.evaluate(() => Reflect.get(window, 'audioCreations'))).toBe(1);
});

test('switches seat-map decks without reopening the modal or losing keyboard focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 480, height: 600 });
  await page.goto('/?seed=RELEASE-063');
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('doubleDecker');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await page.keyboard.press('KeyP');
  await expect(page.locator('#seat-dialog')).toBeVisible();
  await page.locator('#seat-dialog').evaluate(dialog => {
    Reflect.set(window, 'seatClosures', 0);
    dialog.addEventListener('beforetoggle', event => {
      if ((event as ToggleEvent).newState === 'closed') Reflect.set(window, 'seatClosures', Reflect.get(window, 'seatClosures') + 1);
    });
  });
  const upper = page.locator('#seat-decks [data-deck="2"]'); await upper.focus(); await upper.press('Enter');
  await expect(upper).toHaveAttribute('aria-pressed', 'true'); await expect(upper).toBeFocused();
  expect(await page.evaluate(() => Reflect.get(window, 'seatClosures'))).toBe(0);
  await expect(page.locator('#seat-map button').first()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('upper-deck-small.png') });
  const lower = page.locator('#seat-decks [data-deck="1"]'); await lower.focus(); await lower.press('Space');
  await expect(lower).toBeFocused(); await expect(page.locator('[data-seat="driver"]')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
});
