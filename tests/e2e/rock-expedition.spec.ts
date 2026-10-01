import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

for (const terrain of ['badlands', 'desert']) test(`drives the expedition vehicle through seeded ${terrain} and restores the same road`, async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  const ready = async () => {
    await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
    await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  };
  await page.goto('/?seed=ROCK-EXPEDITION');
  await (await control(page, page.locator('#terrain-kind'))).selectOption(terrain);
  await (await control(page, page.locator('#route-style'))).selectOption('2');
  await (await control(page, page.locator('#road-width'))).fill('12');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await ready();
  const start = await metric('Coordinates').textContent(), ground = await metric('Ground altitude').textContent();
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('expedition6');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page);
  await expect(metric('Vehicle model')).toHaveText('6×6 远征越野车');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 10000 }).toBeGreaterThan(12);
  await page.keyboard.up('KeyW'); await page.keyboard.down('Space');
  await expect(page.locator('#vehicle-speed')).toHaveText('0'); await page.keyboard.up('Space');
  await page.screenshot({ path: info.outputPath(`${terrain}-expedition.png`) });
  await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('walking');
  await page.keyboard.press('KeyF'); await expect(metric('Travel mode')).toHaveText('driving');
  await (await control(page, page.locator('#seed'))).fill('ROCK-EXPEDITION');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '加载种子' }))).click();
  await ready(); await expect(metric('Coordinates')).toHaveText(start!); await expect(metric('Ground altitude')).toHaveText(ground!);
  await expect(page.locator('#vehicle-kind')).toHaveValue('expedition6'); expect(errors).toEqual([]);
});
