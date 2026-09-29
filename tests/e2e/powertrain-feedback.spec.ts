import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite, openSettings } from './settings';

test('makes all setting search results reachable by keyboard and clears search before closing', async ({ page }) => {
  await page.goto('/?seed=SEARCH-061'); await openSettings(page);
  const search = page.locator('#settings-search'), results = page.locator('#settings-search-results button');
  await search.fill('vehicle');
  const count = Number((await page.locator('#settings-search-status').textContent())!.match(/\d+/)![0]);
  expect(count).toBeGreaterThan(8); await expect(results).toHaveCount(count);
  await search.press('ArrowDown'); await expect(results.first()).toBeFocused();
  await page.keyboard.press('End'); await expect(results.last()).toBeFocused();
  await expect(results.last()).toBeInViewport();
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await expect(results.nth(1)).toBeFocused();
  await page.keyboard.press('Escape'); await expect(search).toBeFocused(); await expect(search).toHaveValue('');
  await expect(page.locator('#explorer')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
});

test('finds controls directly, keeps tuning across models and fits a small settings window', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?seed=POWERTRAIN-053'); await openSettings(page);
  const search = page.locator('#settings-search'), results = page.locator('#settings-search-results');
  await search.fill('转速'); await expect(results).toContainText('燃油转速响应');
  await search.press('Enter'); await expect(page.locator('#engine-response')).toBeFocused();
  await page.locator('#engine-response').fill('125'); await expect(page.locator('#engine-response-value')).toHaveText('125%');
  await page.locator('#vehicle-kind').selectOption('truck8'); await expect(page.locator('#engine-response')).toHaveValue('125');
  await page.locator('#vehicle-energy').selectOption('ev'); await expect(page.locator('#engine-response')).toBeDisabled();
  await page.locator('#vehicle-energy').selectOption('combustion'); await expect(page.locator('#engine-response')).toBeEnabled();
  await search.fill('碰撞'); await search.press('Enter'); await expect(page.locator('#collision-volume')).toBeFocused();
  await page.locator('#collision-volume').fill('40'); await expect(page.locator('#collision-volume-value')).toHaveText('40%');
  await search.fill('音乐压低'); await search.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('#music-ducking')).toBeFocused(); await page.locator('#music-ducking').fill('65');
  await expect(page.locator('#music-ducking-value')).toHaveText('65%');
  await search.fill('unmatched-setting'); await expect(page.locator('#settings-search-status')).toContainText('没有匹配项');
  await page.locator('#settings-search-clear').click(); await expect(search).toBeFocused(); await expect(results).toBeHidden();
  await page.setViewportSize({ width: 390, height: 450 }); await search.fill('月球');
  await results.getByRole('button').first().click(); await expect(page.locator('#terrain-kind')).toBeFocused();
  expect(await page.locator('#explorer').evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
  await page.locator('#settings-close').click(); await expect(page.locator('#world')).toBeFocused();
  expect(errors).toEqual([]);
});

test('shows load release, a real RPM drop and gear transitions while the car keeps rolling', async ({ page }) => {
  const metric = (name: string) => page.locator(`[data-metric="${name}"]`);
  await page.goto('/?seed=RPM-FLAT');
  for (const [id, value] of [['terrain-kind', 'meadow'], ['road-type', 'highway'], ['route-style', '0']])
    await (await control(page, page.locator(`#${id}`))).selectOption(value);
  await (await control(page, page.locator('#max-grade'))).fill('0');
  await (await control(page, page.getByRole('button', { includeHidden: true, name: '应用并返回起点' }))).click();
  await expect(metric('Road ready')).toHaveText('yes', { timeout: 30000 });
  await (await control(page, page.locator('#transmission-mode'))).selectOption('manual');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await metric('Engine RPM').textContent())).toBeGreaterThan(4500);
  await page.keyboard.up('KeyW');
  const loaded = Number(await metric('Engine RPM').textContent());
  await expect.poll(async () => Number(await metric('Engine RPM').textContent())).toBeLessThan(loaded - 250);
  await expect(page.locator('#engine-load-status')).toContainText('带挡滑行');
  expect(Number(await page.locator('#vehicle-speed').textContent())).toBeGreaterThan(6);
  await page.keyboard.press('BracketRight'); await expect(metric('Transmission')).toHaveText('manual / 2');
  await expect.poll(async () => Number(await metric('Engine RPM').textContent())).toBeLessThan(loaded - 700);
  await page.keyboard.press('Slash');
  await expect(page.locator('#vehicle-status')).toHaveText('已暂停');
  await metric('Engine RPM').evaluate(node => new Promise<void>(resolve => {
    const observer = new MutationObserver(() => { observer.disconnect(); resolve(); });
    observer.observe(node, { childList: true });
  }));
  const paused = await metric('Engine RPM').textContent(); await page.waitForTimeout(400);
  await expect(metric('Engine RPM')).toHaveText(paused!);
});
