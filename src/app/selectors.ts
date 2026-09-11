/**
 * Selectors — derived state shared by views. Pure functions over the DB so
 * they're unit-testable and impossible to disagree with each other.
 */

import type { Concept, DB, ReviewState, Subject } from '../domain/types';
import { computeMastery, type MasteryInfo } from '../engine/mastery';
import { isDue, overdueDays } from '../engine/scheduling';
import { readiness } from '../engine/readiness';
import { streakInfo, minutesToday, todayXP, totalXP, dayGoalMet } from '../engine/motivation';
import { mean } from '../lib/util';

export function activeSubjects(db: DB): Subject[] {
  return db.subjects
    .filter((s) => !s.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function conceptsOf(db: DB, subjectId?: string): Concept[] {
  return db.concepts.filter((c) => !subjectId || c.subjectId === subjectId);
}

export function masteryInfo(
  db: DB,
  concept: Concept,
  review: ReviewState | undefined,
): MasteryInfo {
  return computeMastery(concept, db.attempts, review);
}

export function masteryFor(db: DB, conceptId: string): MasteryInfo {
  const c = db.concepts.find((x) => x.id === conceptId)!;
  return computeMastery(c, db.attempts, db.review[conceptId]);
}

export function dueConcepts(db: DB, subjectId?: string): Concept[] {
  const now = new Date();
  return db.concepts
    .filter((c) => (!subjectId || c.subjectId === subjectId) && isDue(db.review[c.id], now))
    .sort((a, b) => {
      const ra = db.review[a.id];
      const rb = db.review[b.id];
      return (rb ? overdueDays(rb, now) : 0) - (ra ? overdueDays(ra, now) : 0);
    });
}

export function dueCount(db: DB, subjectId?: string): number {
  return dueConcepts(db, subjectId).length;
}

export interface NextAction {
  kind: 'review' | 'learn' | 'practice' | 'setup' | 'resume';
  title: string;
  subtitle: string;
  minutes: number;
  to: { name: string; params: Record<string, string> };
  subjectId?: string;
}

export function nextBestAction(db: DB): NextAction {
  const subjects = activeSubjects(db);
  if (!subjects.length || !db.concepts.length) {
    return {
      kind: 'setup',
      title: 'Set up your first subject',
      subtitle: 'Two minutes from now you\'ll be studying for real.',
      minutes: 2,
      to: { name: 'onboarding', params: {} },
    };
  }

  const due = dueConcepts(db);
  if (due.length) {
    const subjectId = due[0]!.subjectId;
    const subject = db.subjects.find((s) => s.id === subjectId);
    const minutes = Math.min(db.settings.preferredSessionMinutes, Math.max(5, Math.round(due.length * 0.6)));
    return {
      kind: 'review',
      title: `Review ${subject?.name ?? 'your material'}`,
      subtitle: `${due.length} concept${due.length === 1 ? '' : 's'} due — starting with ${due[0]!.name}.`,
      minutes,
      to: { name: 'review', params: {} },
      subjectId,
    };
  }

  const weakest = [...db.concepts]
    .map((c) => ({ c, m: computeMastery(c, db.attempts, db.review[c.id]) }))
    .filter((x) => x.m.stage !== 'mastered' && x.m.stage !== 'new')
    .sort((a, b) => a.m.score - b.m.score)[0];

  if (weakest) {
    const subject = db.subjects.find((s) => s.id === weakest.c.subjectId);
    return {
      kind: 'practice',
      title: `Strengthen ${weakest.c.name}`,
      subtitle: `${subject?.name ?? 'Subject'} · ${weakest.m.stage} · a few questions will firm it up.`,
      minutes: db.settings.preferredSessionMinutes,
      to: { name: 'concept', params: { id: weakest.c.id } },
      subjectId: weakest.c.subjectId,
    };
  }

  const fresh = db.concepts.find((c) => (db.review[c.id]?.reviewCount ?? 0) === 0);
  if (fresh) {
    const subject = db.subjects.find((s) => s.id === fresh.subjectId);
    return {
      kind: 'learn',
      title: `Meet ${fresh.name}`,
      subtitle: `${subject?.name ?? 'Subject'} · something new to understand.`,
      minutes: db.settings.preferredSessionMinutes,
      to: { name: 'concept', params: { id: fresh.id } },
      subjectId: fresh.subjectId,
    };
  }

  const hasMastered = db.concepts.some((c) => {
    const m = computeMastery(c, db.attempts, db.review[c.id]);
    return m.stage === 'mastered' || m.stage === 'proficient';
  });
  if (hasMastered) {
    return {
      kind: 'practice',
      title: 'Put your knowledge to work',
      subtitle: 'Everything is reviewed — try a practice exam to apply it.',
      minutes: db.settings.preferredSessionMinutes,
      to: { name: 'practice', params: {} },
      subjectId: subjects[0]!.id,
    };
  }

  void 0;
  return {
    kind: 'resume',
    title: 'Keep learning',
    subtitle: 'A short session keeps everything fresh.',
    minutes: db.settings.preferredSessionMinutes,
    to: { name: 'learn', params: {} },
    subjectId: subjects[0]!.id,
  };
}

export interface SubjectSummary {
  subject: Subject;
  conceptCount: number;
  mastered: number;
  due: number;
  readiness: number;
}

export function subjectSummaries(db: DB): SubjectSummary[] {
  return activeSubjects(db).map((subject) => {
    const concepts = conceptsOf(db, subject.id);
    const mastered = concepts.filter((c) => {
      const m = computeMastery(c, db.attempts, db.review[c.id]);
      return m.stage === 'mastered' || (m.stage === 'proficient' && m.score >= 0.8);
    }).length;
    return {
      subject,
      conceptCount: concepts.length,
      mastered,
      due: dueCount(db, subject.id),
      readiness: readiness(concepts, db.review, db.attempts).percent,
    };
  });
}

export interface TodayView {
  due: number;
  minutesToday: number;
  goalMinutes: number;
  goalMet: boolean;
  exam?: { subjectName: string; days: number };
  xpToday: number;
  xpTotal: number;
  streak: { current: number; best: number; activeToday: boolean; last7: { day: string; minutes: number }[] };
  insight?: { title: string; body: string; kind: string };
}

export function todayView(db: DB): TodayView {
  const minutes = minutesToday(db);
  const goalMinutes = db.settings.dailyGoalMinutes;
  const exam = db.subjects
    .filter((s) => s.exam && !s.archivedAt)
    .sort((a, b) => (a.exam!.date < b.exam!.date ? -1 : 1))[0];
  const examDays = exam
    ? Math.ceil((new Date(exam.exam!.date + 'T23:59:59').getTime() - Date.now()) / 86_400_000)
    : undefined;
  const latestInsight = [...db.insights].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return {
    due: dueCount(db),
    minutesToday: minutes,
    goalMinutes,
    goalMet: dayGoalMet(db),
    exam:
      exam && examDays !== undefined && examDays >= 0 && examDays <= 30
        ? { subjectName: exam.name, days: examDays }
        : undefined,
    xpToday: todayXP(db),
    xpTotal: totalXP(db),
    streak: streakInfo(db),
    insight: latestInsight,
  };
}

export function accuracyTrend(db: DB, subjectId?: string, days = 14): { day: string; accuracy: number | null; count: number }[] {
  const out: { day: string; accuracy: number | null; count: number }[] = [];
  const byDay = new Map<string, { vals: number[] }>();
  for (const a of db.attempts) {
    if (subjectId && a.subjectId !== subjectId) continue;
    const day = a.at.slice(0, 10);
    const bucket = byDay.get(day) ?? { vals: [] };
    bucket.vals.push(a.outcome === 'correct' ? 1 : a.outcome === 'partial' ? 0.5 : 0);
    byDay.set(day, bucket);
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = byDay.get(key);
    out.push({
      day: key,
      accuracy: bucket && bucket.vals.length ? Math.round(mean(bucket.vals) * 100) : null,
      count: bucket?.vals.length ?? 0,
    });
  }
  return out;
}
