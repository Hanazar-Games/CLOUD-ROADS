import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

test('renders both instrument styles and a live center map across cabin layouts', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=CABIN-NAV');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('economy');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.press('KeyC');
  const displays = page.locator('[data-metric="Cabin displays"]');
  await expect(displays).toHaveText('roadster / digital / route');
  for (const [kind, style] of [['sedan', 'digital'], ['coach', 'dial'], ['touringMotorcycle', 'dial'], ['roadster', 'dial']]) {
    await (await control(page, page.locator('#vehicle-kind'))).selectOption(kind);
    await (await control(page, page.locator('#hud-style'))).selectOption(style);
    await closeSettings(page);
    await expect(displays).toHaveText(`${kind} / ${style} / route`);
    await page.screenshot({ path: info.outputPath(`${kind}-${style}.png`) });
  }
  await page.keyboard.press('KeyM'); await expect(page.locator('#roadbook-content')).toBeVisible();
  await expect(page.locator('#controls-menu')).not.toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  await page.keyboard.press('Shift+KeyR'); await expect(page.locator('#controls-menu')).toBeVisible();
  expect(errors).toEqual([]);
});
