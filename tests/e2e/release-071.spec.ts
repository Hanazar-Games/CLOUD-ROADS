import { expect, test } from '@playwright/test';
import { closeSettings, control } from './settings';

test('keeps localized audio status quiet until the actual state changes', async ({ page }) => {
  await page.goto('/?seed=AUDIT-071-AUDIO');
  await (await control(page, page.locator('#interface-language'))).selectOption('en');
  await control(page, page.locator('#audio-toggle'));
  const status = page.locator('#audio-status');
  await expect(status).toHaveText('Sound off');
  const changes = await status.evaluate(async node => {
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(node, { subtree: true, childList: true, characterData: true });
    await new Promise(resolve => setTimeout(resolve, 700)); observer.disconnect(); return count;
  });
  expect(changes).toBe(0);
  await page.locator('#audio-toggle').click();
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
  await expect(status).not.toHaveText('Sound off');
  await closeSettings(page); await page.locator('#release-open').click();
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('suspended');
  await expect(status).toContainText('paused');
  await expect(status).not.toContainText('browser');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
});

test('cancels a native shift envelope when SFX are muted while music keeps playing', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createGain() {
        const gain = super.createGain(), ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
        gain.gain.linearRampToValueAtTime = (value, when) => {
          if (value === 0.13) Reflect.set(window, 'shiftEnvelope', gain.gain);
          return ramp(value, when);
        };
        return gain;
      }
    };
  });
  await page.goto('/?seed=AUDIT-071-SFX');
  await (await control(page, page.locator('#engine-volume'))).fill('100');
  await page.locator('#preview-shift').click();
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'shiftEnvelope') as AudioParam)?.value)).toBeGreaterThan(0.001);
  await page.locator('#sfx-volume').fill('0');
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'shiftEnvelope') as AudioParam)?.value)).toBe(0);
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
  await page.locator('#sfx-volume').fill('80');
  expect(await page.evaluate(() => (Reflect.get(window, 'shiftEnvelope') as AudioParam).value)).toBe(0);
});
