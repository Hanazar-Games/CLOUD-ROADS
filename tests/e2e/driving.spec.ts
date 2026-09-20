import { expect, test, type Page } from '@playwright/test';

const metric = (page: Page, name: string) => page.locator(`[data-metric="${name}"]`);
async function start(page: Page) {
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 25_000 });
  await page.locator('#drive-toggle').click();
  await expect(metric(page, 'Travel mode')).toHaveText('driving');
  await expect(page.locator('#world')).toBeFocused();
  await expect(page.locator('#vehicle-gear')).toHaveText('P');
}

test('drives, steers, brakes, reverses and recovers safely without losing trip distance', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await start(page);
  await expect(page.locator('#explorer')).toBeHidden();
  await expect(page.locator('#drive-hud')).toBeVisible();
  const home = await metric(page, 'Vehicle position').textContent();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(30);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(300); await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  await expect(metric(page, 'Vehicle position')).not.toHaveText(home!);
  await page.keyboard.down('Space');
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await expect(page.locator('#vehicle-status')).toHaveText('制动');
  await page.keyboard.up('Space');
  await page.keyboard.down('KeyS');
  await expect(page.locator('#vehicle-gear')).toHaveText('R');
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await expect(page.locator('#vehicle-gear')).toHaveText('P');
  await expect(metric(page, 'Vehicle speed')).toHaveText('0.0 km/h');
  await page.waitForTimeout(300);
  const reset = await metric(page, 'Vehicle position').textContent();
  await page.waitForTimeout(600);
  await expect(metric(page, 'Vehicle position')).toHaveText(reset!);
  expect(Number(await page.locator('#vehicle-trip').textContent())).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('switches views and tuning, isolates settings and announcements, and resumes with fresh keys', async ({ page }) => {
  await page.goto('/'); await start(page);
  for (const view of ['cockpit', 'hood', 'chase']) {
    await page.keyboard.press('KeyC');
    await expect(metric(page, 'Driving camera')).toHaveText(view);
  }
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(15);
  await page.locator('#controls-toggle').click();
  await page.waitForTimeout(350);
  const held = await metric(page, 'Vehicle position').textContent();
  await page.locator('#driving-view').selectOption('cockpit');
  await page.locator('#driving-fov').fill('85');
  await page.locator('#camera-distance').fill('10');
  await page.locator('#camera-height').fill('0.25');
  await page.locator('#suspension').selectOption('soft');
  await expect(page.locator('#driving-fov-value')).toHaveText('85°');
  await expect(page.locator('#camera-distance-value')).toHaveText('10 m');
  await expect(page.locator('#camera-height-value')).toHaveText('+25 cm');
  await expect(metric(page, 'Camera FOV')).toHaveText('85°');
  await expect(metric(page, 'Camera height')).toHaveText('25 cm');
  await expect(metric(page, 'Vehicle position')).toHaveText(held!);
  await page.locator('#release-open').click();
  await page.keyboard.press('KeyR'); await page.keyboard.press('KeyC');
  await page.waitForTimeout(350);
  await expect(metric(page, 'Vehicle position')).toHaveText(held!);
  await expect(page.locator('#driving-view')).toHaveValue('cockpit');
  await page.keyboard.press('Escape');
  await page.keyboard.up('KeyW');
  await page.locator('#world').focus();
  await page.keyboard.press('KeyR');
  await expect(page.locator('#vehicle-gear')).toHaveText('P');
  await page.keyboard.press('KeyP');
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyP');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400);
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyW');
  await expect(page.locator('#vehicle-speed')).not.toHaveText('0');
  await page.keyboard.up('KeyW');
  await page.locator('#seed').fill('DRIVING-RELOAD');
  await page.getByRole('button', { name: '加载种子' }).click();
  await expect(page.locator('#drive-hud')).toBeHidden();
  await expect(metric(page, 'Travel mode')).toHaveText('flight');
  await expect(page.locator('#suspension')).toHaveValue('soft');
  await start(page);
  await expect(page.locator('#vehicle-trip')).toHaveText('0.00');
  await expect(metric(page, 'Vehicle suspension')).toContainText('soft');
});

test('drives into a lit tunnel and keeps all camera modes inside the bore', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#tunnel-view')).toBeEnabled({ timeout: 25_000 });
  await page.locator('#tunnel-view').click();
  await page.locator('#weather-kind').selectOption('rain');
  await start(page);
  await page.keyboard.down('KeyW');
  await expect(metric(page, 'Tunnel shelter')).toHaveText('100%', { timeout: 15_000 });
  await page.keyboard.up('KeyW'); await page.keyboard.down('Space');
  await expect(page.locator('#vehicle-speed')).toHaveText('0');
  await page.keyboard.up('Space');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyC');
    await expect(metric(page, 'Tunnel shelter')).toHaveText('100%');
    await expect(metric(page, 'Rain visible')).toHaveText('no');
  }
  await page.locator('#world').evaluate(canvas => {
    const ext = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    ext.loseContext(); setTimeout(() => ext.restoreContext(), 800);
  });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#drive-toggle')).toBeDisabled();
  await expect(page.locator('#error')).toBeHidden({ timeout: 10_000 });
  await expect(metric(page, 'Travel mode')).toHaveText('driving');
  expect(errors).toEqual([]);
});

