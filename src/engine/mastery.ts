/**
 * Mastery engine — deterministic, recomputable from attempts + review state.
 * Mastery blends: accuracy (EMA), lapses, recency, evidence depth
 * (retrieval, application, explanation), difficulty and consistency.
 * Stage is earned by evidence, not by a single number.
 */

import type { Attempt, Concept, Outcome, ReviewState, Stage } from '../domain/types';
import { ema } from '../lib/util';

export const STAGE_ORDER: Stage[] = [
  'new',
  'introduced',
  'learning',
  'familiar',
  'developing',
  'proficient',
  'mastered',
];

export interface MasteryInfo {
  stage: Stage;
  score: number; // 0..1
  needsReview: boolean;
  accuracy: number; // 0..1 (EMA)
  evidence: {
    retrieval: number; // flashcard/mc/tf/typed attempts
    application: number; // scenario/problem attempts
    explanation: number; // blurt/feynman/tutor attempts
  };
}

const OUTCOME_VALUE: Record<Outcome, number> = { correct: 1, partial: 0.55, incorrect: 0 };

const RETRIEVAL_MODES = new Set(['flashcard', 'mc', 'tf', 'typed']);
const APPLICATION_MODES = new Set(['scenario', 'problem']);
const EXPLANATION_MODES = new Set(['blurt', 'feynman', 'tutor']);

export function computeMastery(
  concept: Concept,
  attempts: Attempt[],
  review: ReviewState | undefined,
): MasteryInfo {
  const own = attempts.filter((a) => a.conceptId === concept.id);
  const evidence = {
    retrieval: own.filter((a) => RETRIEVAL_MODES.has(a.mode)).length,
    application: own.filter((a) => APPLICATION_MODES.has(a.mode)).length,
    explanation: own.filter((a) => EXPLANATION_MODES.has(a.mode)).length,
  };

  if (!own.length) {
    return { stage: 'new', score: 0, needsReview: false, accuracy: 0, evidence };
  }

  // Accuracy EMA (older attempts decay out).
  let accuracy = 0;
  let first = true;
  for (const a of own) {
    const v = OUTCOME_VALUE[a.outcome];
    accuracy = first ? v : ema(accuracy, v, 0.4);
    first = false;
  }

  // Recent accuracy (last 6) — catches backsliding.
  const recent = own.slice(-6);
  const recentAccuracy = recent.reduce((s, a) => s + OUTCOME_VALUE[a.outcome], 0) / recent.length;

  // Lapse penalty.
  const lapseFactor = review ? Math.max(0, 1 - (review.lapses ?? 0) * 0.18) : 1;

  // Recency: reviews older than ~30 days decay confidence.
  const lastAt = review?.lastReviewedAt
    ? new Date(review.lastReviewedAt).getTime()
    : new Date(own[own.length - 1]!.at).getTime();
  const daysSince = Math.max(0, (Date.now() - lastAt) / 86_400_000);
  const recency = Math.exp(-daysSince / 28);

  // Evidence depth: retrieval alone can't master; application/explanation unlock the top.
  const total = own.length;
  const applied = evidence.application + evidence.explanation;
  const depthFactor =
    total >= 5 && applied >= 1 ? 1 : total >= 3 && applied >= 1 ? 0.92 : total >= 2 ? 0.8 : 0.6;

  // Difficulty: harder concepts require more evidence to fully master.
  const diffFactor = concept.difficulty === 3 ? 0.94 : concept.difficulty === 2 ? 0.97 : 1;

  // Response time: consistently instant answers with high confidence are
  // cheap recognition; very slow answers suggest uncertainty. Mild shaping.
  const times = own.filter((a) => a.elapsedMs > 0).map((a) => a.elapsedMs);
  const avgMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const timeFactor = avgMs > 0 && avgMs < 1800 ? 0.99 : avgMs > 30_000 ? 0.97 : 1;

  const score = Math.min(
    1,
    Math.max(
      0,
      (accuracy * 0.45 + recentAccuracy * 0.3 + recency * 0.15) *
        lapseFactor *
        depthFactor *
        diffFactor *
        timeFactor,
    ),
  );

  const needsReview =
    !!review &&
    recent.length >= 3 &&
    recent.filter((a) => a.outcome === 'incorrect').length >= 2;

  return {
    stage: stageFor(score, total, applied, needsReview),
    score,
    needsReview,
    accuracy,
    evidence,
  };
}

function stageFor(score: number, total: number, applied: number, needsReview: boolean): Stage {
  if (needsReview && score >= 0.6) return 'familiar'; // knocked back down
  if (score >= 0.85 && total >= 5 && applied >= 1) return 'mastered';
  if (score >= 0.7) return 'proficient';
  if (score >= 0.55) return 'developing';
  if (score >= 0.35) return 'familiar';
  if (total >= 3) return 'learning';
  if (total >= 1) return 'introduced';
  return 'new';
}

export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Not started',
  introduced: 'Just introduced',
  learning: 'Learning',
  familiar: 'Familiar',
  developing: 'Developing',
  proficient: 'Proficient',
  mastered: 'Mastered',
};

export function stageChipClass(stage: Stage, needsReview: boolean): string {
  if (needsReview) return 'chip berry';
  switch (stage) {
    case 'mastered':
      return 'chip pine';
    case 'proficient':
    case 'developing':
      return 'chip moss';
    case 'learning':
    case 'familiar':
      return 'chip amber';
    case 'introduced':
      return 'chip slate';
    default:
      return 'chip';
  }
}

export function stageProgress(stage: Stage): number {
  return (STAGE_ORDER.indexOf(stage) + 1) / STAGE_ORDER.length;
}
