import { expect, test } from '@playwright/test';

test('aircraft GLBs and distant mountain workers load from the Pages project path', async ({ page }) => {
  const failures: string[] = [], paths: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    paths.push(new URL(response.url()).pathname);
  });
  await page.goto('./?seed=PAGES-FLIGHT');
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready', { timeout: 60000 });
  await page.locator('[data-aircraft="su30"]').click();
  await expect(page.locator('.av-load-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-action="airborne"]').click(); await page.keyboard.press('KeyV');
  await expect(page.locator('#aviation')).toHaveClass(/av-cockpit/);
  expect(paths.some(path => /^\/CLOUD-ROADS\/assets\/a380-.+\.glb$/.test(path))).toBe(true);
  expect(paths.some(path => /^\/CLOUD-ROADS\/assets\/su30-.+\.glb$/.test(path))).toBe(true);
  expect(paths.some(path => /^\/CLOUD-ROADS\/assets\/FlightHorizonWorker-.+\.js$/.test(path))).toBe(true);
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#app > #world')).toHaveCount(1);
  await expect(page.locator('#error')).toBeHidden();
  expect(failures).toEqual([]);
});
