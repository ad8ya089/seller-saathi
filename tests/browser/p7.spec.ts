import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installMockBackend } from './mock-backend';

async function ready(page: Page): Promise<void> {
  await expect(
    page.getByRole('status').filter({ hasText: 'Ready for text' }),
  ).toBeVisible();
}
async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Type a message to your KAM').fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByLabel('Type a message to your KAM')).toHaveValue('');
  await ready(page);
}
test('verified-profile UI starts Hinglish, locks the language, then opens a separate clean English call', async ({
  page,
}) => {
  const backend = await installMockBackend(page);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'English', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Hindi', exact: true }).click();
  await page
    .getByRole('button', { name: 'Call Virtual KAM', exact: true })
    .click();
  await ready(page);
  expect(backend.sessionInputs[0]?.lang).toBe('hi-IN');
  await expect(
    page.getByRole('button', { name: 'English', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Hindi', exact: true }),
  ).toBeDisabled();
  await send(page, 'Meri sale gir gayi hai.');
  await expect(page.getByRole('log')).toContainText('Meri sale gir gayi hai.');
  await expect(page.getByRole('log')).toContainText('Stock ki kami');
  await page.getByRole('button', { name: 'End Call', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page
    .getByRole('button', { name: 'Call Virtual KAM', exact: true })
    .click();
  await ready(page);
  expect(backend.sessionInputs[1]?.lang).toBe('en-IN');
  await expect(page.getByRole('log')).toContainText('an AI assistant');
  await expect(page.getByRole('log')).not.toContainText('Namaste');
  await expect(page.getByRole('log')).not.toContainText('Meri sale');
});

for (const width of [1280, 390])
  test(`Day-7 at ${String(width)}px: exact committed plan, audit and explicit new acceptance`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const backend = await installMockBackend(page);
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Call Virtual KAM', exact: true })
      .click();
    await ready(page);
    await send(page, 'My sales dropped.');
    await send(page, 'Yes, both. The supplier is late.');
    await send(page, 'Ten days.');
    await page.getByRole('tab', { name: 'Recovery Plan' }).click();
    const panel = page.getByRole('tabpanel', {
      name: 'Recovery Plan',
      exact: true,
    });
    await expect(
      page.getByRole('button', { name: 'Fast-forward 7 days' }),
    ).toHaveCount(0);
    await expect(panel).not.toContainText('11.9');
    await page
      .getByRole('button', { name: 'Confirm Plan', exact: true })
      .click();
    const fastForward = page.getByRole('button', {
      name: 'Fast-forward 7 days',
    });
    await expect(fastForward).toBeEnabled();
    const original = JSON.stringify(backend.saved[0]);
    await fastForward.click();
    await ready(page);
    expect(backend.sessionInputs[1]).toMatchObject({
      mode: 'followup',
      planId: backend.saved[0]?.plan.id,
    });
    await expect(panel).toContainText('Illustrative synthetic data');
    await expect(panel).toContainText('11.9');
    await expect(panel).toContainText('9.6%');
    await expect(panel.getByLabel('Commitment audit')).toContainText('Partial');
    await expect(panel.getByLabel('Commitment audit')).toContainText('Done');
    await expect(panel.getByLabel('Remaining stock gaps')).toContainText(
      'printed georgette saree',
    );
    await expect(panel).not.toContainText('Saved to demo ledger');
    await send(page, 'Yes, the audit matches.');
    await expect(
      page.getByRole('button', { name: 'Confirm New Plan' }),
    ).toBeEnabled();
    await expect(panel).toContainText('They have not been saved');
    expect(backend.saved).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir(resolve('.tmp/p7/screenshots'), { recursive: true });
    await page.screenshot({
      path: resolve(`.tmp/p7/screenshots/followup-${String(width)}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Confirm New Plan' }).click();
    await expect(panel).toContainText('Saved to demo ledger');
    await expect(panel).toContainText('Confirmed new actions');
    expect(backend.saved).toHaveLength(2);
    expect(JSON.stringify(backend.saved[1])).toBe(original);
  });
