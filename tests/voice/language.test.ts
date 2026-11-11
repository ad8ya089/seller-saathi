import { describe, expect, it } from 'vitest';
import { parseConfig } from '@/lib/server/config';
import { sarvamProfile, sarvamSmokePlan } from '@/lib/voice/language';

describe('session language provider profiles and bounded smoke preflight', () => {
  it('keeps English default and Hindi unavailable until explicitly verified', () => {
    const config = parseConfig({});
    expect(config.hinglishEnabled).toBe(false);
    expect(sarvamProfile(config.sarvam, 'en-IN')).toMatchObject({
      stt: { model: 'saaras:v4', language: 'en-IN', mode: 'transcribe' },
      tts: { model: 'bulbul:v4-flash', language: 'en-IN', sampleRate: 24000 },
    });
  });
  it('selects documented code-mixed Hindi configuration without altering English', () => {
    const config = parseConfig({
      HINGLISH_ENABLED: 'true',
      SARVAM_HI_TTS_PACE: '0.9',
      SARVAM_HI_TTS_SPEAKER: 'shubh_enhi_ads',
    });
    expect(config.hinglishEnabled).toBe(true);
    expect(sarvamProfile(config.sarvam, 'hi-IN')).toMatchObject({
      stt: { model: 'saaras:v4', language: 'hi-IN', mode: 'codemix' },
      tts: {
        language: 'hi-IN',
        model: 'bulbul:v4-flash',
        speaker: 'shubh_enhi_ads',
        pace: 0.9,
        sampleRate: 24000,
      },
    });
    expect(sarvamProfile(config.sarvam, 'en-IN').tts.pace).toBe(1);
    expect(() => parseConfig({ SARVAM_HI_TTS_SPEAKER: 'priya' })).toThrow();
    expect(() => parseConfig({ SARVAM_HI_TTS_PACE: '4' })).toThrow();
  });
  it('plans only one synthesis and one recognition, with retries disabled', () => {
    const plan = sarvamSmokePlan(parseConfig({}).sarvam);
    expect(plan.requests).toEqual({ tts: 1, stt: 1, maximum: 2, retries: 0 });
    expect(plan.profile.stt.mode).toBe('codemix');
    expect(plan.text).toContain('Meri sale gir gayi hai');
    expect(plan.text.length).toBeLessThan(150);
  });
});
