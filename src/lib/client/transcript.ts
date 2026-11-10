import type { TranscriptMessage } from '@/lib/client/voice-state';
export function upsertTranscript(
  messages: TranscriptMessage[],
  id: string,
  role: TranscriptMessage['role'],
  text: string,
): TranscriptMessage[] {
  return messages.some((message) => message.id === id)
    ? messages.map((message) =>
        message.id === id ? { ...message, text } : message,
      )
    : [...messages, { id, role, text }];
}
