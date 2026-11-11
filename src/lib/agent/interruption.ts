import { AppError } from '@/lib/errors';
import type { Session } from '@/lib/agent/session';
import { transition } from '@/lib/agent/phases';
import { QUESTION_BANK } from '@/lib/domain/questions';

export const INTERRUPTION_MARKER =
  '[Interrupted by seller; remaining speech was not heard.]';

export function applyPlaybackReceipt(session: Session, played: number): void {
  const last = session.history.at(-1);
  const response = session.playback ?? last;
  if (
    !Number.isInteger(played) ||
    played < 0 ||
    !response?.sentences ||
    played > response.sentences.length
  )
    throw new AppError(
      'INVALID_INPUT',
      'playedSentences exceeds the previous assistant reply',
    );
  response.interrupted = true;
  response.spoken = [
    ...response.sentences.slice(0, played),
    INTERRUPTION_MARKER,
  ].join(' ');
  if (last?.turn === response.turn) {
    last.interrupted = true;
    last.spoken = response.spoken;
  }
  if (response.questionId) {
    const index =
      session.lang === 'hi-IN'
        ? response.sentences
            .map((sentence) => sentence.trim().endsWith('?'))
            .lastIndexOf(true)
        : response.sentences.indexOf(QUESTION_BANK[response.questionId].text);
    if (
      index >= played &&
      session.questionsAsked.at(-1) === response.questionId
    )
      session.questionsAsked.pop();
  }
  if (
    session.phase === 'confirm' &&
    session.proposedPlan?.proposedAtTurn === response.turn &&
    played < response.sentences.length
  ) {
    if (session.followup) {
      session.followup.awaitingAcceptance = false;
      delete session.proposedPlan;
      session.phase = 'recommend';
      return;
    }
    transition(session, 'recommend');
    delete session.proposedPlan;
    transition(session, 'investigate');
  }
  // Signed provider Content and genuinely executed function exchanges remain
  // verbatim. The next system context explicitly identifies what was heard.
}
