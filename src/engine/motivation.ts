/**
 * Motivation engine.
 * XP is awarded for learning acts only: retrieval, correction, explanation,
 * application, sessions, mastery gains, and daily consistency. No idle
 * rewards, no "feed the pet". Streaks are soft: a missed day costs the
 * current streak but never wipes best streak or weekly progress.
 */

import type { DB, XPRecord } from '../domain/types';
import { dateKey, newId, nowISO, todayKey } from '../lib/util';

export type XpReason =
  | 'retrieval' // answering a card/question
  | 'correction' // logging a wrong answer honestly
  | 'application' // scenario/problem answered
  | 'explanation' // blurt/feynman completed
  | 'session' // finished a study session
  | 'exam' // finished a practice exam
  | 'mastery' // concept reached a new stage
  | 'goal' // daily goal met
  | 'streak';

const AMOUNTS: Record<XpReason, number> = {
  retrieval: 4,
  correction: 3,
  application: 8,
  explanation: 10,
  session: 15,
  exam: 12,
  mastery: 20,
  goal: 10,
  streak: 5,
};

export function awardXP(db: DB, reason: XpReason, note = ''): number {
  const amount = AMOUNTS[reason];
  const rec: XPRecord = {
    id: newId('xp'),
    amount,
    reason: note ? `${reason}: ${note}` : reason,
    at: nowISO(),
  };
  db.xp.push(rec);
  return amount;
}

export function totalXP(db: DB): number {
  return db.xp.reduce((s, r) => s + r.amount, 0);
}

export function todayXP(db: DB): number {
  const today = todayKey();
  return db.xp.filter((r) => dateKey(r.at) === today).reduce((s, r) => s + r.amount, 0);
}

/* ---------------- streak & consistency ---------------- */

export interface StreakInfo {
  current: number;
  best: number;
  activeToday: boolean;
  last7: { day: string; minutes: number }[];
}

/** Days (date keys) on which the learner did at least one learning act. */
export function activeDays(db: DB): Set<string> {
  const days = new Set<string>();
  for (const a of db.attempts) days.add(dateKey(a.at));
  for (const s of db.sessions) {
    if (s.status === 'done' && s.endedAt) days.add(dateKey(s.endedAt));
  }
  return days;
}

export function streakInfo(db: DB): StreakInfo {
  const days = activeDays(db);
  const today = todayKey();

  let current = 0;
  const cursor = new Date();
  if (!days.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // grace: yesterday still counts
  while (days.has(todayKey(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = 0;
  const all = [...days].sort();
  let run = 0;
  let prev: string | null = null;
  for (const d of all) {
    if (prev) {
      const p = new Date(prev + 'T00:00:00');
      p.setDate(p.getDate() + 1);
      run = todayKey(p) === d ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = d;
  }

  const last7: StreakInfo['last7'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const minutes = minutesOnDay(db, key);
    last7.push({ day: key, minutes });
  }

  return { current, best, activeToday: days.has(today), last7 };
}

export function minutesOnDay(db: DB, day: string): number {
  let mins = 0;
  for (const s of db.sessions) {
    if (s.status === 'done' && s.endedAt && dateKey(s.endedAt) === day) {
      mins += s.minutesActual ?? s.minutesPlanned;
    }
  }
  return mins;
}

export function minutesToday(db: DB): number {
  return minutesOnDay(db, todayKey());
}

export function dayGoalMet(db: DB): boolean {
  return minutesToday(db) >= db.settings.dailyGoalMinutes;
}
