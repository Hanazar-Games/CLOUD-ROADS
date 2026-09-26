import { expect, test } from '@playwright/test';
import { control } from './settings';

test('invalidates old travel buttons synchronously when replacing the world', async ({ page }) => {
  await page.goto('/?seed=CLOUD-ROAD-001');
  await expect(page.locator('#service-view')).toBeEnabled({ timeout: 30000 });
  const states = await page.locator('#world-options').evaluate(form => {
    (form as HTMLFormElement).requestSubmit();
    return ['drive-toggle', 'walk-toggle', 'road-view', 'bridge-view', 'tunnel-view', 'service-view', 'pass-view']
      .map(id => (document.getElementById(id) as HTMLButtonElement).disabled);
  });
  expect(states.every(Boolean)).toBe(true);
  await expect(page.locator('#service-view')).toBeEnabled({ timeout: 30000 });
  await (await control(page, page.locator('#service-view'))).click();
  await expect.poll(async () => Number((await page.locator('[data-metric="Coordinates"]').textContent())!.split(',')[2]), { timeout: 30000 }).toBeLessThan(-5000);
});

test('applies optional junctions and interchanges, preserves choices on new trips and fits mobile controls', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=OPTIONAL-ROUTES');
  await page.setViewportSize({ width: 390, height: 844 });
  await (await control(page, page.locator('#junctions'))).uncheck(); await (await control(page, page.locator('#interchanges'))).uncheck();
  await (await control(page, page.locator('#junctions'))).scrollIntoViewIfNeeded();
  await expect(page.locator('#junctions')).toBeInViewport();
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await expect(page.locator('#settings-status')).toContainText('岔路关闭');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  await expect(metric('Loaded routes')).toHaveText('2'); await expect(metric('Junctions')).toHaveText('0');
  await expect(page.locator('#junction-view')).toBeDisabled();
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await expect(page.locator('#settings-status')).toContainText('立交关闭');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  await expect(metric('Loaded routes')).toHaveText('2'); await expect(metric('Junctions')).toHaveText('0');
  await (await control(page, page.locator('#random-world'))).click();
  await expect(metric('Seed')).toHaveText(/^ROAD-/);
  await expect(page.locator('#junctions')).not.toBeChecked(); await expect(page.locator('#interchanges')).not.toBeChecked();
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  await expect(metric('Loaded routes')).toHaveText('2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
