import { TtsLimiter } from '@/lib/voice/tts-limit';
import 'server-only';
import { getMetrics } from '@/lib/server/metrics';
import { AudioCache } from '@/lib/server/audio-cache';
import { DailyBudget, TokenBucket } from '@/lib/server/rate-limit';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@/lib/server/config';
import { getLogger } from '@/lib/server/logger';
import { loadData } from '@/lib/server/data-loader';
import { appendPlan, listLatest, getLatestPlan } from '@/lib/server/ledger';
import { appendAudit, findAudit } from '@/lib/server/followup-ledger';
import { getSessionStore } from '@/lib/server/session-registry';
import { TurnService } from '@/lib/server/turn-service';
import { GreetingCache } from '@/lib/server/greeting';
import { createSarvamProviders } from '@/lib/voice/sarvam';
import { Gemini } from '@/lib/llm/gemini';
import { businessDate } from '@/lib/server/business-date';
import type { SellerData } from '@/lib/domain/data-schemas';
import type { ToolEnvironment } from '@/lib/agent/tools';
import type { AgentServices } from '@/lib/server/agent-api';
import { languageSchema, sarvamProfile } from '@/lib/voice/language';
import type { Language } from '@/lib/voice/language';
import type { TtsProvider } from '@/lib/voice/providers';
import type { Session } from '@/lib/agent/session';

export class AppRuntime implements AgentServices {
  readonly config = getConfig();
  readonly sessions = getSessionStore(this.config);
  private readonly voices = {
    'en-IN': createSarvamProviders(this.config.sarvam, 'en-IN'),
    'hi-IN': createSarvamProviders(this.config.sarvam, 'hi-IN'),
  };
  private readonly routedTts: TtsProvider = {
    synthesize: (text, language, signal) =>
      this.voices[languageSchema.parse(language)].tts.synthesize(
        text,
        language,
        signal,
      ),
  };
  private readonly limitedTts = new TtsLimiter(this.routedTts);
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
  readonly greeting = new GreetingCache(this.limitedTts, {
    english: this.config.sarvam.tts,
    hindi: this.config.sarvam.hindi.tts,
  });
  private readonly hindiClips = new AudioCache(
    this.limitedTts,
    { ...this.config.sarvam.hindi.tts, language: 'hi-IN' },
    this.config.providers.sarvam && this.config.hinglishEnabled,
  );
  private loaded: Promise<SellerData> | undefined;
  readonly turns = new TurnService(
    this.sessions,
    async (session) => ({
      llm: this.llm,
      stt: this.voices[session.lang].stt,
      tts: this.limitedTts,
      maxToolRounds: this.config.maxToolRounds,
      compactToolHistory: this.config.compactToolHistory,
      tools: await this.toolEnvironment(session),
    }),
    Date.now,
    (report) => {
      const profile = sarvamProfile(
        this.config.sarvam,
        report.metrics.language ?? 'en-IN',
      );
      report.metrics.providerModels = {
        stt: profile.stt.model,
        tts: profile.tts.model,
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
  async toolEnvironment(session?: Session): Promise<ToolEnvironment> {
    return {
      data: await this.data(),
      settings: this.config,
      today: session?.followup
        ? new Date(`${session.followup.simulatedDate}T00:00:00Z`)
        : businessDate(new Date()),
      now: () => new Date(),
      createPlanId: randomUUID,
      append: (record, signal) =>
        appendPlan(record, this.config.dataDir, { once: true, signal }),
      appendAudit: (record, signal) =>
        appendAudit(record, this.config.dataDir, signal),
    };
  }
  ledger(): ReturnType<AgentServices['ledger']> {
    return listLatest(20, this.config.dataDir);
  }
  lookupPlan(planId: string): ReturnType<typeof getLatestPlan> {
    return getLatestPlan(planId, this.config.dataDir);
  }
  readAudit(planId: string, runId: string): ReturnType<typeof findAudit> {
    return findAudit(planId, runId, this.config.dataDir);
  }
  clipsFor(language: Language): AudioCache {
    return language === 'hi-IN' ? this.hindiClips : this.clips;
  }
  warmClips(language: Language = 'en-IN'): void {
    if (this.budget.snapshot().accepted < this.config.dailyTurnCap)
      void this.clipsFor(language).warm();
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
