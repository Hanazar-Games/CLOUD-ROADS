import { expect, test } from '@playwright/test';

test('flight mixer emits sound, isolates layers, pauses and releases its continuous sources', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = AudioContext;
    const contexts: AudioContext[] = [], sources: { node: AudioBufferSourceNode; stopped: boolean }[] = [];
    Reflect.set(window, 'flightAudioContexts', contexts); Reflect.set(window, 'flightAudioSources', sources);
    window.AudioContext = class extends Native {
      constructor() { super(); contexts.push(this); }
      createDynamicsCompressor() {
        const limiter = super.createDynamicsCompressor(), meter = this.createAnalyser();
        limiter.connect(meter); Reflect.set(window, 'flightAudioMeter', meter); return limiter;
      }
      createBufferSource() {
        const node = super.createBufferSource(), record = { node, stopped: false }, stop = node.stop.bind(node);
        node.stop = (when?: number) => { record.stopped = true; stop(when); }; sources.push(record); return node;
      }
    };
  });
  await page.goto('/?seed=CLOUD-FLIGHT-AUDIO');
  await page.locator('#aircraft-toggle').click();
  await expect(page.locator('#airport-board')).toBeEnabled(); await page.locator('#airport-board').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.locator('[data-action="sound"]').click();
  await expect(page.locator('[data-action="sound"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="pause"]').click(); await page.locator('[data-action="hangar"]').click();
  await page.locator('.av-audio-settings summary').click();
  for (const [key, value] of [['music', '0'], ['sfx', '100']]) await page.locator(`[data-volume="${key}"]`).fill(value);
  for (const key of ['engine', 'wind', 'runway', 'mechanical']) {
    await page.locator(`[data-sound="${key}"]`).fill('100');
    await expect(page.locator(`[data-sound-value="${key}"]`)).toHaveText('100%');
  }
  const level = () => page.evaluate(() => {
    const meter = Reflect.get(window, 'flightAudioMeter') as AnalyserNode, samples = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  });
  const loops = () => page.evaluate(() => (Reflect.get(window, 'flightAudioSources') as { node: AudioBufferSourceNode; stopped: boolean }[]).filter(s => s.node.loop && !s.stopped).length);
  await page.locator('[data-action="airborne"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await expect.poll(level).toBeGreaterThan(.001); expect(await level()).toBeLessThan(.3);
  expect(await loops()).toBe(1);
  await page.locator('[data-action="pause"]').click();
  await expect.poll(level).toBeLessThan(.00001);
  for (const key of ['engine', 'wind', 'runway', 'mechanical']) await page.locator(`[data-sound="${key}"]`).fill('0');
  await page.locator('[data-action="pause"]').click();
  await expect(page.locator('.av-panel')).toBeHidden();
  await page.waitForTimeout(300); expect(await level()).toBeLessThan(.00001);
  await page.locator('[data-action="pause"]').click();
  await page.locator('[data-volume="music"]').fill('100');
  await page.locator('[data-action="pause"]').click();
  await expect.poll(level).toBeGreaterThan(.001);
  expect(await loops()).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('.av-panel')).toBeVisible(); await expect.poll(level).toBeLessThan(.00001);
  await page.locator('[data-action="exit"]').click();
  expect(await page.evaluate(() => (Reflect.get(window, 'flightAudioContexts') as AudioContext[])[0].state)).toBe('closed');
  expect(await loops()).toBe(1); // The resumed road mixer owns its own noise source.
  expect(errors).toEqual([]);
});
