import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { getConfig } from '@/lib/server/config';
import { sarvamSmokePlan } from '@/lib/voice/language';
import { runHinglishSmoke } from '@/lib/voice/language-smoke';
import { SarvamStt } from '@/lib/voice/sarvam-stt';
import { SarvamTts } from '@/lib/voice/sarvam-tts';
import { AppError } from '@/lib/errors';

export async function smokeHinglish(args: readonly string[]): Promise<void> {
  const settings = getConfig().sarvam;
  const plan = sarvamSmokePlan(settings);
  console.log(
    JSON.stringify(
      {
        preflight: true,
        language: 'hi-IN',
        ...plan,
        note: 'Synthetic TTS-to-STT technical check; physical pronunciation/recognition quality remains unverified.',
      },
      null,
      2,
    ),
  );
  if (args.includes('--preflight') || !args.includes('--confirm-spend')) {
    console.log(
      'No provider requests made. Add --confirm-spend only after approving the two-request preflight.',
    );
    return;
  }
  const common = {
    apiKey: settings.apiKey,
    timeoutMs: settings.timeoutMs,
    retries: 0,
  };
  if (!common.apiKey)
    throw new AppError(
      'PROVIDER_CONFIG',
      'Set SARVAM_API_KEY privately before the approved live smoke',
    );
  const result = await runHinglishSmoke(
    {
      tts: new SarvamTts({ ...common, ...plan.profile.tts }),
      stt: new SarvamStt({ ...common, ...plan.profile.stt }),
    },
    plan.text,
  );
  await mkdir('.data/audition', { recursive: true });
  if (result.wav)
    await writeFile('.data/audition/hinglish-smoke.wav', result.wav);
  const { wav: audio, ...evidence } = result;
  const report = {
    date: new Date().toISOString(),
    profile: plan.profile,
    text: plan.text,
    ...evidence,
    wavBytes: audio?.length ?? 0,
  };
  await writeFile(
    '.data/audition/hinglish-smoke.json',
    JSON.stringify(report, null, 2),
  );
  await appendFile(
    'docs/provider-notes.md',
    `\n## P7 bounded Hinglish smoke — ${report.date}\n\nTwo requests maximum, retries disabled; actual requests: ${String(result.requests.length)}. Profile: ${JSON.stringify(plan.profile)}. Technical result: ${result.passed ? 'passed' : 'failed'}. Requests: ${JSON.stringify(result.requests)}. Synthetic audio/transcript remain in ignored .data/audition/hinglish-smoke.*. No physical voice-quality pass is claimed.\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!result.passed) process.exitCode = 1;
}
