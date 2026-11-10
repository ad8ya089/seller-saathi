import { AppError } from '@/lib/errors';
import type { Session } from '@/lib/agent/session';

export const INTERRUPTION_MARKER =
  '[Interrupted by seller; remaining speech was not heard.]';

export function applyPlaybackReceipt(session: Session, played: number): void {
  const last = session.history.at(-1);
  if (
    !Number.isInteger(played) ||
    played < 0 ||
    !last?.sentences ||
    played > last.sentences.length
  )
    throw new AppError(
      'INVALID_INPUT',
      'playedSentences exceeds the previous assistant reply',
    );
  last.interrupted = true;
  last.spoken = [...last.sentences.slice(0, played), INTERRUPTION_MARKER].join(
    ' ',
  );
  // Signed provider Content and genuinely executed function exchanges remain
  // verbatim. The next system context explicitly identifies what was heard.
}
