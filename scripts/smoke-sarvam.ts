import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '@/lib/errors';
import { getConfig } from '@/lib/server/config';
import { AUDITION_SPEAKERS } from '@/lib/voice/sarvam-contracts';
import { SarvamStt } from '@/lib/voice/sarvam-stt';
import { SarvamTts } from '@/lib/voice/sarvam-tts';
import { smokeHinglish } from './smoke-hinglish';

interface SmokeResult {
  kind: 'tts' | 'stt';
  model: string;
  variant: string;
  ok: boolean;
  ms?: number;
  file?: string;
  transcript?: string;
  error?: string;
}
const sampleText =
  'Hello, this is SellerSaathi. Namaste, meri sale gir gayi hai. Can you check my stock?';
const root = fileURLToPath(new URL('../', import.meta.url));

function safeError(error: unknown): string {
  return error instanceof AppError
    ? `${error.code}: ${error.message}`
    : 'INTERNAL: Provider smoke failed';
}
function markdown(
  results: SmokeResult[],
  date: string,
  language: string,
): string {
  const rows = results.map(
    (result) =>
      `| ${result.kind} | ${result.model} | ${result.variant} | ${result.ok ? 'succeeded' : 'failed'} | ${result.ms === undefined ? '—' : result.ms.toFixed(1)} | ${result.file ?? result.error ?? result.transcript ?? '—'} |`,
  );
  return `\n## Live smoke — ${date}\n\nThese are observed API results, using the application adapters. TTS REST used language_code=${language}, speech_sample_rate=24000 and output_audio_codec=wav. STT used language_code=unknown. Synthetic English/Hinglish input only; no microphone recording was used.\n\n| Kind | Model | Speaker or mode | Result | Request ms | Output or error |\n| --- | --- | --- | --- | ---: | --- |\n${rows.join('\n')}\n\nAudition files are local and ignored under .data/audition/. Transcripts and machine-readable results are in .data/audition/smoke-results.json. A successful round trip does not establish microphone accuracy or perceived voice quality.\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (
    args.some(
      (arg) => !['--hinglish', '--preflight', '--confirm-spend'].includes(arg),
    )
  )
    throw new AppError(
      'INVALID_INPUT',
      'Use --hinglish, --preflight and/or --confirm-spend.',
    );
  if (args.includes('--hinglish')) return smokeHinglish(args);
  const sarvam = getConfig().sarvam;
  console.log(
    `Sarvam audition preflight: five TTS plus four STT logical requests; at most ${String(9 * (sarvam.retries + 1))} HTTP attempts with configured retries.`,
  );
  if (args.includes('--preflight') || !args.includes('--confirm-spend')) {
    console.log(
      'No provider requests made. Add --confirm-spend after approving the audition preflight.',
    );
    return;
  }
  if (!sarvam.apiKey) {
    console.error(
      'Set SARVAM_API_KEY privately in the local .env, then run npm run smoke:sarvam.',
    );
    process.exitCode = 1;
    return;
  }
  const directory = join(root, '.data', 'audition');
  await mkdir(directory, { recursive: true });
  const results: SmokeResult[] = [];
  let sample: Buffer | undefined;
  const common = {
    apiKey: sarvam.apiKey,
    timeoutMs: sarvam.timeoutMs,
    retries: sarvam.retries,
  };
  for (const speaker of AUDITION_SPEAKERS[sarvam.tts.model]) {
    try {
      const result = await new SarvamTts({
        ...common,
        ...sarvam.tts,
        speaker,
      }).synthesize(sampleText, sarvam.tts.language);
      const name = `${sarvam.tts.model.replace(':', '-')}-${speaker}.wav`;
      await writeFile(join(directory, name), result.wav);
      sample ??= result.wav;
      results.push({
        kind: 'tts',
        model: sarvam.tts.model,
        variant: speaker,
        ok: true,
        ms: result.ms,
        file: `.data/audition/${name}`,
      });
      console.log(
        `TTS ${sarvam.tts.model} ${speaker}: ${result.ms.toFixed(1)} ms -> ${join(directory, name)}`,
      );
    } catch (error: unknown) {
      const message = safeError(error);
      results.push({
        kind: 'tts',
        model: sarvam.tts.model,
        variant: speaker,
        ok: false,
        error: message,
      });
      console.error(`TTS ${speaker}: ${message}`);
      if (
        error instanceof AppError &&
        ['PROVIDER_AUTH', 'PROVIDER_CONFIG'].includes(error.code)
      )
        break;
    }
  }
  if (sample) {
    for (const model of ['saaras:v4', 'saaras:v3'] as const) {
      for (const mode of ['transcribe', 'codemix'] as const) {
        try {
          const result = await new SarvamStt({
            ...common,
            model,
            mode,
          }).transcribe(sample, 'unknown');
          results.push({
            kind: 'stt',
            model,
            variant: mode,
            ok: true,
            ms: result.ms,
            transcript: result.text,
          });
          console.log(
            `STT ${model} ${mode}: ${result.ms.toFixed(1)} ms -> ${result.text}`,
          );
        } catch (error: unknown) {
          const message = safeError(error);
          results.push({
            kind: 'stt',
            model,
            variant: mode,
            ok: false,
            error: message,
          });
          console.error(`STT ${model} ${mode}: ${message}`);
        }
      }
    }
  }
  const date = new Date().toISOString();
  await writeFile(
    join(directory, 'smoke-results.json'),
    `${JSON.stringify({ date, sampleText, results }, null, 2)}\n`,
  );
  const notesPath = join(root, 'docs', 'provider-notes.md');
  await writeFile(
    notesPath,
    await format(
      `${await readFile(notesPath, 'utf8')}${markdown(results, date, sarvam.tts.language)}`,
      { parser: 'markdown' },
    ),
  );
  if (
    !results.some((result) => result.kind === 'tts' && result.ok) ||
    !results.some((result) => result.kind === 'stt' && result.ok)
  )
    process.exitCode = 1;
  console.log(
    'Results written to docs/provider-notes.md and .data/audition/smoke-results.json.',
  );
}

main().catch((error: unknown) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
