import { expect, test } from '@playwright/test';
import { control, openSettings } from './settings';

test('retains settings scroll after opening a seat map directly from equipment controls', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 650 });
  await page.goto('/?seed=AUDIT-072-DIALOGS'); await page.locator('#drive-toggle').click();
  await control(page, page.locator('#seat-open'));
  const content = page.locator('#settings-content'), before = await content.evaluate(node => node.scrollTop);
  expect(before).toBeGreaterThan(100);
  await page.locator('#seat-open').click();
  await expect(page.locator('#seat-dialog')).toBeVisible();
  await expect(page.locator('#explorer')).not.toBeVisible();
  await page.keyboard.press('Escape'); await openSettings(page);
  await expect(page.locator('#settings-equipment')).toBeVisible();
  expect(await content.evaluate(node => node.scrollTop)).toBeCloseTo(before, 0);
  await expect(page.locator('#seat-open')).toBeInViewport();
});
