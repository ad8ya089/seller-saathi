import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { wavFixture } from '../voice/fixtures';

for (const completedFirst of [false, true])
  test(`real Chrome interruption after ${completedFirst ? 'one' : 'zero'} completed sentences`, async ({
    page,
  }) => {
    const result = await build({
      entryPoints: ['tests/browser/barge-in-harness.ts'],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'P5',
      platform: 'browser',
      target: 'es2022',
    });
    await page.goto('/');
    await page.addScriptTag({ content: result.outputFiles[0]?.text ?? '' });
    // This harness is injected by the runner only. Production has no test route.
    const report = await page.evaluate(
      async ({ wav, greeting, completedFirst }) => {
        const harness = window as typeof window & {
          P5: {
            interruptInChrome: (
              wav: string,
              greeting: string,
              completedFirst: boolean,
            ) => Promise<{
              stopMs: number;
              aborted: boolean;
              played: number;
              submissions: number;
            }>;
          };
        };
        return await harness.P5.interruptInChrome(
          wav,
          greeting,
          completedFirst,
        );
      },
      {
        completedFirst,
        wav: wavFixture({ sampleRate: 24000, durationMs: 5000 }).toString(
          'base64',
        ),
        greeting: wavFixture({ sampleRate: 24000 }).toString('base64'),
      },
    );
    expect(report.stopMs).toBeLessThan(300);
    expect(report.aborted).toBe(true);
    expect(report.played).toBe(completedFirst ? 1 : 0);
    expect(report.submissions).toBe(2);
    await mkdir('.tmp/p5', { recursive: true });
    await writeFile(
      `.tmp/p5/chrome-interruption-${String(completedFirst)}.json`,
      JSON.stringify(report, null, 2),
    );
  });
