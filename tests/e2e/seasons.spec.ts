import { expect, test } from '@playwright/test';

test('switches all four seasons in place without generating new chunks or resetting the car', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await page.locator('#terrain-kind').selectOption('forest');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(metric('Landscape')).toHaveText('森林山谷');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30000 });
  await page.locator('#drive-toggle').click(); await page.locator('#controls-toggle').click(); await page.locator('#pause').click();
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  const position = await metric('Vehicle position').textContent(), chunks = await metric('Generated chunks').textContent();
  for (const [season, name] of [['spring', '春季'], ['autumn', '秋季'], ['winter', '冬季'], ['summer', '夏季']]) {
    await page.locator('#season-kind').selectOption(season);
    await expect(metric('Season')).toHaveText(name);
    await expect(metric('Vehicle position')).toHaveText(position!);
    await expect(metric('Generated chunks')).toHaveText(chunks!);
    await expect(metric('Travel mode')).toHaveText('driving');
    await expect(page.locator('#error')).toBeHidden();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#season-kind').scrollIntoViewIfNeeded();
  await page.locator('#season-kind').selectOption('winter');
  await expect(page.locator('#season-kind')).toBeInViewport();
  await expect(page.locator('#season-status')).toContainText('积雪路面');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('renders snow, freezes its motion, and shelters precipitation inside tunnels', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await expect(page.locator('#tunnel-view')).toBeEnabled({ timeout: 30000 });
  await page.locator('#season-kind').selectOption('winter');
  await page.locator('#weather-kind').selectOption('rain');
  await page.locator('#cloud-toggle').click(); await page.locator('#sun-view').click();
  await expect(metric('Snow visible')).toHaveText('yes'); await expect(metric('Rain visible')).toHaveText('no');
  await expect(metric('Liquid rain')).toHaveText('0.00');
  await page.waitForTimeout(1200);
  const clip = { x: 700, y: 200, width: 500, height: 300 }, snow = await page.screenshot({ clip });
  await page.waitForTimeout(400); expect(await page.screenshot({ clip })).not.toEqual(snow);
  await page.locator('#pause').click(); const frozen = await page.screenshot({ clip });
  await page.waitForTimeout(400); expect(await page.screenshot({ clip })).toEqual(frozen);
  await page.locator('#pause').click(); await page.locator('#tunnel-view').click();
  await page.locator('#speed').fill('20'); await page.locator('#world').focus(); await page.keyboard.down('KeyW');
  await expect(metric('Tunnel shelter')).toHaveText('100%', { timeout: 10000 }); await page.keyboard.up('KeyW');
  await expect(metric('Snow visible')).toHaveText('no'); await expect(metric('Rain visible')).toHaveText('no');
  await page.locator('#home').click(); await expect(metric('Snow visible')).toHaveText('yes');
  expect(errors).toEqual([]);
});

test('retains winter across distant streaming, floating origins and terrain changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await page.locator('#season-kind').selectOption('winter');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  await expect(page.locator('#service-view')).toBeEnabled({ timeout: 30000 });
  await page.locator('#service-view').click();
  await expect.poll(async () => Number((await metric('Coordinates').textContent())!.split(',')[2]), { timeout: 30000 }).toBeLessThan(-10000);
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  await expect(metric('Season')).toHaveText('冬季');
  await expect.poll(async () => Number(await metric('Origin rebases').textContent())).toBeGreaterThan(0);
  await page.locator('#terrain-kind').selectOption('desert');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(metric('Landscape')).toHaveText('沙漠峡谷');
  await expect(metric('Pending / queued')).toHaveText('0 / 0', { timeout: 30000 });
  await expect(metric('Season')).toHaveText('冬季'); await expect(metric('Seasonal snow')).toHaveText('0%');
  await expect(page.locator('#season-kind')).toHaveValue('winter');
  expect(errors).toEqual([]);
});
