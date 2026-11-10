import { AppError } from '@/lib/errors';
import { textTurnSchema } from '@/lib/voice/events';
import { encodeMicrophoneWav } from '@/lib/client/wav-encode';
import type { EchoSubmission } from '@/lib/client/sse';
import { initialVoiceState } from '@/lib/client/voice-state';
import type {
  AudioResources,
  MicrophoneHandle,
  TurnMeasurement,
  VoiceDependencies,
  VoiceState,
} from '@/lib/client/voice-state';
import type { AudioQueue } from '@/lib/client/audio-queue';
import { CALL_SETTINGS } from '@/lib/client/vad-settings';

interface Call {
  id: string;
  abort: AbortController;
  queue: AudioQueue;
  capture?: MicrophoneHandle;
  busy: boolean;
  turn: number;
  lastSpeechAt: number | null;
  captureTimer?: ReturnType<typeof setTimeout>;
}
export class VoiceCallController {
  private state = initialVoiceState();
  private call: Call | undefined;
  private audio: AudioResources | undefined;
  private disposed = false;
  private readonly cleanup = new Set<Promise<unknown>>();
  constructor(
    private readonly dependencies: VoiceDependencies,
    private readonly onChange: (state: VoiceState) => void,
  ) {}
  snapshot(): VoiceState {
    return this.state;
  }

  private patch(update: Partial<VoiceState>): void {
    this.state = { ...this.state, ...update };
    if (!this.disposed) this.onChange(this.state);
  }
  private current(call: Call): boolean {
    return this.call === call && !this.disposed && !call.abort.signal.aborted;
  }
  private canCapture(call: Call): boolean {
    return this.current(call) && !call.busy;
  }
  private track<T>(task: Promise<T>): Promise<T> {
    this.cleanup.add(task);
    void task.then(
      () => {
        this.cleanup.delete(task);
      },
      () => {
        this.cleanup.delete(task);
      },
    );
    return task;
  }
  private clearCaptureTimer(call: Call): void {
    clearTimeout(call.captureTimer);
    delete call.captureTimer;
  }
  private newCall(textFallback: boolean): Call {
    this.audio ??= this.dependencies.createAudio();
    const call: Call = {
      id: this.dependencies.createId(),
      abort: new AbortController(),
      queue: this.audio.createQueue(),
      busy: false,
      turn: 0,
      lastSpeechAt: null,
    };
    this.call = call;
    this.patch({
      ...initialVoiceState(),
      active: true,
      phase: 'listening',
      textFallback,
    });
    return call;
  }

  async startCall(): Promise<void> {
    if (this.disposed || this.call) return;
    let call: Call | undefined;
    try {
      call = this.newCall(false);
      this.patch({ initializing: true });
      const resume = this.audio?.resume();
      await resume;
      if (!this.current(call)) return;
      await this.track(this.attachMicrophone(call));
    } catch (error: unknown) {
      if (call && !this.current(call)) return;
      this.patch({
        initializing: false,
        textFallback: true,
        phase: call ? 'listening' : 'idle',
        error:
          error instanceof AppError
            ? error.message
            : 'Microphone setup failed. You can still type a message below.',
      });
    }
  }
  private async attachMicrophone(call: Call): Promise<void> {
    if (!this.audio) return;
    const capture = await this.audio.openMicrophone(
      {
        onVoiceFrame: (): void => {
          if (this.current(call) && !call.busy)
            call.lastSpeechAt = this.dependencies.now();
        },
        onSpeechStart: (): void => {
          if (!this.current(call) || call.busy) return;
          this.clearCaptureTimer(call);
          call.captureTimer = setTimeout(() => {
            void this.captureLimit(call);
          }, CALL_SETTINGS.maxCaptureMs);
        },
        onMisfire: (): void => {
          this.clearCaptureTimer(call);
        },
        onSpeechEnd: (samples): void => {
          this.clearCaptureTimer(call);
          if (this.current(call))
            void this.submitAudio(
              samples,
              call.lastSpeechAt ?? this.dependencies.now(),
            );
        },
      },
      call.abort.signal,
    );
    if (!this.current(call)) {
      await capture.destroy();
      return;
    }
    call.capture = capture;
    this.patch({ initializing: false, phase: 'listening' });
  }
  private async captureLimit(call: Call): Promise<void> {
    if (!this.current(call) || call.busy) return;
    try {
      await call.capture?.pause();
      if (!this.current(call)) return;
      this.patch({
        error: 'That recording was too long. Please use a shorter message.',
      });
      await this.dependencies.cooldown(call.abort.signal);
      if (this.canCapture(call)) await call.capture?.start();
    } catch {
      if (this.current(call))
        this.patch({
          textFallback: true,
          error: 'Microphone paused. You can still type a message.',
        });
    }
  }

