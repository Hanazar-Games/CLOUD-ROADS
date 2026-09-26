import { expect, test } from '@playwright/test';
import { closeSettings, control } from '../e2e/settings';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

test('loads built scripts, styles, workers and the world under the Pages project path', async ({ page }) => {
  const errors: string[] = [], assets: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    if (/\.(js|css)(\?|$)/.test(response.url())) assets.push(new URL(response.url()).pathname);
  });
  await page.goto('./?seed=CLOUD-ROAD-001');
  // Keep software rendering affordable while verifying the full terrain window.
  if (process.env.CI) {
    await (await control(page, page.locator('#graphics-preset'))).selectOption('economy');
    await (await control(page, page.locator('#view-distance'))).selectOption('8');
    await (await control(page, page.locator('#vegetation-toggle'))).click();
    await closeSettings(page);
  }
  const resources = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('src') ?? node.getAttribute('href')));
  expect(resources.length).toBeGreaterThanOrEqual(2);
  for (const resource of resources) {
    expect(new URL(resource!, page.url()).pathname).toMatch(/^\/CLOUD-ROADS\/assets\/.+\.(js|css)$/);
  }
  await expect(page.locator('#release-open')).toContainText(`v${version}`);
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 30_000 });
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 90_000 });
  await expect(page.locator('[data-metric="Active chunks"]')).toHaveText('289');
  if (process.env.CI) {
    await (await control(page, page.locator('#vegetation-toggle'))).click();
    await closeSettings(page);
    await expect.poll(async () => Number(await page.locator('[data-metric="Tree canopies"]').textContent()), { timeout: 15_000 }).toBeGreaterThan(2000);
    await page.screenshot();
  }
  await (await control(page, page.locator('#season-kind'))).selectOption('winter');
  await (await control(page, page.locator('#pause'))).click();
  await (await control(page, page.locator('#weather-kind'))).selectOption('rain');
  await expect(page.locator('[data-metric="Season"]')).toHaveText('冬季');
  await expect(page.locator('[data-metric="Snow visible"]')).toHaveText('yes');
  await expect(page.locator('[data-metric="Rain visible"]')).toHaveText('no');
  await closeSettings(page);
  await page.screenshot();
  await expect(page.locator('#world')).toHaveCSS('position', 'fixed');
  await expect(page.locator('#error')).toBeHidden();
  expect(Number(await page.locator('[data-metric="Draw calls"]').textContent())).toBeGreaterThan(10);
  expect(assets.some(path => /TerrainWorker.+\.js$/.test(path))).toBe(true);
  expect(errors).toEqual([]);
});
