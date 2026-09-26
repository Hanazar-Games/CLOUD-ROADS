import { expect, type Locator, type Page } from '@playwright/test';

export async function openSettings(page: Page): Promise<void> {
  const dialog = page.locator('#explorer');
  if (!await dialog.evaluate(node => (node as HTMLDialogElement).open)) await page.locator('#controls-toggle').click();
  await expect(dialog).toBeVisible();
}

export async function closeSettings(page: Page): Promise<void> {
  if (await page.locator('#explorer').evaluate(node => (node as HTMLDialogElement).open)) {
    await page.locator('#settings-close').click();
    await expect(page.locator('#world')).toBeFocused();
  }
}

export async function control(page: Page, locator: Locator): Promise<Locator> {
  await locator.waitFor({ state: 'attached' });
  const inside = await locator.evaluate(node => !!node.closest('#explorer'));
  if (inside) {
    await openSettings(page);
    const category = await locator.evaluate(node => node.closest('.settings-category')?.id.replace('settings-', ''));
    if (category) await page.locator(`[data-settings-target="${category}"]`).click();
  } else await closeSettings(page);
  await locator.scrollIntoViewIfNeeded();
  return locator;
}

export async function toggleSettings(page: Page): Promise<void> {
  if (await page.locator('#explorer').evaluate(node => (node as HTMLDialogElement).open)) await closeSettings(page);
  else await openSettings(page);
}

export async function sceneShot(page: Page, options?: Parameters<Page['screenshot']>[0]): Promise<Buffer> {
  await closeSettings(page);
  return page.screenshot(options);
}
