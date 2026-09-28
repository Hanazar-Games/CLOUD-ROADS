import { expect, test } from '@playwright/test';
import { control, sceneShot } from './settings';

test('visits facility variants and boards vehicles in the connected three-level service garage', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=facility-connection');
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await page.locator('#route-style').selectOption('0'); await page.locator('#max-grade').fill('0');
  await page.locator('#mountain-height').selectOption('range');
  await page.locator('#mountain-min').fill('200'); await page.locator('#mountain-max').fill('200');
  await page.locator('#elevation-mode').selectOption('fixed');
  await page.locator('#altitude-min').fill('200'); await page.locator('#altitude-max').fill('200');
  await page.getByRole('button', { name: '应用并返回起点', exact: true }).click();
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  const facilities = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const before = await metric('Coordinates').textContent();
    await (await control(page, page.locator('#service-view'))).click();
    await expect(metric('Coordinates')).not.toHaveText(before!, { timeout: 30000 });
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
    await expect(metric('Service merge lanes')).toHaveText('1');
    const facility = (await metric('Service facilities').textContent())!; facilities.add(facility);
    await sceneShot(page, { path: info.outputPath(`${facility}.png`) });
    if (facility !== 'garage') continue;
    await expect(metric('Service garages')).toHaveText('2');
    const select = await control(page, page.locator('#garage-site'));
    await expect(select.locator('option')).toHaveCount(3);
    await select.selectOption({ index: 1 });
    await expect(page.locator('#garage-floor option')).toHaveCount(4);
    await page.locator('#garage-density').fill('100'); await page.locator('#garage-kind').selectOption('mixer');
    await page.locator('#garage-floor').selectOption('3'); await page.locator('#garage-view').click();
    await expect(metric('Garage floor')).toHaveText('3');
    await expect(page.locator('#season-status')).toContainText('地下车库');
    await sceneShot(page, { path: info.outputPath('service-B3.png') });
    await (await control(page, page.locator('#garage-car-view'))).click();
    await expect(page.locator('#boarding-help')).toBeVisible(); await page.keyboard.press('KeyF');
    await expect(metric('Travel mode')).toHaveText('driving');
    await expect(metric('Vehicle model')).toContainText('搅拌车');
    await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('walking');
  }
  expect([...facilities].sort()).toEqual(['garage', 'garden', 'mall', 'track']);
  expect(errors).toEqual([]);
});
