/**
 * Exam readiness — a single, explainable number with the reasoning behind it.
 * readiness = coverage (mastered share) + accuracy + freshness, all from
 * real attempts and review state.
 */

import type { Attempt, Concept, ReviewState } from '../domain/types';
import { computeMastery } from './mastery';
import { mean, round1 } from '../lib/util';

export interface ReadinessInfo {
  percent: number; // 0..100
  mastered: number;
  total: number;
  parts: { coverage: number; accuracy: number; freshness: number };
  verdict: string;
  advice: string;
}

export function readiness(
  concepts: Concept[],
  review: Record<string, ReviewState>,
  attempts: Attempt[],
): ReadinessInfo {
  const total = concepts.length;
  if (total === 0) {
    return {
      percent: 0,
      mastered: 0,
      total: 0,
      parts: { coverage: 0, accuracy: 0, freshness: 0 },
      verdict: 'Nothing here yet',
      advice: 'Add concepts for this subject to get a readiness picture.',
    };
  }

  let mastered = 0;
  for (const c of concepts) {
    const m = computeMastery(c, attempts, review[c.id]);
    if (m.stage === 'mastered' || (m.stage === 'proficient' && m.score >= 0.8)) mastered++;
  }
  const coverage = mastered / total;

  const subjectAttempts = attempts.filter((a) =>
    concepts.some((c) => c.id === a.conceptId),
  );
  const outcomes = subjectAttempts.slice(-40);
  const accuracy = outcomes.length
    ? mean(outcomes.map((a) => (a.outcome === 'correct' ? 1 : a.outcome === 'partial' ? 0.5 : 0)))
    : 0;

  // freshness: share of concepts reviewed in the last 7 days
  const fresh = concepts.filter((c) => {
    const r = review[c.id];
    if (!r?.lastReviewedAt) return false;
    return Date.now() - new Date(r.lastReviewedAt).getTime() < 7 * 86_400_000;
  }).length;
  const freshness = fresh / total;

  const percent = Math.round((coverage * 0.5 + accuracy * 0.3 + freshness * 0.2) * 100);

  let verdict: string;
  let advice: string;
  if (percent >= 85) {
    verdict = 'You look ready';
    advice = 'Do a final practice exam to calibrate confidence, then rest — sleep consolidates more than cramming.';
  } else if (percent >= 65) {
    verdict = 'Almost there';
    advice = `Focus on the ${total - mastered} concepts still below mastery, and keep reviews current.`;
  } else if (percent >= 40) {
    verdict = 'Getting there';
    advice = 'Lean on sessions: due reviews first, then weak concepts, then practice.';
  } else {
    verdict = 'Early days';
    advice = 'Follow the daily session plan — consistency matters more than long sessions.';
  }

  return {
    percent: round1(percent),
    mastered,
    total,
    parts: {
      coverage: round1(coverage),
      accuracy: round1(accuracy),
      freshness: round1(freshness),
    },
    verdict,
    advice,
  };
}
