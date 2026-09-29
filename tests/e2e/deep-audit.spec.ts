import { expect, test } from '@playwright/test';
import { closeSettings, control, openSettings } from './settings';

test('preserves fractional station tempos in controls and saved presets', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  for (const [station, pace] of [['2', '105'], ['3', '75'], ['6', '65']]) {
    await (await control(page, page.locator('#radio-station'))).selectOption(station);
    await expect(page.locator('#music-pace')).toHaveValue(pace);
    await expect(page.locator('#music-pace-value')).toHaveText(`${pace}%`);
    await (await control(page, page.locator('#preset-name'))).fill(`Station ${station}`);
    await page.locator('#preset-save').click(); await expect(page.locator('#preset-status')).toContainText('已保存');
    await (await control(page, page.locator('#radio-station'))).selectOption('10');
    await (await control(page, page.locator('#preset-apply'))).click();
    await expect(page.locator('#preset-status')).toContainText('已应用');
    await expect(page.locator('#music-pace')).toHaveValue(pace); await expect(page.locator('#radio-station')).toHaveValue(station);
  }
});

test('does not bind a released modifier after a rejected combination', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await (await control(page, page.locator('[data-binding="ShiftLeft"]'))).click(); await page.keyboard.press('F9');
  const horn = page.locator('[data-binding="KeyV"]'); await horn.click();
  await page.keyboard.down('ShiftLeft'); await page.keyboard.press('KeyL');
  await expect(page.locator('#bindings-status')).toContainText('占用'); await page.keyboard.up('ShiftLeft');
  await expect(horn).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await expect(horn).toHaveText('V');
  for (const modifier of ['ControlLeft', 'AltLeft']) {
    await horn.click(); await page.keyboard.down(modifier); await page.keyboard.press('ShiftLeft'); await page.keyboard.up(modifier);
    await expect(page.locator('#bindings-status')).toContainText('系统组合键保留');
    await expect(horn).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape'); await expect(horn).toHaveText('V');
  }
  await horn.click(); await page.keyboard.press('ShiftLeft'); await expect(horn).toHaveText('ShiftLeft');
  await page.locator('#bindings-reset').click(); await expect(horn).toHaveText('V');
});

test('keeps fresh movement after closing settings with or without a pending binding', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT');
  await expect(page.locator('[data-metric="Road ready"]')).toHaveText('yes', { timeout: 20_000 });
  const altitude = async () => Number((await page.locator('[data-metric="Coordinates"]').textContent())!.split(',')[1]);
  for (const capturing of [false, true]) {
    await openSettings(page);
    if (capturing) await (await control(page, page.locator('[data-binding="KeyV"]'))).click();
    const before = await altitude();
    await page.evaluate(async () => {
      const dialog = document.getElementById('explorer')!, canvas = document.getElementById('world')!;
      const closed = new Promise<void>(resolve => dialog.addEventListener('close', () => resolve(), { once: true }));
      document.getElementById('settings-close')!.click();
      canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Space' }));
      await closed;
    });
    await expect.poll(altitude).toBeGreaterThan(before + 30);
    await page.keyboard.up('Space');
    await expect(page.locator('[data-binding="KeyV"]')).toHaveText('V');
  }
});

test('keeps the cabin radio and audio status consistent with pause and volume mutes', async ({ page }) => {
  await page.goto('/?seed=FLEET-FLAT'); await page.locator('#drive-toggle').click(); await page.keyboard.press('Digit6');
  const state = page.locator('[data-metric="Audio state"]'), radio = page.locator('#radio-reading');
  await expect(state).toHaveText('running'); await expect(radio).not.toContainText('静音');
  await page.keyboard.press('Slash'); await expect(state).toHaveText('suspended'); await expect(radio).toContainText('静音');
  await page.keyboard.press('Slash'); await expect(state).toHaveText('running'); await expect(radio).not.toContainText('静音');
  await (await control(page, page.locator('#master-volume'))).fill('0');
  await expect(page.locator('#audio-status')).toHaveText('总音量为零'); await expect(radio).toContainText('静音');
  await page.locator('#master-volume').fill('80'); await page.locator('#music-volume').fill('0');
  await expect(state).toHaveText('running'); await expect(radio).toContainText('静音');
  await page.locator('#sfx-volume').fill('0'); await expect(page.locator('#audio-status')).toHaveText('音效与音乐均已静音');
  await page.locator('#music-volume').fill('80'); await closeSettings(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(state).toHaveText('suspended'); await expect(radio).toContainText('静音');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(state).toHaveText('running'); await expect(radio).not.toContainText('静音');
});

test('silences a native shift envelope promptly when its group is muted', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createGain() {
        const node = super.createGain(), set = node.gain.setValueAtTime.bind(node.gain);
        node.gain.setValueAtTime = (value, when) => { if (value === 0.13) Reflect.set(window, 'shiftEnvelope', node.gain); return set(value, when); };
        return node;
      }
    };
  });
  await page.goto('/?seed=FLEET-FLAT'); await (await control(page, page.locator('#audio-toggle'))).click();
  await expect(page.locator('[data-metric="Audio state"]')).toHaveText('running');
  for (let i = 0; i < 2; i++) {
    await page.locator('#engine-volume').fill('100'); await page.locator('#preview-shift').click();
    await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'shiftEnvelope') as AudioParam)?.value), { timeout: 500 }).toBeGreaterThan(0.001);
    await page.locator('#engine-volume').fill('0');
    await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'shiftEnvelope') as AudioParam)?.value), { timeout: 500 }).toBe(0);
  }
});

test('releases native audio after a resume failure and keeps exploration available', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor() { super(); Reflect.set(window, 'failedAudio', this); }
      async resume() { await super.resume(); throw new Error('Injected resume failure'); }
    };
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?seed=FLEET-FLAT'); await (await control(page, page.locator('#audio-toggle'))).click();
  await page.evaluate(async () => { await (Reflect.get(window, 'failedAudio') as AudioContext).suspend(); });
  await expect(page.locator('#audio-status')).toContainText('音频暂不可用');
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'failedAudio') as AudioContext).state)).toBe('closed');
  await closeSettings(page); await page.locator('#drive-toggle').click();
  await expect(page.locator('#drive-hud')).toBeVisible(); await expect(page.locator('#error')).toBeHidden();
  await openSettings(page); await page.keyboard.press('Escape'); await expect(page.locator('#world')).toBeFocused();
  expect(errors).toEqual([]);
});
