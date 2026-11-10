import 'server-only';
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
  private readonly llm = new Gemini(this.config.gemini);
  readonly greeting = new GreetingCache(this.voice.tts);
  private loaded: Promise<SellerData> | undefined;
  readonly turns = new TurnService(
    this.sessions,
    async () => ({
      llm: this.llm,
      stt: this.voice.stt,
      tts: this.voice.tts,
      maxToolRounds: this.config.maxToolRounds,
      tools: await this.toolEnvironment(),
    }),
    Date.now,
    (report) => {
      getLogger().info(report, 'Agent turn completed');
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
  warmGreeting(): void {
    if (!this.config.providers.sarvam) return;
    void this.greeting.get().catch(() => {
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
