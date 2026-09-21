import { expect, test } from '@playwright/test';

test('locates a single 20 km exit and drives from the approach without console errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await expect(page.locator('#junction-view')).toBeEnabled({ timeout: 30000 });
  await expect(metric('Loaded routes')).toHaveText('2');
  await expect(metric('Junctions')).toHaveText('0');
  await expect(page.locator('#junction-status')).toContainText('每 20 km');
  const before = await metric('Coordinates').textContent();
  await page.locator('#junction-view').click();
  await expect(page.locator('#junction-view')).toHaveText(/定位中/);
  await expect(metric('Coordinates')).not.toHaveText(before!, { timeout: 30000 });
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  await expect(metric('Junctions')).toHaveText('1', { timeout: 30000 });
  await expect(metric('Loaded routes')).toHaveText('3');
  await expect(page.locator('#junction-status')).toContainText('右侧单出口');
  await page.locator('#drive-toggle').click();
  await page.keyboard.down('KeyW');
  await expect(page.locator('#vehicle-speed')).not.toHaveText('0');
  await page.keyboard.up('KeyW');
  expect(errors).toEqual([]);
});
