import { expect, test } from '@playwright/test';
import { control, closeSettings, sceneShot } from './settings';

test('renders a full four-way highway interchange and exposes traffic and distance-detail settings', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=FULL-INTERCHANGE');
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await page.locator('#terrain-kind').selectOption('meadow');
  await page.locator('#mountain-height').selectOption('range');
  await page.locator('#mountain-min').fill('100'); await page.locator('#mountain-max').fill('150');
  await page.locator('#elevation-mode').selectOption('fixed');
  await page.locator('#altitude-min').fill('180'); await page.locator('#altitude-max').fill('180');
  await page.locator('#route-style').selectOption('0'); await page.locator('#max-grade').fill('0');
  await page.locator('#world-options button[type="submit"]').click();
  await (await control(page, page.locator('#time-preset'))).selectOption('0');
  await page.locator('#fog-density').fill('50');
  await (await control(page, page.locator('#view-distance'))).fill('3');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  await (await control(page, page.locator('#junction-view'))).click();
  await expect(metric('Interchange ramps')).toHaveText('8', { timeout: 60000 });
  await expect(metric('Loaded routes')).toHaveText('4');
  await expect(metric('Road ready')).toHaveText('yes');
  await expect(page.locator('#junction-status')).toContainText('四向互通');
  await (await control(page, page.locator('#junction-view'))).click();
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 60000 });
  await (await control(page, page.locator('#cloud-toggle'))).click();
  await sceneShot(page, { path: info.outputPath('full-interchange.png') });
  for (const [id, value] of [['vegetation-lod', '50'], ['distant-trees', '25'], ['vegetation-shadows', '0'], ['vegetation-budget', '1'], ['vehicle-detail-distance', '120']]) {
    await (await control(page, page.locator(`#${id}`))).fill(value);
    await expect(page.locator(`#${id}`)).toHaveValue(value);
  }
  for (const [value, label] of [['busy', '缓慢车流'], ['queue', '排队拥堵'], ['stopgo', '走走停停'], ['normal', '正常通行']]) {
    await (await control(page, page.locator('#traffic-scenario'))).selectOption(value);
    await expect(metric('Traffic scenario')).toHaveText(value);
    await expect(page.locator('#traffic-status')).toContainText(label);
  }
  await closeSettings(page); await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});
