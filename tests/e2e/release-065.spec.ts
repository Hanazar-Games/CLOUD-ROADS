import { expect, test } from '@playwright/test';
import { closeSettings, control } from './settings';

test('keeps the paused roadbook stable until its range or direction changes', async ({ page }) => {
  await page.goto('/?seed=ROADBOOK-STABLE');
  await expect(page.locator('[data-metric="Pending / queued"]')).toHaveText('0 / 0', { timeout: 30000 });
  await page.locator('#roadbook-open').click(); await expect(page.locator('#roadbook-content')).toBeVisible();
  const changes = await page.locator('#roadbook-content').evaluate(async node => {
    let changes = 0;
    const observer = new MutationObserver(records => { changes += records.length; });
    observer.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
    await new Promise(resolve => setTimeout(resolve, 1800)); observer.disconnect(); return changes;
  });
  expect(changes).toBe(0);
  await page.locator('[data-roadbook-range="1000"]').click(); await expect(page.locator('#roadbook-profile-end')).toHaveText('1.00 km');
  await page.locator('#roadbook-reverse').click(); await expect(page.locator('#roadbook-status')).toContainText('反向查看');
});

test('keeps header actions on one text line in medium windows', async ({ page }, info) => {
  await page.goto('/?seed=HEADER-065');
  for (const width of [621, 680, 740, 850]) {
    await page.setViewportSize({ width, height: 700 });
    const buttons = await page.locator('.header-actions button').evaluateAll(nodes => nodes.map(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      const r = node.getBoundingClientRect();
      return { text: node.textContent, lines: range.getClientRects().length, right: r.right, left: r.left };
    }));
    for (const button of buttons) {
      expect(button.lines, `${width}: ${button.text}`).toBe(1);
      expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 680, height: 700 }); await page.screenshot({ path: info.outputPath('header-medium.png') });
});

test('suspends native audio in the roadbook and recovers after graphics loss', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor() { super(); Reflect.set(window, 'auditAudioContext', this); }
      createOscillator() { Reflect.set(window, 'auditVoices', (Reflect.get(window, 'auditVoices') ?? 0) + 1); return super.createOscillator(); }
    };
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=ROADBOOK-AUDIO');
  await (await control(page, page.locator('#audio-toggle'))).click();
  const state = page.locator('[data-metric="Audio state"]'); await expect(state).toHaveText('running');
  const voices = await page.evaluate(() => Reflect.get(window, 'auditVoices'));
  await closeSettings(page);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+KeyR'); await expect(state).toHaveText('suspended');
    const clock = await page.evaluate(() => (Reflect.get(window, 'auditAudioContext') as AudioContext).currentTime);
    await page.waitForTimeout(180);
    expect(await page.evaluate(() => (Reflect.get(window, 'auditAudioContext') as AudioContext).currentTime)).toBe(clock);
    await page.keyboard.press('Escape'); await expect(state).toHaveText('running');
  }
  await page.keyboard.press('Shift+KeyR');
  await page.locator('#world').evaluate(canvas => {
    const extension = (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 600);
  });
  await expect(page.locator('#roadbook-dialog')).toBeHidden(); await expect(page.locator('#error')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#world')).toBeFocused(); await expect(state).toHaveText('running');
  await page.keyboard.press('Shift+KeyR'); await expect(page.locator('#roadbook-content')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => Reflect.get(window, 'auditVoices'))).toBe(voices); expect(errors).toEqual([]);
});
