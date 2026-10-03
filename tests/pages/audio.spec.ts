import { expect, test } from '@playwright/test';
import { control } from '../e2e/settings';

test.use({ launchOptions: { args: [
  ...(process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--enable-webgl']),
  '--autoplay-policy=document-user-activation-required',
] } });

test('built audio previews, recovery and the independent test tone emit sound', async ({ page }) => {
  const errors: string[] = [], warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().includes('AudioContext was not allowed')) warnings.push(message.text()); });
  await page.addInitScript(() => {
    const Native = AudioContext, contexts: AudioContext[] = [];
    Reflect.set(window, 'pagesAudioContexts', contexts);
    Reflect.set(window, 'pagesAudioPeak', 0);
    window.AudioContext = class extends Native {
      constructor() { super(); contexts.push(this); }
      createDynamicsCompressor() {
        const limiter = super.createDynamicsCompressor(), meter = this.createAnalyser();
        limiter.connect(meter);
        const samples = new Float32Array(meter.fftSize);
        const timer = setInterval(() => {
          if (this.state === 'closed') { clearInterval(timer); return; }
          if (this.state !== 'running') return;
          meter.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          Reflect.set(window, 'pagesAudioPeak', Math.max(Reflect.get(window, 'pagesAudioPeak') as number, rms));
        }, 10);
        return limiter;
      }
    };
  });
  await page.goto('./?seed=PAGES-AUDIO');
  await (await control(page, page.locator('#graphics-preset'))).selectOption('economy');
  await (await control(page, page.locator('#view-distance'))).fill('1');
  for (const id of ['music', 'weather', 'nature', 'cabin', 'npc-horn', 'nearby-engine']) {
    await (await control(page, page.locator(`#${id}-volume`))).fill('0');
  }
  const states = () => page.evaluate(() => (Reflect.get(window, 'pagesAudioContexts') as AudioContext[]).map(c => c.state));
  const peak = () => page.evaluate(() => Reflect.get(window, 'pagesAudioPeak') as number);
  const resetPeak = () => page.evaluate(() => { Reflect.set(window, 'pagesAudioPeak', 0); });
  for (const kind of ['engine', 'shift', 'horn']) {
    await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
    await resetPeak();
    await (await control(page, page.locator(`#preview-${kind}`))).click();
    await expect.poll(states).toEqual(['running']);
    await expect.poll(peak).toBeGreaterThan(kind === 'shift' ? 0.0001 : 0.003);
    await expect(page.locator('#audio-preview-status')).toContainText('试听已结束');
    await page.locator('#audio-toggle').click();
    await expect.poll(states).toEqual(['suspended']);
  }
  await (await control(page, page.locator('#audio-recover'))).click();
  await expect.poll(states).toEqual(['closed', 'running']);
  for (const id of ['music', 'sfx']) await (await control(page, page.locator(`#${id}-volume`))).fill('0');
  await expect.poll(states).toEqual(['closed', 'suspended']);
  await resetPeak();
  await (await control(page, page.locator('#audio-test'))).click();
  await expect.poll(peak).toBeGreaterThan(0.015);
  await expect.poll(states).toEqual(['closed', 'suspended']);
  await expect(page.locator('#sfx-volume')).toHaveValue('0');
  await expect(page.locator('#music-volume')).toHaveValue('0');
  expect(warnings).toEqual([]); expect(errors).toEqual([]);
});
