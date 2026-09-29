import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('reports muted preview groups and clears completed and interrupted previews', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#audio-toggle'))).click();
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
  const status = page.locator('#audio-preview-status');
  await page.locator('#engine-volume').fill('0');
  for (const kind of ['engine', 'shift']) {
    await page.locator(`#preview-${kind}`).click();
    await expect(status).toContainText('发动机与换挡'); await expect(status).not.toContainText('正在试听');
  }
  await page.locator('#effects-volume').fill('0'); await page.locator('#preview-horn').click();
  await expect(status).toContainText('喇叭、提示与脚步'); await expect(status).not.toContainText('正在试听');
  await page.locator('#engine-volume').fill('100'); await page.locator('#preview-engine').click();
  await expect(status).toContainText('正在试听'); await expect(status).toContainText('试听已结束');
  await page.locator('#preview-engine').click(); await expect(status).toContainText('正在试听');
  await page.locator('#engine-volume').fill('0'); await expect(status).toContainText('试听已结束');
  await page.locator('#effects-volume').fill('100'); await page.locator('#preview-horn').click();
  await page.locator('#audio-toggle').click(); await expect(status).toContainText('试听已结束');
});

test('shows the rebound boarding key after HUD refresh, reload and reset', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('[data-binding="KeyF"]'))).click(); await page.keyboard.press('F9');
  await closeSettings(page); await page.locator('#drive-toggle').click(); await page.keyboard.press('F9');
  const help = page.locator('#boarding-help'), mode = page.locator('[data-metric="Travel mode"]');
  await expect(mode).toHaveText('walking'); await expect(help).toHaveText('F9 · 开门回到车辆');
  await page.keyboard.press('KeyF'); await expect(mode).toHaveText('walking');
  await page.keyboard.press('F9'); await expect(mode).toHaveText('driving');
  await page.reload(); await page.locator('#drive-toggle').click(); await page.keyboard.press('F9');
  await expect(help).toHaveText('F9 · 开门回到车辆');
  await (await control(page, page.locator('#bindings-reset'))).click(); await closeSettings(page);
  await expect(help).toHaveText('F · 开门回到车辆');
  await page.keyboard.press('KeyF'); await expect(mode).toHaveText('driving');
});

test('keeps ten radio channels audible and bounded through rapid tuning and pause', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createGain() {
        const gain = super.createGain();
        if (!Reflect.get(window, 'musicMeter')) {
          const meter = this.createAnalyser(); gain.connect(meter); Reflect.set(window, 'musicMeter', meter);
        }
        return gain;
      }
      createOscillator() { Reflect.set(window, 'voiceCount', (Reflect.get(window, 'voiceCount') ?? 0) + 1); return super.createOscillator(); }
    };
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('#sfx-volume'))).fill('0');
  await page.locator('#music-volume').fill('100'); await page.locator('#audio-toggle').click();
  const state = page.locator('[data-metric="Audio state"]'); await expect(state).toHaveText('running');
  const voices = await page.evaluate(() => Reflect.get(window, 'voiceCount'));
  const level = () => page.evaluate(() => {
    const meter = Reflect.get(window, 'musicMeter') as AnalyserNode, samples = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
  });
  for (let channel = 1; channel <= 10; channel++) {
    await page.locator('#radio-station').selectOption(String(channel));
    await page.waitForTimeout(650);
    await expect.poll(level).toBeGreaterThan(0.005); expect(await level()).toBeLessThan(0.5);
  }
  for (const channel of ['7', '8', '10']) await page.locator('#radio-station').selectOption(channel);
  await closeSettings(page); await page.keyboard.press('Slash'); await expect(state).toHaveText('suspended');
  await openSettings(page); await page.locator('[data-settings-target="audio"]').click();
  await page.locator('#radio-station').selectOption('1'); await closeSettings(page);
  await page.keyboard.press('Slash'); await expect(state).toHaveText('running');
  await expect.poll(level).toBeGreaterThan(0.005);
  expect(await page.evaluate(() => Reflect.get(window, 'voiceCount'))).toBe(voices); expect(errors).toEqual([]);
});