  async sendText(text: string): Promise<void> {
    if (this.disposed || this.call?.busy || this.state.initializing) return;
    const parsed = textTurnSchema.shape.text.safeParse(text);
    if (!parsed.success) {
      this.patch({ error: 'Please enter a short message.' });
      return;
    }
    let call: Call | undefined;
    try {
      call = this.call ?? this.newCall(true);
      const resume = this.audio?.resume();
      await resume;
      await this.submit(
        call,
        { kind: 'text', sessionId: call.id, text: parsed.data },
        'text',
        this.dependencies.now(),
      );
    } catch {
      if (call && !this.current(call)) return;
      this.patch({
        error: 'Audio could not start. Please restart the call.',
        textFallback: true,
      });
    }
  }
  async submitAudio(
    samples: Float32Array,
    endedAt = this.dependencies.now(),
  ): Promise<void> {
    const call = this.call;
    if (!call || call.busy || !this.current(call)) return;
    this.clearCaptureTimer(call);
    try {
      const wav = encodeMicrophoneWav(samples);
      await this.submit(
        call,
        { kind: 'audio', sessionId: call.id, wav },
        'voice',
        endedAt,
      );
    } catch (error: unknown) {
      if (this.current(call))
        this.patch({
          error:
            error instanceof AppError
              ? error.message
              : 'Recording failed. Please try a short message.',
        });
    }
  }

  private async submit(
    call: Call,
    input: EchoSubmission,
    source: TurnMeasurement['source'],
    endedAt: number,
  ): Promise<void> {
    if (!this.current(call) || call.busy) return;
    call.busy = true;
    call.turn += 1;
    this.clearCaptureTimer(call);
    const turn = call.turn;
    const assistantId = `${call.id}-${String(turn)}-assistant`;
    this.patch({
      phase: 'processing',
      error: null,
      firstAudioMs: null,
      serverTimings: null,
    });
    let firstAudioMs: number | null = null;
    let failed = false;
    try {
      await call.capture?.pause();
      if (!this.current(call)) return;
      await this.dependencies.send(
        input,
        async (event): Promise<void> => {
          if (!this.current(call)) return;
          if (event.event === 'transcript')
            this.patch({
              messages: [
                ...this.state.messages,
                {
                  id: `${call.id}-${String(turn)}-seller`,
                  role: 'seller',
                  text: event.data.text,
                },
              ],
            });
          else if (event.event === 'sentence') {
            const existing = this.state.messages.find(
              (message) => message.id === assistantId,
            );
            this.patch({
              messages: existing
                ? this.state.messages.map((message) =>
                    message.id === assistantId
                      ? {
                          ...message,
                          text: `${message.text} ${event.data.text}`,
                        }
                      : message,
                  )
                : [
                    ...this.state.messages,
                    {
                      id: assistantId,
                      role: 'assistant',
                      text: event.data.text,
                    },
                  ],
            });
          } else if (event.event === 'audio') {
            this.patch({ phase: 'speaking' });
            await call.queue.enqueue(
              event.data.b64,
              event.data.idx === 0
                ? (): void => {
                    if (this.current(call)) {
                      firstAudioMs = Math.max(
                        0,
                        this.dependencies.now() - endedAt,
                      );
                      this.patch({ firstAudioMs });
                    }
                  }
                : undefined,
            );
          } else if (event.event === 'done')
            this.patch({ serverTimings: event.data.timings });
        },
        call.abort.signal,
      );
      await call.queue.whenIdle();
    } catch (error: unknown) {
      failed = true;
      call.queue.stopAll();
      if (this.current(call))
        this.patch({
          error:
            error instanceof AppError
              ? error.message
              : 'The voice connection failed. Please try again.',
        });
    } finally {
      if (this.current(call)) {
        this.patch({
          measurements: [
            ...this.state.measurements,
            {
              turn,
              source,
              firstAudioMs,
              server: this.state.serverTimings,
              failed,
            },
          ].slice(-10),
        });
        try {
          await this.dependencies.cooldown(call.abort.signal);
          if (this.current(call)) await call.capture?.start();
        } catch {
          if (this.current(call))
            this.patch({
              textFallback: true,
              error: 'Microphone paused. You can still type a message.',
            });
        }
        if (this.current(call)) {
          call.busy = false;
          call.lastSpeechAt = null;
          this.patch({ phase: 'listening' });
        }
      }
    }
  }

  endCall(): void {
    const call = this.call;
    this.call = undefined;
    if (call) {
      this.clearCaptureTimer(call);
      call.abort.abort();
      call.queue.stopAll();
      if (call.capture)
        void this.track(call.capture.destroy()).catch(() => undefined);
    }
    if (this.audio) void this.audio.suspend().catch(() => undefined);
    this.patch({ active: false, initializing: false, phase: 'idle' });
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.endCall();
    await Promise.allSettled([...this.cleanup]);
    await this.audio?.close().catch(() => undefined);
    this.audio = undefined;
  }
}
