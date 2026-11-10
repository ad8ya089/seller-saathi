import 'server-only';
import { CLIP_TEXT, clipBundleSchema } from '@/lib/voice/clips';
import type { ClipBundle, ClipName } from '@/lib/voice/clips';
import type { TtsProvider } from '@/lib/voice/providers';
import { validateWav } from '@/lib/voice/wav';
import { VOICE_LIMITS } from '@/lib/voice/limits';

export class AudioCache {
  private readonly entries = new Map<string, Promise<string | null>>();
  private readonly ready = new Map<ClipName, string | null>();
  private warming: Promise<void> | undefined;
  private state: ClipBundle['state'];
  constructor(
    private readonly tts: TtsProvider,
    private readonly identity: {
      language: 'en-IN';
      model: string;
      speaker: string;
    },
    configured = true,
  ) {
    this.state = configured ? 'pending' : 'unconfigured';
  }
  warm(): Promise<void> {
    if (this.state === 'unconfigured') return Promise.resolve();
    this.warming ??= this.populate();
    return this.warming;
  }
  private async populate(): Promise<void> {
    const names = Object.keys(CLIP_TEXT) as ClipName[];
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < names.length) {
        const name = names[cursor++];
        if (!name) return;
        const key = JSON.stringify([this.identity, name]);
        let pending = this.entries.get(key);
        if (!pending) {
          pending = this.tts
            .synthesize(CLIP_TEXT[name], this.identity.language)
            .then((result) => {
              validateWav(result.wav, {
                sampleRates: [VOICE_LIMITS.outputSampleRate],
                maxBytes: VOICE_LIMITS.ttsAudioBytes,
                maxDurationMs: 120000,
              });
              return result.wav.toString('base64');
            })
            .catch(() => null);
          this.entries.set(key, pending);
        }
        this.ready.set(name, await pending);
      }
    };
    await Promise.all([worker(), worker()]);
    this.state = [...this.ready.values()].every(Boolean) ? 'ready' : 'degraded';
  }
  snapshot(): ClipBundle {
    return clipBundleSchema.parse({
      state: this.state,
      clips: Object.fromEntries(
        Object.keys(CLIP_TEXT).map((name) => [
          name,
          this.ready.get(name as ClipName) ?? null,
        ]),
      ),
    });
  }
}
