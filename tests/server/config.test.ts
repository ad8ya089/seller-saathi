import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '@/lib/server/config';

describe('environment configuration', () => {
  it('validates the checked-in example without credentials', async () => {
    const environment = parseEnv(await readFile('.env.example', 'utf8'));
    expect(parseConfig(environment).providers).toEqual({
      gemini: false,
      sarvam: false,
    });
  });

  it('parses runtime configuration only once', async () => {
    vi.resetModules();
    vi.stubEnv('PORT', '3000');
    try {
      const { getConfig } = await import('@/lib/server/config');
      const initial = getConfig();
      vi.stubEnv('PORT', '4100');
      expect(getConfig()).toBe(initial);
      expect(getConfig().port).toBe(3000);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('allows local development without credentials', () => {
    const config = parseConfig({});
    expect(config.providers).toEqual({ gemini: false, sarvam: false });
    expect(config.logTranscripts).toBe(false);
    expect(config.sessionTtlMs).toBe(1_800_000);
    expect(config.maxUtteranceMs).toBe(28_000);
    expect(config.dataDir).toBe('/tmp/kam');
    expect(config.compactToolHistory).toBe(false);
  });

  it('requires explicit opt-in for tool-history compaction pending live acceptance validation', () => {
    expect(
      parseConfig({ COMPACT_TOOL_HISTORY: 'true' }).compactToolHistory,
    ).toBe(true);
    expect(() => parseConfig({ COMPACT_TOOL_HISTORY: 'yes' })).toThrow();
  });

  it('treats blank optional keys and access codes as absent', () => {
    expect(
      parseConfig({
        GEMINI_API_KEY: ' ',
        SARVAM_API_KEY: '',
        DEMO_ACCESS_CODE: '',
      }).providers,
    ).toEqual({ gemini: false, sarvam: false });
  });

  it('accepts configured providers, overrides and explicit booleans', () => {
    const config = parseConfig({
      GEMINI_API_KEY: 'test-gemini',
      SARVAM_API_KEY: 'test-sarvam',
      PORT: '4100',
      LOG_TRANSCRIPTS: 'true',
      DATA_DIR: './temporary-ledger',
      GEMINI_MODEL: 'chosen-model',
      SARVAM_TTS_PACE: '1.1',
    });
    expect(config.providers).toEqual({ gemini: true, sarvam: true });
    expect(config.port).toBe(4100);
    expect(config.gemini.model).toBe('chosen-model');
    expect(config.sarvam.tts.pace).toBe(1.1);
    expect(config.logTranscripts).toBe(true);
  });

  it.each([
    { GEMINI_RETRIES: '' },
    { ASP_FLAT_PCT: ' ' },
    { PORT: '0' },
    { PORT: 'not-a-number' },
    { LOG_TRANSCRIPTS: 'yes' },
    { MAX_QUESTIONS: '4' },
    { MAX_UTTERANCE_MS: '31000' },
    { DAILY_TURN_CAP: '-1' },
    { GEMINI_MODEL: '' },
    { DATA_DIR: '' },
    { DOMAIN: 'https://host/path' },
    { SARVAM_TIMEOUT_MS: '' },
    { GEMINI_TEMPERATURE: '3' },
  ])('rejects invalid explicit configuration: %j', (environment) => {
    expect(() => parseConfig(environment)).toThrow(/Invalid configuration/);
  });

  it('identifies invalid field names without including supplied secrets', () => {
    expect(() => parseConfig({ PORT: 'sensitive-value' })).toThrow(/PORT/);
    expect(() => parseConfig({ PORT: 'sensitive-value' })).not.toThrow(
      /sensitive-value/,
    );
  });
});
