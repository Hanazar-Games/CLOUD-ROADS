import { expect, test } from '@playwright/test';
import { control } from '../e2e/settings';

test('built audio previews, recovery and the independent test tone emit sound', async ({ page }) => {
  const errors: string[] = [], warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().includes('AudioContext was not allowed')) warnings.push(message.text()); });
  await page.addInitScript(() => {
    // Audio checks need a live game loop, but not GPU-heavy scenery on a CPU-only runner.
    document.addEventListener('DOMContentLoaded', () => {
      const preset = document.querySelector<HTMLSelectElement>('#graphics-preset')!;
      preset.value = 'minimal'; preset.dispatchEvent(new Event('change', { bubbles: true }));
      for (const id of ['music', 'weather', 'nature', 'cabin', 'npc-horn', 'nearby-engine']) {
        const input = document.querySelector<HTMLInputElement>(`#${id}-volume`)!;
        input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { once: true });
    const Native = AudioContext, contexts: AudioContext[] = [];
    Reflect.set(window, 'pagesAudioContexts', contexts);
    Reflect.set(window, 'pagesAudioPeak', 0);
    let generation = 0, meter: AudioWorkletNode | undefined;
    Reflect.set(window, 'resetPagesAudio', () => {
      generation++; Reflect.set(window, 'pagesAudioPeak', 0); meter?.port.postMessage(generation);
    });
    const module = URL.createObjectURL(new Blob([`
      registerProcessor('pages-audio-meter', class extends AudioWorkletProcessor {
        constructor(options) {
          super(); this.generation = options.processorOptions.generation; this.peak = 0;
          this.port.onmessage = event => { this.generation = event.data; this.peak = 0; };
        }
        process(inputs) {
          const samples = inputs[0][0];
          if (samples) {
            const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
            if (rms > this.peak) { this.peak = rms; this.port.postMessage({ generation: this.generation, peak: rms }); }
          }
          return true;
        }
      });
    `], { type: 'text/javascript' }));
    window.AudioContext = class extends Native {
      constructor() { super(); contexts.push(this); }
      createDynamicsCompressor() {
        const limiter = super.createDynamicsCompressor();
        Reflect.set(window, 'pagesAudioMeterReady', this.audioWorklet.addModule(module).then(() => {
          if (this.state === 'closed') return;
          meter = new AudioWorkletNode(this, 'pages-audio-meter', { processorOptions: { generation } });
          meter.port.onmessage = event => {
            if (event.data.generation === generation) Reflect.set(window, 'pagesAudioPeak', event.data.peak);
          };
          limiter.connect(meter); meter.connect(this.destination);
        }));
        return limiter;
      }
    };
  });
  await page.goto('./?seed=PAGES-AUDIO');
  await expect(page.locator('#graphics-preset')).toHaveValue('minimal');
  const states = () => page.evaluate(() => (Reflect.get(window, 'pagesAudioContexts') as AudioContext[]).map(c => c.state));
  const peak = () => page.evaluate(() => Reflect.get(window, 'pagesAudioPeak') as number);
  const resetPeak = () => page.evaluate(() => { (Reflect.get(window, 'resetPagesAudio') as () => void)(); });
  await control(page, page.locator('#preview-engine'));
  for (const kind of ['engine', 'shift', 'horn']) {
    await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
    await resetPeak();
    await page.locator(`#preview-${kind}`).click();
    await page.evaluate(() => Reflect.get(window, 'pagesAudioMeterReady') as Promise<void>);
    await expect.poll(states).toEqual(['running']);
    await expect.poll(peak).toBeGreaterThan(kind === 'shift' ? 0.0001 : 0.003);
    await expect(page.locator('#audio-preview-status')).toContainText('试听已结束');
    await page.locator('#audio-toggle').click();
    await expect.poll(states).toEqual(['suspended']);
  }
  await page.locator('#audio-recover').click();
  await expect.poll(states).toEqual(['closed', 'running']);
  await page.evaluate(() => Reflect.get(window, 'pagesAudioMeterReady') as Promise<void>);
  for (const id of ['music', 'sfx']) await page.locator(`#${id}-volume`).fill('0');
  await expect.poll(states).toEqual(['closed', 'suspended']);
  await resetPeak();
  await page.locator('#audio-test').click();
  await expect.poll(peak).toBeGreaterThan(0.015);
  await expect.poll(states).toEqual(['closed', 'suspended']);
  await expect(page.locator('#sfx-volume')).toHaveValue('0');
  await expect(page.locator('#music-volume')).toHaveValue('0');
  expect(warnings).toEqual([]); expect(errors).toEqual([]);
});
