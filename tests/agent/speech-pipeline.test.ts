import { describe, expect, it, vi } from 'vitest';
import { SpeechPipeline } from '@/lib/agent/speech-pipeline';
import { FakeTts } from '@/lib/voice/fakes';
import type { EchoEvent } from '@/lib/voice/events';
import { wavFixture } from '../voice/fixtures';

describe('bounded ordered agent speech', () => {
  it('keeps sentences one and three ordered when the second synthesis fails', async () => {
    const events: EchoEvent[] = [];
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }), {
      before: (index): Promise<void> =>
        index === 1
          ? Promise.reject(new Error('synthetic failure'))
          : Promise.resolve(),
    });
    const pipeline = new SpeechPipeline(
      tts,
      (event): void => {
        events.push(event);
      },
      new AbortController().signal,
      0,
    );
    await pipeline.push('First.');
    await pipeline.push('Second.');
    await pipeline.push('Third.');
    await pipeline.finish();
    expect(
      events
        .filter((event) => event.event === 'sentence')
        .map((event) => event.data.text),
    ).toEqual(['First.', 'Second.', 'Third.']);
    expect(
      events
        .filter(
          (event) => event.event === 'audio' || event.event === 'fallback',
        )
        .map((event) =>
          event.event === 'audio' ? event.data.idx : event.data.kind,
        ),
    ).toEqual([0, 'tts', 2]);
  });
  it('starts at most two requests and publishes in sentence order after reverse completion', async () => {
    const releases: (() => void)[] = [];
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }), {
      before: (): Promise<void> =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    });
    const events: EchoEvent[] = [];
    const pipeline = new SpeechPipeline(
      tts,
      (event) => {
        events.push(event);
      },
      new AbortController().signal,
      0,
    );
    await pipeline.push('First.');
    await pipeline.push('Second.');
    const third = pipeline.push('Third.');
    expect(tts.calls).toHaveLength(2);
    releases[1]?.();
    await third;
    expect(tts.calls).toHaveLength(3);
    expect(events.filter((event) => event.event === 'audio')).toEqual([]);
    releases[2]?.();
    releases[0]?.();
    await pipeline.finish();
    expect(
      events
        .filter((event) => event.event === 'audio')
        .map((event) => event.data.idx),
    ).toEqual([0, 1, 2]);
  });
  it('settles cancellation while synthesis is pending without publishing late audio', async () => {
    const abort = new AbortController();
    const tts = new FakeTts(wavFixture({ sampleRate: 24000 }), {
      before: (): Promise<void> => new Promise(() => undefined),
    });
    const emit = vi.fn();
    const pipeline = new SpeechPipeline(tts, emit, abort.signal, 0);
    await pipeline.push('First.');
    abort.abort();
    await pipeline.cancel();
    expect(emit.mock.calls.flat()).toEqual([
      { event: 'sentence', data: { idx: 0, text: 'First.' } },
    ]);
  });
});
