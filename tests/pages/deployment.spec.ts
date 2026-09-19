import { expect, test } from '@playwright/test';
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
  await page.goto('./');
  const resources = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('src') ?? node.getAttribute('href')));
  expect(resources.length).toBeGreaterThanOrEqual(2);
  for (const resource of resources) {
    expect(new URL(resource!, page.url()).pathname).toMatch(/^\/CLOUD-ROADS\/assets\/.+\.(js|css)$/);
  }
  await expect(page.locator('#release-open')).toContainText(`v${version}`);
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 30_000 });
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 30_000 });
  await expect(page.locator('[data-metric="Active chunks"]')).toHaveText('289');
  await expect(page.locator('#world')).toHaveCSS('position', 'fixed');
  await expect(page.locator('#error')).toBeHidden();
  expect(Number(await page.locator('[data-metric="Draw calls"]').textContent())).toBeGreaterThan(10);
  expect(assets.some(path => /TerrainWorker.+\.js$/.test(path))).toBe(true);
  expect(errors).toEqual([]);
});
