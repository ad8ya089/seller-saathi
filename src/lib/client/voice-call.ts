import { CLIP_TEXT } from '@/lib/voice/clips';
import type { ClipBundle, ClipName } from '@/lib/voice/clips';
import { Filler } from '@/lib/client/filler';
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
import { TurnPlayback } from '@/lib/client/turn-playback';

interface Call {
  id: string;
  abort: AbortController;
  queue: AudioQueue;
  capture?: MicrophoneHandle;
  busy: boolean;
  duplex: boolean;
  auxiliarySpeaking: boolean;
  activeTurn?: { abort: AbortController; playback: TurnPlayback };
  playedSentences?: number;
  speechOpen: boolean;
  turn: number;
  lastSpeechAt: number | null;
  ready: boolean;
  captureMs: number;
  opening?: Promise<void>;
  captureTimer?: ReturnType<typeof setTimeout>;
}
export class VoiceCallController {
  private clips: ClipBundle | undefined;
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
    this.call?.capture?.setPlayback?.(
      this.state.phase === 'speaking' || this.call.auxiliarySpeaking,
    );
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
    void this.dependencies
      .loadClips?.()
      .then((bundle) => {
        this.clips = bundle;
      })
      .catch(() => undefined);
    const call: Call = {
      id: this.dependencies.createId(),
      abort: new AbortController(),
      queue: this.audio.createQueue(),
      busy: false,
      duplex: false,
      auxiliarySpeaking: false,
      speechOpen: false,
      turn: 0,
      lastSpeechAt: null,
      ready: false,
      captureMs: CALL_SETTINGS.maxCaptureMs,
    };
    this.call = call;
    this.patch({
      ...initialVoiceState(),
      bargeIn: this.state.bargeIn,
      active: true,
      phase: 'listening',
      textFallback,
    });
    return call;
  }

  private async prepareSession(call: Call): Promise<void> {
    if (call.ready) return;
    if (!call.opening) {
      const initialize = async (): Promise<void> => {
        this.patch({ initializing: true, phase: 'processing' });
        const session = await this.dependencies.openSession(call.abort.signal);
        if (!this.current(call)) {
          void this.dependencies
            .endSession(session.sessionId)
            .catch(() => undefined);
          return;
        }
        call.id = session.sessionId;
        call.ready = true;
        call.duplex = session.config.bargeIn;
        this.dependencies.observe?.session(session);
        call.captureMs = Math.max(
          1,
          Math.min(
            CALL_SETTINGS.maxCaptureMs,
            session.config.maxUtteranceMs - CALL_SETTINGS.capturePaddingMs,
          ),
        );
        this.patch({
          phase: 'speaking',
          maxQuestions: session.config.maxQuestions,
          messages: [
            {
              id: `${call.id}-greeting`,
              role: 'assistant',
              text: session.greeting.text,
            },
          ],
        });
        await call.queue.enqueue(session.greeting.audioB64);
        await call.queue.whenIdle();
        try {
          const clips = await this.dependencies.loadClips?.();
          if (clips && this.current(call)) this.clips = clips;
        } catch {
          /* Browser speech remains the controlled cache fallback. */
        }
        if (this.current(call))
          this.patch({ phase: 'listening', initializing: false });
      };
      call.opening = this.track(initialize());
    }
    try {
      await call.opening;
    } finally {
      delete call.opening;
    }
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
      await this.prepareSession(call);
      if (!this.current(call)) return;
      await this.dependencies.cooldown(call.abort.signal);
      if (!this.current(call)) return;
      await this.track(this.attachMicrophone(call));
    } catch (error: unknown) {
      if (call && !this.current(call)) return;
      if (error instanceof AppError)
        this.dependencies.observe?.error(error.code);
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
          if (
            this.current(call) &&
            (!call.busy || (call.duplex && this.state.bargeIn))
          )
            call.lastSpeechAt = this.dependencies.now();
        },
        onSpeechStart: (): void => {
          if (!this.current(call)) return;
          if (call.busy && call.duplex && this.state.bargeIn)
            this.interrupt(call);
          if (call.busy || call.speechOpen) return;
          call.speechOpen = true;
          this.clearCaptureTimer(call);
          call.captureTimer = setTimeout(() => {
            void this.captureLimit(call);
          }, call.captureMs);
        },
        onMisfire: (): void => {
          call.speechOpen = false;
          this.clearCaptureTimer(call);
        },
        onSpeechEnd: (samples): void => {
          this.clearCaptureTimer(call);
          if (!call.speechOpen) return;
          call.speechOpen = false;
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
      if (!this.current(call)) return;
      await this.prepareSession(call);
      await this.submit(
        call,
        { kind: 'text', sessionId: call.id, text: parsed.data },
        'text',
        this.dependencies.now(),
      );
    } catch (error: unknown) {
      if (call && !this.current(call)) return;
      this.patch({
        initializing: false,
        error:
          error instanceof AppError
            ? error.message
            : 'Audio could not start. Please restart the call.',
        textFallback: true,
      });
    }
  }
  async submitAudio(
    samples: Float32Array,
    endedAt = this.dependencies.now(),
  ): Promise<void> {
    const call = this.call;
    if (!call || !call.ready || call.busy || !this.current(call)) return;
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
    const prefix = `${call.id}-${String(turn)}`;
    this.dependencies.observe?.turn(prefix);
    this.patch({
      phase: 'processing',
      error: null,
      notice: null,
      firstAudioMs: null,
      serverTimings: null,
    });
    const audio = this.audio;
    if (!audio) return;
    const turnAbort = new AbortController();
    const signal = AbortSignal.any([call.abort.signal, turnAbort.signal]);
    const currentTurn = (): boolean =>
      this.current(call) &&
      call.activeTurn?.abort === turnAbort &&
      !signal.aborted;
    const filler = new Filler(
      audio.createQueue(),
      async (queue, signal): Promise<void> => {
        if (!this.clips || !currentTurn()) return;
        call.auxiliarySpeaking = true;
        call.capture?.setPlayback?.(true);
        const b64 = this.clips.clips.filler;
        if (b64) {
          await queue.enqueue(b64);
          await queue.whenIdle();
        } else await audio.speakFallback(CLIP_TEXT.filler, signal);
      },
      1500 - Math.max(0, this.dependencies.now() - endedAt),
      (): void => {
        if (this.clips && currentTurn())
          this.dependencies.reportFiller?.(call.id, turn);
      },
    );
    signal.addEventListener(
      'abort',
      () => {
        filler.stop();
        call.auxiliarySpeaking = false;
      },
      { once: true },
    );
    const playback = new TurnPlayback({
      current: currentTurn,
      snapshot: (): VoiceState => this.state,
      patch: (update): void => {
        this.patch(update);
      },
      queue: call.queue,
      speakFallback: audio.speakFallback,
      signal,
      now: this.dependencies.now,
      endedAt,
      prefix,
    });
    call.activeTurn = { abort: turnAbort, playback };
    let failed = false;
    try {
      if (!call.duplex || !this.state.bargeIn) await call.capture?.pause();
      if (!this.current(call)) return;
      await this.dependencies.send(
        {
          ...input,
          turnId: this.dependencies.createId(),
          ...(call.playedSentences !== undefined
            ? { playedSentences: call.playedSentences }
            : {}),
        },
        (event): Promise<void> => {
          if (!currentTurn()) return Promise.resolve();
          if (
            event.event === 'audio' ||
            event.event === 'fallback' ||
            event.event === 'error'
          ) {
            filler.stop();
            call.auxiliarySpeaking = false;
          }
          if (currentTurn()) this.dependencies.observe?.event(prefix, event);
          return playback.onEvent(event);
        },
        signal,
      );
      await call.queue.whenIdle();
    } catch (error: unknown) {
      if (!currentTurn()) return;
      failed = true;
      filler.stop();
      call.queue.stopAll();
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      const clip: ClipName =
        code === 'NO_SPEECH'
          ? 'reprompt'
          : code === 'DAILY_LIMIT'
            ? 'daily'
            : code === 'SESSION_LIMIT'
              ? error instanceof AppError &&
                error.message.includes('time limit')
                ? 'time'
                : 'turns'
              : 'apology';
      if (code === 'TEXT_REQUIRED') {
        this.patch({ textFallback: true });
        await call.capture?.pause();
      }
      if (code !== 'TEXT_REQUIRED' && this.clips && currentTurn()) {
        try {
          const b64 = this.clips.clips[clip];
          if (b64) {
            await call.queue.enqueue(b64);
            await call.queue.whenIdle();
          } else await audio.speakFallback(CLIP_TEXT[clip], signal);
        } catch {
          /* The visible text error remains available. */
        }
      }
      if (this.current(call) && error instanceof AppError)
        this.dependencies.observe?.error(error.code);
      if (this.current(call))
        this.patch({
          error:
            error instanceof AppError
              ? error.message
              : 'The voice connection failed. Please try again.',
        });
      if (
        [
          'SESSION_NOT_FOUND',
          'SESSION_EXPIRED',
          'SESSION_LIMIT',
          'DAILY_LIMIT',
        ].includes(code)
      )
        this.endCall();
    } finally {
      filler.stop();
      call.auxiliarySpeaking = false;
      if (currentTurn()) {
        delete call.playedSentences;
        this.patch({
          measurements: [
            ...this.state.measurements,
            {
              turn,
              source,
              firstAudioMs: playback.firstAudioMs,
              server: this.state.serverTimings,
              failed,
            },
          ].slice(-10),
        });
        if (this.state.agent?.phase === 'done') {
          this.endCall();
        }
        if (this.current(call))
          try {
            if (!call.duplex || !this.state.bargeIn) {
              await this.dependencies.cooldown(call.abort.signal);
              if (this.current(call)) await call.capture?.start();
            }
          } catch {
            if (this.current(call))
              this.patch({
                textFallback: true,
                error: 'Microphone paused. You can still type a message.',
              });
          }
        if (this.current(call)) {
          delete call.activeTurn;
          call.busy = false;
          call.lastSpeechAt = null;
          this.patch({ phase: 'listening' });
        }
      }
    }
  }

  setBargeIn(enabled: boolean): void {
    this.patch({ bargeIn: enabled });
    const call = this.call;
    if (!call?.capture || !call.busy) return;
    void (
      enabled && call.duplex ? call.capture.start() : call.capture.pause()
    ).catch(() => {
      this.patch({
        textFallback: true,
        error: 'Microphone paused. You can still type a message.',
      });
    });
  }

  private interrupt(call: Call): void {
    const active = call.activeTurn;
    if (!active) return;
    call.playedSentences = active.playback.playedSentences;
    active.abort.abort();
    call.queue.stopAll();
    delete call.activeTurn;
    call.busy = false;
    this.patch({
      phase: 'listening',
      notice: 'Interrupted. Listening to you.',
    });
  }

  async confirmPlan(decision: 'accept' | 'decline'): Promise<void> {
    const call = this.call;
    const plan = this.state.agent?.plan;
    if (!call || call.busy || !plan || !this.current(call)) return;
    call.busy = true;
    this.patch({ phase: 'processing', error: null });
    this.dependencies.observe?.confirmation(decision, 'pending');
    try {
      await call.capture?.pause();
      const state = await this.dependencies.confirmPlan(
        call.id,
        plan.id,
        decision,
        call.abort.signal,
      );
      if (!this.current(call)) return;
      this.dependencies.observe?.confirmation(decision, 'complete', state);
      this.patch({ agent: state });
      if (state.phase === 'done') {
        this.endCall();
        return;
      }
    } catch (error: unknown) {
      if (this.current(call)) {
        this.dependencies.observe?.confirmation(decision, 'failed');
        if (error instanceof AppError)
          this.dependencies.observe?.error(error.code);
      }
      if (this.current(call))
        this.patch({
          error:
            error instanceof AppError
              ? error.message
              : 'The plan could not be confirmed. Please try again.',
        });
    } finally {
      if (this.current(call)) {
        try {
          await call.capture?.start();
        } catch {
          if (this.current(call))
            this.patch({
              textFallback: true,
              error: 'Microphone paused. You can still type a message.',
            });
        }
        call.busy = false;
        this.patch({ phase: 'listening' });
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
      if (call.ready)
        void this.dependencies.endSession(call.id).catch(() => undefined);
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
