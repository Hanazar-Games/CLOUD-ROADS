import { expect, test } from '@playwright/test';
import { closeSettings, control, ignite } from './settings';

test('saves the 10–200 km/h cruise range and respects fog-lamp overrides in presets', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=TRAFFIC-SPEEDS');
  await (await control(page, page.locator('#traffic-minSpeed'))).fill('200');
  await expect(page.locator('#traffic-maxSpeed')).toHaveValue('200');
  await page.locator('#traffic-maxSpeed').fill('10'); await expect(page.locator('#traffic-minSpeed')).toHaveValue('10');
  await page.locator('#traffic-maxSpeed').fill('200');
  await page.screenshot({ path: info.outputPath('npc-speed-settings.png') });
  await (await control(page, page.locator('#nearby-engine-volume'))).fill('135');
  await (await control(page, page.locator('#weather-denseFog'))).check();
  await expect(page.locator('#vehicle-fog-lights')).toBeChecked();
  await (await control(page, page.locator('#vehicle-fog-lights'))).uncheck();
  await (await control(page, page.locator('#preset-name'))).fill('快慢车流与发动机'); await page.locator('#preset-save').click();
  await expect(page.locator('#preset-status')).toContainText('已保存');
  await page.reload();
  await (await control(page, page.locator('#preset-apply'))).click();
  await expect(page.locator('#traffic-minSpeed')).toHaveValue('10'); await expect(page.locator('#traffic-maxSpeed')).toHaveValue('200');
  await expect(page.locator('#nearby-engine-volume')).toHaveValue('135'); await expect(page.locator('#vehicle-fog-lights')).not.toBeChecked();
  await (await control(page, page.locator('#weather-clear'))).check();
  await page.locator('#weather-denseFog').check(); await expect(page.locator('#vehicle-fog-lights')).toBeChecked();
  await (await control(page, page.locator('#traffic-behavior-reset'))).click();
  await expect(page.locator('#traffic-minSpeed')).toHaveValue('30'); await expect(page.locator('#traffic-maxSpeed')).toHaveValue('110');
  expect(errors).toEqual([]);
});

test('keeps a running engine audible after exiting, unloads RPM, and silences it after ignition off', async ({ page }) => {
  test.setTimeout(100_000);
  await page.addInitScript(() => {
    const Native = window.AudioContext, meters: AnalyserNode[] = [];
    window.AudioContext = class extends Native {
      createStereoPanner(): StereoPannerNode {
        const node = super.createStereoPanner(), meter = this.createAnalyser(); meter.fftSize = 2048;
        node.connect(meter); meters.push(meter); return node;
      }
    };
    Reflect.set(window, 'outsideEngineLevel', () => Math.max(0, ...meters.slice(5).map(meter => {
      const data = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    })));
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=OUTSIDE-ENGINE');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('economy');
  await (await control(page, page.locator('#road-type'))).selectOption('highway');
  await page.locator('#route-style').selectOption('0'); await page.locator('#max-grade').fill('0');
  await page.locator('#terrain-kind').selectOption('meadow'); await page.locator('#world-options button[type="submit"]').click();
  await (await control(page, page.locator('#traffic-density'))).fill('0');
  await (await control(page, page.locator('#vehicle-kind'))).selectOption('sedan');
  await (await control(page, page.locator('#audio-toggle'))).click();
  await closeSettings(page); await expect(page.locator('#drive-toggle')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#drive-toggle').click(); await ignite(page);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => Number(await page.locator('#vehicle-speed').textContent()), { timeout: 20_000 }).toBeGreaterThan(60);
  const loaded = Number(await page.locator('#engine-rpm').textContent()); await page.keyboard.up('KeyW');
  await expect.poll(async () => Number(await page.locator('#engine-rpm').textContent()), { timeout: 10_000 }).toBeLessThan(loaded * 0.8);
  await page.keyboard.down('Space'); await expect(page.locator('#vehicle-speed')).toHaveText('0', { timeout: 15_000 }); await page.keyboard.up('Space');
  await page.keyboard.press('KeyF'); await expect(page.locator('[data-metric="Parked vehicle"]')).toHaveText('yes');
  const level = () => page.evaluate(() => Reflect.get(window, 'outsideEngineLevel')() as number);
  await expect.poll(level).toBeGreaterThan(0.003);
  await expect(page.locator('[data-metric="Engine RPM"]')).toHaveText('850');
  await (await control(page, page.locator('#nearby-engine-volume'))).fill('0'); await closeSettings(page);
  await expect.poll(level).toBeLessThan(0.001);
  await (await control(page, page.locator('#nearby-engine-volume'))).fill('100'); await closeSettings(page);
  await expect.poll(level).toBeGreaterThan(0.003);
  await page.keyboard.press('KeyF'); await expect(page.locator('#drive-hud')).toBeVisible();
  await page.keyboard.press('Backquote'); await expect(page.locator('[data-metric="Ignition"]')).toHaveText('off');
  await page.keyboard.press('KeyF'); await expect(page.locator('[data-metric="Parked vehicle"]')).toHaveText('yes');
  await expect.poll(level).toBeLessThan(0.001); expect(errors).toEqual([]);
});
