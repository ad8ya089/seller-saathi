import type { EchoEvent } from '@/lib/voice/events';
import type { VoiceState } from '@/lib/client/voice-state';
import type { AudioQueue } from '@/lib/client/audio-queue';

interface PlaybackOptions {
  current: () => boolean;
  snapshot: () => VoiceState;
  patch: (update: Partial<VoiceState>) => void;
  queue: AudioQueue;
  speakFallback: (text: string, signal: AbortSignal) => Promise<void>;
  signal: AbortSignal;
  now: () => number;
  endedAt: number;
  prefix: string;
}
export class TurnPlayback {
  firstAudioMs: number | null = null;
  private canMeasure = true;
  private readonly sentences = new Map<number, string>();
  private readonly pending = new Map<number, string>();
  constructor(private readonly options: PlaybackOptions) {}
  private message(role: 'seller' | 'assistant', text: string): void {
    const id = `${this.options.prefix}-${role}`;
    const messages = this.options.snapshot().messages;
    this.options.patch({
      messages: messages.some((message) => message.id === id)
        ? messages.map((message) =>
            message.id === id ? { ...message, text } : message,
          )
        : [...messages, { id, role, text }],
    });
  }
  async onEvent(event: EchoEvent): Promise<void> {
    const options = this.options;
    if (!options.current()) return;
    if (event.event === 'transcript') this.message('seller', event.data.text);
    else if (event.event === 'tool')
      options.patch({
        tools: [...options.snapshot().tools, event.data.label].slice(-4),
      });
    else if (event.event === 'state') options.patch({ agent: event.data });
    else if (event.event === 'sentence') {
      this.sentences.set(event.data.idx, event.data.text);
      this.pending.set(event.data.idx, event.data.text);
      this.message('assistant', [...this.sentences.values()].join(' '));
    } else if (event.event === 'audio') {
      this.pending.delete(event.data.idx);
      options.patch({ phase: 'speaking' });
      await options.queue.enqueue(event.data.b64, (): void => {
        if (
          this.firstAudioMs !== null ||
          !this.canMeasure ||
          !options.current()
        )
          return;
        this.firstAudioMs = Math.max(0, options.now() - options.endedAt);
        options.patch({ firstAudioMs: this.firstAudioMs });
      });
    } else if (event.event === 'fallback') {
      options.patch({ notice: event.data.message });
      if (event.data.kind === 'tts') {
        const next = this.pending.entries().next().value;
        if (!next) return;
        this.pending.delete(next[0]);
        if (this.firstAudioMs === null) this.canMeasure = false;
        await options.queue.whenIdle();
        if (!options.current()) return;
        options.patch({ phase: 'speaking' });
        await options.speakFallback(next[1], options.signal);
      }
    } else if (event.event === 'done')
      options.patch({ serverTimings: event.data.timings });
  }
}
