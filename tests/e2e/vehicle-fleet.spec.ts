import { expect, test } from '@playwright/test';

test('switches every vehicle in place, drives long rigs, and preserves choices through world and graphics resets', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await page.locator('#road-type').selectOption('highway');
  await page.locator('#route-style').selectOption('0');
  await page.locator('#max-grade').fill('0');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#vehicle-kind option')).toHaveCount(10);
  await expect(page.locator('#suspension option')).toHaveCount(5);
  await page.locator('#drive-toggle').click();
  for (const kind of ['sedan', 'suv', 'truck5', 'truck8', 'semi15', 'semi20', 'minibus', 'coach', 'motorcycle', 'roadster']) {
    await page.locator('#controls-toggle').click();
    await page.locator('#vehicle-kind').selectOption(kind);
    await expect(page.locator('#vehicle-kind')).toHaveValue(kind);
    await expect(metric('Vehicle model')).toHaveText(await page.locator('#vehicle-kind option:checked').textContent() ?? '');
    await expect(metric('Vehicle speed')).toHaveText('0.0 km/h');
    await page.locator('#suspension').selectOption('5');
    await page.locator('#controls-toggle').click();
    await page.locator('#world').focus();
    await page.keyboard.down('KeyW');
    await expect.poll(async () => parseFloat((await metric('Vehicle speed').textContent())!)).toBeGreaterThan(12);
    await page.keyboard.up('KeyW'); await page.keyboard.down('Space');
    await expect(page.locator('#vehicle-speed')).toHaveText('0');
    await page.keyboard.up('Space');
    await page.keyboard.press('KeyR');
    await expect(page.locator('#vehicle-gear')).toHaveText('P');
  }
  await page.locator('#controls-toggle').click();
  await page.locator('#vehicle-kind').selectOption('semi20');
  await page.locator('#weather-kind').selectOption('storm');
  await page.locator('#fog-density').fill('150');
  await expect(metric('Rain visible')).toHaveText('yes');
  await page.locator('#world').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 800);
  });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toBeHidden({ timeout: 15_000 });
  await expect(metric('Vehicle model')).toHaveText('20 米超长半挂');
  await page.locator('#seed').fill('FLEET-REPLAY');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30_000 });
  await expect(page.locator('#vehicle-kind')).toHaveValue('semi20');
  await expect(page.locator('#suspension')).toHaveValue('5');
  await expect(page.locator('#weather-kind')).toHaveValue('storm');
  await expect(page.locator('#fog-density-value')).toHaveText('150%');
  expect(errors).toEqual([]);
});

test('previews weather and fog while paused and keeps the vehicle stationary', async ({ page }) => {
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#vehicle-kind').selectOption('motorcycle');
  await page.locator('#drive-toggle').click();
  await page.keyboard.press('KeyP'); await page.locator('#controls-toggle').click();
  const position = await metric('Vehicle position').textContent();
  await page.locator('#cloud-toggle').click();
  await page.locator('#weather-kind').selectOption('fog');
  await page.locator('#fog-density').fill('200');
  await expect(metric('Fog near / far')).toHaveText('18 / 210 m');
  await page.locator('#weather-kind').selectOption('drizzle');
  await expect(metric('Rain visible')).toHaveText('yes');
  await page.locator('#weather-kind').selectOption('clear');
  await expect(metric('Rain visible')).toHaveText('no');
  await expect(metric('Vehicle position')).toHaveText(position!);
});
