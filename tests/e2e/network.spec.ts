import { expect, test } from '@playwright/test';

test('randomizes a new trip while reproducing explicit seeds', async ({ page }) => {
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/');
  await expect(metric('Seed')).toHaveText(/^ROAD-/);
  const first = await metric('Seed').textContent();
  await page.reload();
  await expect(metric('Seed')).not.toHaveText(first!);
  await page.goto('/?seed=REPLAY-JOURNEY');
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  const altitude = await page.locator('#altitude').textContent();
  await page.reload();
  await expect(metric('Seed')).toHaveText('REPLAY-JOURNEY');
  await expect(page.locator('#altitude')).toHaveText(altitude!);
  await page.locator('#random-world').click();
  await expect(metric('Seed')).toHaveText(/^ROAD-/);
});

test('reverses across the starting seam and loads the opposite route', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30000 });
  await page.locator('#drive-toggle').click();
  await page.keyboard.down('KeyS');
  await expect(metric('Active route')).toHaveText('back', { timeout: 20000 });
  await expect.poll(async () => Number((await metric('Vehicle position').textContent())!.split(',')[2])).toBeGreaterThan(160);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#vehicle-gear')).toHaveText('P');
  expect(errors).toEqual([]);
});

test('uses signals and adjustable headlights across the fleet and isolates dialog shortcuts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=CLOUD-ROAD-001');
  await page.locator('#vehicle-lights').selectOption('high');
  await page.locator('#light-range').fill('800'); await page.locator('#light-power').fill('175');
  await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30000 });
  await page.locator('#drive-toggle').click();
  await page.keyboard.press('KeyQ'); await expect(metric('Vehicle signal')).toHaveText('left');
  await expect(page.locator('#turn-left')).toHaveClass('lit');
  await expect(page.locator('#turn-left')).not.toHaveClass('lit');
  await page.keyboard.press('KeyE'); await expect(metric('Vehicle signal')).toHaveText('right');
  await page.keyboard.press('KeyH'); await expect(metric('Vehicle signal')).toHaveText('hazard');
  await page.locator('#release-open').click();
  await page.keyboard.press('KeyQ'); await expect(metric('Vehicle signal')).toHaveText('hazard');
  await page.keyboard.press('Escape');
  await page.locator('#controls-toggle').click();
  for (const kind of ['sedan', 'suv', 'truck5', 'truck8', 'semi15', 'semi20', 'minibus', 'coach', 'motorcycle', 'roadster']) {
    await page.locator('#vehicle-kind').selectOption(kind);
    await expect(metric('Vehicle signal')).toHaveText('hazard');
    await expect(metric('Light range')).toHaveText('800 m');
    await expect(metric('Light power')).toHaveText('175%');
  }
  await page.locator('#world').focus(); await page.keyboard.press('KeyH');
  await expect(metric('Vehicle signal')).toHaveText('off');
  expect(errors).toEqual([]);
});
