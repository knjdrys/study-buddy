/**
 * Study Session engine — the product's centerpiece.
 * Given available time and the learner's real state (due schedule, mastery,
 * recent mistakes, exams), it composes a session of concrete activities and
 * explains, in plain language, why each part is there.
 */

import type {
  Attempt,
  Concept,
  ReviewState,
  SessionSegment,
  StudyPlan,
} from '../domain/types';
import { computeMastery } from './mastery';
import { isDue, overdueDays } from './scheduling';
import { plural } from '../lib/util';

export interface SessionPlan {
  segments: SessionSegment[];
  /** One sentence explaining the reasoning, shown to the learner. */
  reason: string;
  totalMinutes: number;
}

const MIN_PER_REVIEW_CARD = 0.6; // ~36s per flashcard
const MIN_PER_APPLY_Q = 1.8;
const MIN_PER_LEARN = 3;
const MIN_PER_EXPLAIN = 3;
const MIN_WARMUP = 2;
const MIN_REFLECT = 1;
const WARMUP_SIZE = 4;
const EXPLAIN_MIN_SESSION = 12;

export function planSession(
  minutes: number,
  concepts: Concept[],
  review: Record<string, ReviewState>,
  attempts: Attempt[],
  opts: { subjectId?: string; now?: Date; plan?: StudyPlan | undefined } = {},
): SessionPlan {
  const now = opts.now ?? new Date();
  const pool = concepts.filter((c) => !opts.subjectId || c.subjectId === opts.subjectId);
  const subjectConcepts = opts.subjectId ? pool : concepts;
  const all = pool.length ? pool : subjectConcepts;

  const attemptFor = (id: string) => attempts.filter((a) => a.conceptId === id);

  const info = new Map(all.map((c) => [c.id, computeMastery(c, attempts, review[c.id])]));

  // ---- candidate pools, ranked ----
  const due = all
    .filter((c) => isDue(review[c.id], now))
    .sort((a, b) => {
      const d = overdueDays(review[b.id]!, now) - overdueDays(review[a.id]!, now);
      return d || (info.get(a.id)!.score - info.get(b.id)!.score);
    });

  const weak = all
    .filter((c) => {
      const m = info.get(c.id)!;
      const rec = attemptFor(c.id).slice(-6);
      const recentMiss = rec.some((a) => a.outcome !== 'correct');
      return m.score < 0.55 || (recentMiss && m.score < 0.75);
    })
    .sort((a, b) => info.get(a.id)!.score - info.get(b.id)!.score);

  const newConcepts = all
    .filter((c) => (review[c.id]?.reviewCount ?? 0) === 0)
    .sort((a, b) => a.difficulty - b.difficulty || a.createdAt.localeCompare(b.createdAt));

  const mastered = all
    .filter((c) => {
      const m = info.get(c.id)!;
      return (m.stage === 'mastered' || (m.stage === 'proficient' && m.score >= 0.8)) && !m.needsReview;
    })
    .sort((a, b) => info.get(b.id)!.score - info.get(a.id)!.score);

  const explainable = all
    .filter((c) => {
      const m = info.get(c.id)!;
      const daysSinceApplied = m.evidence.explanation > 0 ? 14 : 0;
      const lastExplain = attemptFor(c.id)
        .filter((a) => a.mode === 'feynman' || a.mode === 'blurt')
        .slice(-1)[0];
      if (lastExplain) {
        const d = (Date.now() - new Date(lastExplain.at).getTime()) / 86_400_000;
        return d > 4 || lastExplain.outcome === 'incorrect';
      }
      return m.evidence.explanation === 0 && daysSinceApplied === 0 && m.score > 0.3;
    })
    .sort((a, b) => info.get(a.id)!.score - info.get(b.id)!.score);

  // ---- budget ----
  let budget = Math.max(3, Math.round(minutes));
  const segments: SessionSegment[] = [];
  const used = new Set<string>();
  const take = (candidates: Concept[], count: number, perMin: number) => {
    const ids: string[] = [];
    for (const c of candidates) {
      if (used.has(c.id) || ids.length >= count) continue;
      if (budget < perMin * 0.5 && segments.length > 0) break;
      used.add(c.id);
      ids.push(c.id);
    }
    return ids;
  };

  const reasons: string[] = [];
  const nDue = due.length;

  // 1 · warm-up retrieval — mastered concepts, keeps them sharp
  const warmupPool = mastered.filter((c) => !due.includes(c));
  if (warmupPool.length >= 2 && budget >= MIN_WARMUP + MIN_REFLECT) {
    const ids = take(warmupPool, WARMUP_SIZE, 0.5);
    if (ids.length >= 2) {
      segments.push({ kind: 'warmup', conceptIds: ids, minutes: MIN_WARMUP });
      budget -= MIN_WARMUP;
    }
  }

  // 2 · due review — the non-negotiable part
  if (due.length) {
    const ids = take(due, Math.floor(budget / MIN_PER_REVIEW_CARD), MIN_PER_REVIEW_CARD);
    if (ids.length) {
      const mins = Math.max(2, Math.round(ids.length * MIN_PER_REVIEW_CARD));
      segments.push({ kind: 'review', conceptIds: ids, minutes: mins });
      budget -= mins;
      if (nDue > ids.length) {
        reasons.push(`${plural(nDue - ids.length, 'concept')} still due — they'll roll into tomorrow`);
      }
      reasons.push(`${plural(ids.length, 'concept')} ${ids.length === 1 ? 'is' : 'are'} due for review`);
    }
  } else if (weak.length) {
    reasons.push('nothing is overdue — we\'ll reinforce what\'s weakest');
  } else if (newConcepts.length) {
    reasons.push('reviews are clear — let\'s learn something new');
  } else {
    reasons.push('everything is on schedule — let\'s stay sharp');
  }

  // 3 · weak-concept review (only when not already the due review)
  if (!due.length && weak.length) {
    const ids = take(weak, Math.floor(budget / MIN_PER_REVIEW_CARD), MIN_PER_REVIEW_CARD);
    if (ids.length) {
      const mins = Math.max(2, Math.round(ids.length * MIN_PER_REVIEW_CARD));
      segments.push({ kind: 'review', conceptIds: ids, minutes: mins });
      budget -= mins;
    }
  }

  // 4 · learn something new (understand step of the loop)
  if (newConcepts.length && budget >= MIN_PER_LEARN) {
    const ids = take(newConcepts, Math.floor(budget / MIN_PER_LEARN), MIN_PER_LEARN);
    if (ids.length) {
      const mins = Math.round(ids.length * MIN_PER_LEARN);
      segments.push({ kind: 'learn', conceptIds: ids, minutes: mins });
      budget -= mins;
    }
  }

  // 5 · application — knowledge gets used
  const applyable = all.filter((c) => {
    const m = info.get(c.id)!;
    return m.score >= 0.45 && !used.has(c.id) && !newConcepts.includes(c);
  });
  if (applyable.length && budget >= MIN_PER_APPLY_Q) {
    const ids = take(applyable, Math.floor(budget / MIN_PER_APPLY_Q), MIN_PER_APPLY_Q);
    if (ids.length) {
      const mins = Math.round(ids.length * MIN_PER_APPLY_Q);
      segments.push({ kind: 'apply', conceptIds: ids, minutes: mins });
      budget -= mins;
    }
  }

  // 6 · explain — Feynman/blurt for the weakest explainable concept
  if (explainable.length && minutes >= EXPLAIN_MIN_SESSION && budget >= MIN_PER_EXPLAIN) {
    const ids = take(explainable, 1, MIN_PER_EXPLAIN);
    if (ids.length) {
      segments.push({ kind: 'explain', conceptIds: ids, minutes: MIN_PER_EXPLAIN });
      budget -= MIN_PER_EXPLAIN;
    }
  }

  // 7 · reflection — close the loop
  if (segments.length) {
    segments.push({ kind: 'reflect', conceptIds: [], minutes: Math.min(MIN_REFLECT, budget) });
    budget -= Math.min(MIN_REFLECT, budget);
  }

  const totalMinutes = segments.reduce((s, x) => s + x.minutes, 0);
  return {
    segments,
    totalMinutes,
    reason: reasons.slice(0, 2).join(' · '),
  };
}

export const SEGMENT_TITLES: Record<SessionSegment['kind'], string> = {
  warmup: 'Warm-up recall',
  review: 'Review',
  learn: 'Meet something new',
  apply: 'Put it to work',
  explain: 'Explain it back',
  reflect: 'Wrap up',
};

export const SEGMENT_BLURB: Record<SessionSegment['kind'], string> = {
  warmup: 'Quick-fire retrieval of things you already know well — keeps them fresh.',
  review: 'Flashcards for concepts that are due or shaky. Take your time, rate honestly.',
  learn: 'Read and understand a new concept. No testing yet — just take it in.',
  apply: 'Questions and problems. Knowledge counts when you can use it.',
  explain: 'Teach the concept back in your own words. The best test of understanding.',
  reflect: 'A moment to note what clicked, what didn\'t, and what\'s next.',
};
