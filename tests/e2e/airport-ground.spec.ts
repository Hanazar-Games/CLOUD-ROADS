import { expect, test } from '@playwright/test';

test('teleports from the road world, changes the parked aircraft and boards from the same apron', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const models: string[] = []; page.on('request', request => { if (/su30.*\.glb/.test(request.url())) models.push(request.url()); });
  await page.goto('/?seed=CLOUD-AIRPORT-GROUND');
  await expect(page.locator('#airport-dock')).toBeHidden();
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('#aviation')).toHaveCount(0);
  await expect(page.locator('#airport-dock')).toBeVisible();
  await expect(page.locator('#airport-dock')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#airport-aircraft option')).toHaveCount(12);
  await page.locator('#airport-aircraft').selectOption('su30');
  await expect(page.locator('#airport-dock')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#airport-board')).toBeEnabled();
  await expect(page.locator('body')).toHaveClass(/walking/);
  await expect.poll(async () => Number((await page.locator('[data-metric="Walking position"]').textContent())!.split(',')[0])).toBeGreaterThan(4000);
  const walking = (await page.locator('[data-metric="Walking position"]').textContent())!.split(',').map(Number);
  expect(walking[0]).toBeGreaterThan(4000);
  const position = await page.locator('[data-metric="Walking position"]').textContent();
  await page.locator('#airport-board').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await expect(page.locator('#aviation')).toHaveClass(/av-cockpit/);
  await expect(page.locator('[data-value="aircraft"]')).toContainText('Su-30');
  await expect(page.locator('[data-value="phase"]')).toContainText('TAXI');
  await expect(page.locator('[data-value="heading"]')).toHaveText('090');
  await expect(page.locator('[data-value="guide"]')).toContainText('驻车');
  await page.keyboard.press('KeyN');
  await expect(page.locator('[data-value="guide"]')).toContainText('滑行');
  await page.screenshot({ path: info.outputPath('airport-apron-cockpit.png') });
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('body')).toHaveClass(/walking/);
  await expect(page.locator('#airport-dock')).toBeVisible();
  await expect(page.locator('#airport-aircraft')).toHaveValue('su30');
  await expect(page.locator('[data-metric="Walking position"]')).toHaveText(position!);
  await expect(page.locator('#airport-board')).toBeEnabled();
  await page.locator('#airport-board').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.locator('[data-action="exit"]').click();
  await expect(page.locator('#airport-board')).toBeEnabled();
  expect(models).toHaveLength(1);
  await expect(page.locator('#error')).toBeHidden();
  expect(errors).toEqual([]);
});

test('airport boarding stays reachable on a phone', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('/?seed=CLOUD-AIRPORT-PHONE');
    await page.locator('#aircraft-toggle').tap();
    await page.locator('#airport-aircraft').selectOption('t6');
    await expect(page.locator('#airport-board')).toBeEnabled();
    await expect(page.locator('#airport-board')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.locator('#airport-board').tap();
    await expect(page.locator('#aviation')).toHaveClass(/av-cockpit/);
    await expect(page.locator('[data-value="phase"]')).toContainText('TAXI');
    await expect(page.locator('[data-action="exit"]')).toBeInViewport({ ratio: 1 });
    await page.locator('[data-action="exit"]').tap();
    await expect(page.locator('#airport-dock')).toBeVisible();
  } finally { await context.close(); }
});
