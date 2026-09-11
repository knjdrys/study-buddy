/**
 * Review scheduling — pure, deterministic, testable.
 * SM-2-family: per-concept ease + interval + lapses, confidence-graded.
 * "Again" reschedules for relearning within the same study window, not days
 * away. A mistake is scheduling data, not a punishment.
 */

import type { ReviewState } from '../domain/types';
import { clamp } from '../lib/util';

/** Confidence 0=again, 1=hard, 2=good, 3=easy. */

export const EASE_MIN = 1.3;
export const EASE_MAX = 2.8;
export const EASE_INITIAL = 2.5;
export const INTERVAL_MAX_DAYS = 180;
export const RELEARN_MINUTES = 10;

export const CONFIDENCE_LABELS = ['Again', 'Hard', 'Good', 'Easy'] as const;

export interface ScheduleResult {
  review: ReviewState;
  dueAt: string;
  intervalDays: number;
  message: string;
}

/** First-time intervals (days) for each confidence level. */
export const FIRST_INTERVALS = [RELEARN_MINUTES / (24 * 60), 1, 3, 7];

export function schedule(
  prev: ReviewState | undefined,
  confidence: 0 | 1 | 2 | 3,
  now: Date = new Date(),
): ScheduleResult {
  const isFirst = !prev || prev.reviewCount === 0;

  let ease = prev?.ease ?? EASE_INITIAL;
  let intervalDays: number;
  let lapses = prev?.lapses ?? 0;
  let consecutive = prev?.consecutiveCorrect ?? 0;

  if (isFirst) {
    intervalDays = FIRST_INTERVALS[confidence]!;
  } else {
    const base = prev!.intervalDays;
    switch (confidence) {
      case 0: // again — relearn soon, ease down, count lapse
        intervalDays = RELEARN_MINUTES / (24 * 60);
        ease = clamp(ease - 0.2, EASE_MIN, EASE_MAX);
        lapses += 1;
        consecutive = 0;
        break;
      case 1: // hard — small step, slight ease penalty
        intervalDays = Math.max(base * 1.2, 1);
        ease = clamp(ease - 0.15, EASE_MIN, EASE_MAX);
        consecutive = Math.max(0, consecutive - 1);
        break;
      case 2: // good — normal step
        intervalDays = Math.max(base * ease, 1);
        consecutive += 1;
        break;
      case 3: // easy — bigger step, ease up
        intervalDays = Math.max(base * ease * 1.3, base + 1);
        ease = clamp(ease + 0.15, EASE_MIN, EASE_MAX);
        consecutive += 2;
        break;
    }
  }

  intervalDays = clamp(intervalDays, RELEARN_MINUTES / (24 * 60), INTERVAL_MAX_DAYS);

  const dueAt = new Date(
    now.getTime() + intervalDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const review: ReviewState = {
    stage: prev?.stage ?? 'introduced',
    ease,
    intervalDays,
    dueAt,
    lapses,
    lastReviewedAt: now.toISOString(),
    reviewCount: (prev?.reviewCount ?? 0) + 1,
    consecutiveCorrect: consecutive,
  };

  return { review, dueAt, intervalDays, message: describeSchedule(intervalDays) };
}

export function describeSchedule(intervalDays: number): string {
  if (intervalDays < 0.05) return 'Again in 10 minutes';
  if (intervalDays < 1) return `Again today`;
  if (intervalDays === 1) return 'Again tomorrow';
  if (intervalDays < 7) return `Again in ${Math.round(intervalDays)} days`;
  if (intervalDays < 30) return `Again in ${Math.round(intervalDays / 7)} weeks`;
  return `Again in ${Math.round(intervalDays / 30)} months`;
}

/** Concepts whose review is due (or overdue) relative to now. */
export function isDue(review: ReviewState | undefined, now: Date = new Date()): boolean {
  if (!review) return true; // never reviewed → due for learning
  return new Date(review.dueAt).getTime() <= now.getTime() + 60_000;
}

export function overdueDays(review: ReviewState, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - new Date(review.dueAt).getTime()) / 86_400_000);
}

export function dueLabel(review: ReviewState, now: Date = new Date()): string {
  if (!review.lastReviewedAt) return 'New';
  const ms = new Date(review.dueAt).getTime() - now.getTime();
  if (ms <= 0) return 'Due now';
  if (ms < 86_400_000) return 'Due today';
  if (ms < 2 * 86_400_000) return 'Due tomorrow';
  return `In ${Math.ceil(ms / 86_400_000)} days`;
}
