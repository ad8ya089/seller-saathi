import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installMockBackend } from './mock-backend';
import { z } from 'zod';
import { publicErrorSchema } from '@/lib/voice/events';

const screenshots = resolve('.tmp/p4/screenshots');
async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Type a message to your KAM').fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Send', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('status').filter({ hasText: 'Ready for text' }),
  ).toBeVisible();
}
async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Call Virtual KAM', exact: true })
    .click();
  await expect(
    page.getByRole('log', { name: 'Call transcript' }),
  ).toContainText('an AI assistant');
  await expect(
    page.getByRole('status').filter({ hasText: 'Ready for text' }),
  ).toBeVisible();
}
async function reachPlan(page: Page): Promise<void> {
  await start(page);
  await send(page, 'My sales dropped.');
  await send(page, 'Yes, both. The supplier is late.');
  await send(page, 'Ten days.');
  await page.getByRole('tab', { name: 'Recovery Plan' }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm Plan', exact: true }),
  ).toBeEnabled();
}
test.beforeAll(async ({ request }) => {
  const health = z
    .object({
      providers: z.strictObject({ gemini: z.boolean(), sarvam: z.boolean() }),
    })
    .parse(await (await request.get('/api/health')).json());
  expect(health.providers).toEqual({ gemini: false, sarvam: false });
  const unconfigured = await request.post('/api/session', {
    data: { lang: 'en-IN', mode: 'call' },
  });
  expect(unconfigured.status()).toBe(503);
  expect(publicErrorSchema.parse(await unconfigured.json()).code).toBe(
    'PROVIDER_CONFIG',
  );
  await mkdir(screenshots, { recursive: true });
});

test('desktop: live panels, pending confirmation, actual save and a new-session reset', async ({
  page,
}) => {
  const backend = await installMockBackend(page);
  backend.confirmation = 'pending';
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4200/'))
      external.push(request.url());
  });
  await start(page);
  const snapshot = page.getByRole('tabpanel', {
    name: 'Snapshot',
    exact: true,
  });
  await expect(snapshot).toContainText('₹1,35,000');
  await expect(snapshot).toContainText('−₹65,000');
  await send(page, 'My sales dropped.');
  await page.screenshot({
    path: resolve(screenshots, 'desktop-1280-snapshot.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('tab', { name: 'Diagnosis' }).click();
  const diagnosis = page.getByRole('tabpanel', {
    name: 'Diagnosis',
    exact: true,
  });
  await expect(diagnosis).toContainText('Stock availability');
  await expect(diagnosis).toContainText('1 / 3 questions');
  await expect(diagnosis).toContainText('synthetic SKU data');
  await send(page, 'Yes, both. The supplier is late.');
  await expect(diagnosis).toContainText('Seller said');
  await expect(diagnosis).toContainText('2 / 3 questions');
  await page.screenshot({
    path: resolve(screenshots, 'desktop-1280-diagnosis.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await send(page, 'Ten days.');
  await page.getByRole('tab', { name: 'Recovery Plan' }).click();
  const plan = page.getByRole('tabpanel', {
    name: 'Recovery Plan',
    exact: true,
  });
  await expect(plan).toContainText('Awaiting acceptance');
  await expect(plan).not.toContainText('Saved to demo ledger');
  await page.getByRole('button', { name: 'Confirm Plan', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Saving…', exact: true }),
  ).toBeDisabled();
  await expect(plan).not.toContainText('Saved to demo ledger');
  backend.release();
  await expect(plan).toContainText(
    'Saved to demo ledger — not sent to Snapdeal',
  );
  await expect(plan).toContainText('Follow-up: 17 Nov 2026');
  expect(backend.saved).toHaveLength(1);
  expect(backend.decisions).toEqual(['accept']);
  await page.screenshot({
    path: resolve(screenshots, 'desktop-1280-saved-plan.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Call Virtual KAM again' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Ready for text' }),
  ).toBeVisible();
  await expect(plan).not.toContainText('Saved to demo ledger');
  await expect(page.getByRole('log')).not.toContainText('Ten days.');
  expect(backend.sessions).toBe(2);
  expect(external).toEqual([]);
});

test('failed confirmation never shows saved; Not Now uses decline and writes nothing', async ({
  page,
}) => {
  const backend = await installMockBackend(page);
  backend.confirmation = 'failure';
  await reachPlan(page);
  const plan = page.getByRole('tabpanel', {
    name: 'Recovery Plan',
    exact: true,
  });
  await page.getByRole('button', { name: 'Confirm Plan', exact: true }).click();
  await expect(plan).toContainText('Save was not confirmed');
  await expect(plan).not.toContainText('Saved to demo ledger');
  expect(backend.saved).toEqual([]);
  backend.confirmation = 'success';
  await page.getByRole('button', { name: 'Not Now', exact: true }).click();
  await expect(plan).toContainText('Plan not saved');
  await expect(plan).not.toContainText('Confirm Plan');
  expect(backend.saved).toEqual([]);
  expect(backend.decisions).toEqual(['accept', 'decline']);
  await page.screenshot({
    path: resolve(screenshots, 'desktop-1280-declined-plan.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

test('390px: stacked layout, keyboard tabs, reduced motion and no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockBackend(page);
  await start(page);
  await send(page, 'My sales dropped.');
  await expect(
    page.getByRole('tabpanel', { name: 'Snapshot', exact: true }),
  ).toContainText('₹2,00,000');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(screenshots, 'mobile-390-snapshot.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const snapshotTab = page.getByRole('tab', { name: 'Snapshot', exact: true });
  await snapshotTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Diagnosis', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('tab', { name: 'Diagnosis', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(
    page.getByRole('tab', { name: 'Recovery Plan', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Home');
  await expect(snapshotTab).toBeFocused();
  await send(page, 'Yes, both. The supplier is late.');
  await send(page, 'Ten days.');
  await page.getByRole('tab', { name: 'Recovery Plan' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator('.voice-orb')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: 'Hindi', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.screenshot({
    path: resolve(screenshots, 'mobile-390-plan.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

test('debug requires the query flag and reports unavailable fields honestly', async ({
  page,
}) => {
  await installMockBackend(page);
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'Session debug', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Debug', exact: true }).click();
  const debug = page.getByRole('region', {
    name: 'Session debug',
    exact: true,
  });
  await expect(debug).toBeVisible();
  await expect(debug).toContainText('Not available');
  await expect(debug).not.toContainText('11.77');
  await expect(debug).not.toContainText('₹');
});

test('skip navigation is hidden until keyboard focus and moves focus to the workspace', async ({
  page,
}) => {
  await installMockBackend(page);
  await page.goto('/');
  const skip = page.getByRole('link', { name: 'Skip to workspace' });
  expect(
    await skip.evaluate((element) => getComputedStyle(element).clipPath),
  ).toBe('inset(50%)');
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  expect(
    await skip.evaluate((element) => getComputedStyle(element).clipPath),
  ).toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toBeFocused();
});
