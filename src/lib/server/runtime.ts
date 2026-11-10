import { TtsLimiter } from '@/lib/voice/tts-limit';
import 'server-only';
import { getMetrics } from '@/lib/server/metrics';
import { AudioCache } from '@/lib/server/audio-cache';
import { DailyBudget, TokenBucket } from '@/lib/server/rate-limit';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@/lib/server/config';
import { getLogger } from '@/lib/server/logger';
import { loadData } from '@/lib/server/data-loader';
import { appendPlan, listLatest } from '@/lib/server/ledger';
import { getSessionStore } from '@/lib/server/session-registry';
import { TurnService } from '@/lib/server/turn-service';
import { GreetingCache } from '@/lib/server/greeting';
import { createSarvamProviders } from '@/lib/voice/sarvam';
import { Gemini } from '@/lib/llm/gemini';
import { businessDate } from '@/lib/server/business-date';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { ToolEnvironment } from '@/lib/agent/tools';
import type { AgentServices } from '@/lib/server/agent-api';

export class AppRuntime implements AgentServices {
  readonly config = getConfig();
  readonly sessions = getSessionStore(this.config);
  private readonly voice = createSarvamProviders(this.config.sarvam);
  private readonly limitedTts = new TtsLimiter(this.voice.tts);
  private readonly llm = new Gemini(this.config.gemini);
  readonly limiter = new TokenBucket(
    this.config.rateLimitTurns,
    this.config.rateLimitWindowMs,
  );
  readonly budget = new DailyBudget(this.config.dailyTurnCap);
  readonly clips = new AudioCache(
    this.limitedTts,
    { ...this.config.sarvam.tts, language: 'en-IN' },
    this.config.providers.sarvam,
  );
  readonly greeting = new GreetingCache(this.limitedTts);
  private loaded: Promise<SellerData> | undefined;
  readonly turns = new TurnService(
    this.sessions,
    async () => ({
      llm: this.llm,
      stt: this.voice.stt,
      tts: this.limitedTts,
      maxToolRounds: this.config.maxToolRounds,
      tools: await this.toolEnvironment(),
    }),
    Date.now,
    (report) => {
      report.metrics.providerModels = {
        stt: this.config.sarvam.stt.model,
        tts: this.config.sarvam.tts.model,
      };
      const value = getMetrics().record(
        report.sessionId,
        report.turn,
        report.phase ?? 'unknown',
        report.status ?? 'success',
        report.errorCode ?? null,
        report.metrics,
      );
      getLogger().info(value, 'Agent turn finished');
    },
    () => {
      this.budget.accept();
    },
    undefined,
    (sessionId, turn, playedSentences): void => {
      getMetrics().markInterrupted(sessionId, turn);
      getLogger().info(
        { sessionId, turn, playedSentences, interrupted: true },
        'Playback interrupted',
      );
    },
  );
  data(): Promise<SellerData> {
    this.loaded ??= loadData(this.config.mockDataDir);
    return this.loaded;
  }
  async toolEnvironment(): Promise<ToolEnvironment> {
    return {
      data: await this.data(),
      settings: this.config,
      today: businessDate(new Date()),
      now: () => new Date(),
      createPlanId: randomUUID,
      append: (record, signal) =>
        appendPlan(record, this.config.dataDir, { once: true, signal }),
    };
  }
  ledger(): ReturnType<AgentServices['ledger']> {
    return listLatest(20, this.config.dataDir);
  }
  warmClips(): void {
    if (this.budget.snapshot().accepted < this.config.dailyTurnCap)
      void this.clips.warm();
  }
  warmGreeting(): void {
    if (
      !this.config.providers.sarvam ||
      !this.config.providers.gemini ||
      this.config.demoAccessCode
    )
      return;
    if (this.budget.snapshot().accepted >= this.config.dailyTurnCap) return;
    void this.greeting
      .get()
      .then(() => this.clips.warm())
      .catch(() => {
        getLogger().warn(
          { code: 'GREETING_UNAVAILABLE' },
          'Greeting prewarm did not complete',
        );
      });
  }
}
const shared = globalThis as typeof globalThis & {
  sellerSaathiRuntime?: AppRuntime;
};
export function getRuntime(): AppRuntime {
  shared.sellerSaathiRuntime ??= new AppRuntime();
  return shared.sellerSaathiRuntime;
}
