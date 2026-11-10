import { AppError } from '@/lib/errors';
import { echoEventSchema } from '@/lib/voice/events';
import type { EchoEvent } from '@/lib/voice/events';
import { VOICE_LIMITS } from '@/lib/voice/limits';

const MAX_FRAME_CHARS = Math.ceil(VOICE_LIMITS.ttsAudioBytes / 3) * 4 + 1024;
function parseFrame(frame: string): EchoEvent | null {
  if (frame.length > MAX_FRAME_CHARS)
    throw new AppError('STREAM_INVALID', 'The voice stream frame is too large');
  let name: string | undefined;
  const lines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') name = value;
    else if (field === 'data') lines.push(value);
  }
  if (name === undefined && lines.length === 0) return null;
  try {
    const data: unknown = JSON.parse(lines.join('\n'));
    return echoEventSchema.parse({ event: name, data });
  } catch {
    throw new AppError(
      'STREAM_INVALID',
      'The voice stream contains a malformed event',
    );
  }
}

export class SseParser {
  private buffer = '';
  push(fragment: string): EchoEvent[] {
    this.buffer = (this.buffer + fragment).replaceAll('\r\n', '\n');
    const result: EchoEvent[] = [];
    for (;;) {
      const boundary = this.buffer.indexOf('\n\n');
      if (boundary === -1) break;
      const event = parseFrame(this.buffer.slice(0, boundary));
      this.buffer = this.buffer.slice(boundary + 2);
      if (event) result.push(event);
    }
    if (this.buffer.length > MAX_FRAME_CHARS)
      throw new AppError(
        'STREAM_INVALID',
        'The voice stream frame is too large',
      );
    return result;
  }
  flush(): EchoEvent[] {
    const final = this.buffer;
    this.buffer = '';
    if (!final.trim()) return [];
    const event = parseFrame(final);
    return event ? [event] : [];
  }
}
