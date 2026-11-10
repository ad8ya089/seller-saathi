import { Writable } from 'node:stream';
import { expect, it } from 'vitest';
import { createLogger } from '@/lib/server/logger';

it('redacts keys, access codes and transcripts at default settings', () => {
  let output = '';
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger({ level: 'info', logTranscripts: false }, sink);
  logger.info(
    {
      apiKey: 'hidden-key',
      transcript: 'private words',
      confirmationQuote: 'private yes',
      nested: { GEMINI_API_KEY: 'nested-key' },
      DEMO_ACCESS_CODE: 'secret-code',
      err: new Error('provider-body-secret'),
      sessionId: 'demo-session',
    },
    'turn.finished',
  );
  expect(output).toContain('demo-session');
  for (const secret of [
    'hidden-key',
    'private words',
    'private yes',
    'nested-key',
    'secret-code',
    'provider-body-secret',
  ]) {
    expect(output).not.toContain(secret);
  }
});