test('keeps driving controls and instruments reachable in small windows', async ({ page }) => {
  await page.goto('/'); await start(page);
  for (const size of [{ width: 390, height: 844 }, { width: 1024, height: 450 }]) {
    await page.setViewportSize(size);
    await expect(page.locator('#drive-toggle')).toBeInViewport();
    await expect(page.locator('#drive-hud')).toBeInViewport();
    await page.locator('#controls-toggle').click();
    await page.locator('#suspension').scrollIntoViewIfNeeded();
    await page.locator('#suspension').selectOption('firm');
    await expect(page.locator('#suspension')).toBeInViewport();
    await page.locator('#controls-toggle').click();
  }
  await page.locator('#drive-toggle').click();
  await expect(page.locator('#drive-hud')).toBeHidden();
  await expect(metric(page, 'Travel mode')).toHaveText('flight');
});

test('boards on a bridge and a distant highway service area after origin rebasing', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#terrain-kind').selectOption('forest');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(page.locator('#bridge-view')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#bridge-view').click(); await start(page);
  await expect(metric(page, 'Carriageway width')).toHaveText('8 m');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(20);
  await page.keyboard.up('KeyW'); await page.keyboard.press('KeyR');
  await expect(page.locator('#vehicle-gear')).toHaveText('P');
  await page.locator('#controls-toggle').click();
  await page.locator('#road-type').selectOption('highway');
  await page.getByRole('button', { name: '应用并返回起点' }).click();
  await expect(metric(page, 'Road ready')).toHaveText('yes', { timeout: 30_000 });
  await page.locator('#service-view').click();
  await expect(metric(page, 'Travel mode')).toHaveText('flight');
  await expect(page.locator('#drive-hud')).toBeHidden();
  await expect(page.locator('#service-view')).toHaveText('下一服务区', { timeout: 30_000 });
  await expect(metric(page, 'Road ready')).toHaveText('yes', { timeout: 30_000 });
  await expect.poll(async () => Number(await metric(page, 'Origin rebases').textContent())).toBeGreaterThan(0);
  await start(page);
  await expect(metric(page, 'Pending / queued')).toHaveText('0 / 0', { timeout: 30_000 });
  const position = await metric(page, 'Vehicle position').textContent();
  expect(Number(position!.split(',')[2])).toBeLessThan(-5000);
  await page.keyboard.down('KeyW');
  await expect(metric(page, 'Vehicle position')).not.toHaveText(position!);
  await page.keyboard.up('KeyW');
  await expect(page.locator('#error')).toBeHidden(); expect(errors).toEqual([]);
});
