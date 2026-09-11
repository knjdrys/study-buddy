/**
 * Domain actions — the only place the document mutates in response to user
 * behavior. Each action keeps invariants: attempts are recorded, scheduling
 * and mastery are recomputed from the same event, XP reflects learning acts,
 * and insights are regenerated from fresh data.
 */

import type {
  Attempt,
  Concept,
  DB,
  Deck,
  Question,
  SessionSegment,
  Subject,
  Topic,
} from '../domain/types';
import { newId, nowISO, todayKey } from '../lib/util';
import { schedule } from '../engine/scheduling';
import { computeMastery } from '../engine/mastery';
import { awardXP } from '../engine/motivation';
import { generateInsights } from '../engine/insights';
import { store } from './state';

export type ConfidenceLevel = 0 | 1 | 2 | 3;

/* ---------------- basic CRUD ---------------- */

export function createSubject(input: {
  name: string;
  code?: string;
  description?: string;
  goal?: string;
  examDate?: string;
}): Subject {
  const now = nowISO();
  const s: Subject = {
    id: newId('sub'),
    name: input.name.trim(),
    code: input.code?.trim() || undefined,
    description: input.description?.trim() || undefined,
    goal: input.goal?.trim() || undefined,
    exam: input.examDate ? { date: input.examDate } : undefined,
    createdAt: now,
    updatedAt: now,
  };
  store.update((db) => db.subjects.push(s));
  return s;
}

export function updateSubject(id: string, patch: Partial<Subject>): void {
  store.update((db) => {
    const s = db.subjects.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch, { updatedAt: nowISO() });
  });
}

export function archiveSubject(id: string): void {
  store.update((db) => {
    const s = db.subjects.find((x) => x.id === id);
    if (s) s.archivedAt = nowISO();
  });
}

export function createTopic(subjectId: string, name: string, description?: string): Topic {
  const t: Topic = {
    id: newId('top'),
    subjectId,
    name: name.trim(),
    description: description?.trim() || undefined,
    position: 0,
  };
  store.update((db) => {
    const max = db.topics.filter((x) => x.subjectId === subjectId).length;
    t.position = max;
    db.topics.push(t);
  });
  return t;
}

export function createConcept(input: {
  subjectId: string;
  topicId?: string;
  name: string;
  summary: string;
  explanation: string;
  example?: string;
  misconception?: string;
  notes?: string;
  difficulty?: 1 | 2 | 3;
  origin?: Concept['origin'];
}): Concept {
  const now = nowISO();
  const c: Concept = {
    id: newId('con'),
    subjectId: input.subjectId,
    topicId: input.topicId,
    name: input.name.trim(),
    summary: input.summary.trim(),
    explanation: input.explanation.trim(),
    example: input.example?.trim() || undefined,
    misconception: input.misconception?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    relatedIds: [],
    resources: [],
    flashcards: [],
    questions: [],
    difficulty: input.difficulty ?? 1,
    origin: input.origin ?? 'user',
    createdAt: now,
    updatedAt: now,
  };
  store.update((db) => db.concepts.push(c));
  return c;
}

export function updateConcept(id: string, patch: Partial<Concept>): void {
  store.update((db) => {
    const c = db.concepts.find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch, { updatedAt: nowISO() });
  });
}

export function deleteConcept(id: string): void {
  store.update((db) => {
    db.concepts = db.concepts.filter((c) => c.id !== id);
    delete db.review[id];
    db.attempts = db.attempts.filter((a) => a.conceptId !== id);
    for (const d of db.decks) d.cards = d.cards.filter((x) => x.conceptId !== id);
    db.insights = db.insights.filter((i) => !i.conceptIds.includes(id));
    db.sync.tombstoned[id] = nowISO();
  });
}

export function setRelated(conceptId: string, relatedIds: string[]): void {
  updateConcept(conceptId, { relatedIds });
}

export function addFlashcards(conceptId: string, cards: { front: string; back: string }[]): void {
  store.update((db) => {
    const c = db.concepts.find((x) => x.id === conceptId);
    if (!c) return;
    for (const card of cards) {
      if (!card.front.trim()) continue;
      c.flashcards.push({
        id: newId('fc'),
        front: card.front.trim(),
        back: card.back.trim() || '—',
      });
    }
    c.updatedAt = nowISO();
  });
}

export function replaceFlashcards(conceptId: string, cards: { front: string; back: string }[]): void {
  store.update((db) => {
    const c = db.concepts.find((x) => x.id === conceptId);
    if (!c) return;
    c.flashcards = cards
      .filter((card) => card.front.trim())
      .map((card) => ({
        id: newId('fc'),
        front: card.front.trim(),
        back: card.back.trim() || '—',
      }));
    c.updatedAt = nowISO();
  });
}

export function addQuestions(conceptId: string, questions: Question[]): void {
  store.update((db) => {
    const c = db.concepts.find((x) => x.id === conceptId);
    if (!c) return;
    c.questions.push(...questions);
    c.updatedAt = nowISO();
  });
}

export function removeQuestion(conceptId: string, questionId: string): void {
  store.update((db) => {
    const c = db.concepts.find((x) => x.id === conceptId);
    if (!c) return;
    c.questions = c.questions.filter((q) => q.id !== questionId);
  });
}

/* ---------------- decks ---------------- */

export function createDeck(name: string, subjectId?: string): Deck {
  const now = nowISO();
  const d: Deck = {
    id: newId('deck'),
    name: name.trim(),
    subjectId,
    cards: [],
    createdAt: now,
    updatedAt: now,
  };
  store.update((db) => db.decks.push(d));
  return d;
}

export function deleteDeck(id: string): void {
  store.update((db) => {
    db.decks = db.decks.filter((d) => d.id !== id);
  });
}

/* ---------------- learning events ---------------- */

export interface RecordAttemptInput {
  conceptId: string;
  mode: Attempt['mode'];
  outcome: Attempt['outcome'];
  confidence: ConfidenceLevel;
  elapsedMs: number;
  /** Which concept's content the learner picked instead (confusion tracking). */
  distractorConceptId?: string;
}

/** The single funnel for every answered prompt. Returns the attempt id. */
export function recordAttempt(input: RecordAttemptInput): string {
  const attempt: Attempt = {
    id: newId('att'),
    conceptId: input.conceptId,
    subjectId: '',
    mode: input.mode,
    outcome: input.outcome,
    confidence: input.confidence,
    elapsedMs: input.elapsedMs,
    at: nowISO(),
    distractorConceptId: input.distractorConceptId,
  };
  store.update((db) => {
    const concept = db.concepts.find((c) => c.id === input.conceptId);
    if (!concept) return;
    attempt.subjectId = concept.subjectId;
    db.attempts.push(attempt);

    // scheduling
    const prev = db.review[concept.id];
    const { review } = schedule(prev, input.confidence, new Date());
    db.review[concept.id] = review;

    // mastery (stage is a cache of the pure computation)
    const m = computeMastery(concept, db.attempts, review);
    review.stage = m.stage;
    if (m.needsReview && m.stage !== 'familiar') {
      // schedule a short re-review for mastered concepts that slipped
      review.dueAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    }

    // xp — learning acts only
    if (input.outcome === 'incorrect') awardXP(db, 'correction');
    else awardXP(db, input.mode === 'scenario' || input.mode === 'problem' ? 'application' : 'retrieval');

    // mastery milestone
    if (prev && prev.stage !== review.stage && review.stage === 'mastered') {
      awardXP(db, 'mastery', concept.name);
    }
  });
  return attempt.id;
}

export function recordSession(session: {
  id?: string;
  subjectId?: string;
  minutesPlanned: number;
  minutesActual: number;
  segments: SessionSegment[];
  attempts: string[];
}): string {
  const now = nowISO();
  const id = session.id ?? newId('sess');
  store.update((db) => {
    const today = todayKey();
    const metTodayBefore = db.sessions.some(
      (s) => s.status === 'done' && s.endedAt && s.endedAt.slice(0, 10) === today,
    );
    db.sessions.push({
      id,
      subjectId: session.subjectId,
      minutesPlanned: session.minutesPlanned,
      minutesActual: session.minutesActual,
      segments: session.segments,
      attempts: session.attempts,
      status: 'done',
      startedAt: now,
      endedAt: now,
      createdAt: now,
    });
    awardXP(db, 'session');
    if (!metTodayBefore && db.settings.dailyGoalMinutes <= session.minutesActual) {
      awardXP(db, 'goal');
    }
    const fresh = generateInsights(
      {
        concepts: db.concepts,
        review: db.review,
        attempts: db.attempts,
        existing: db.insights,
        examDate: nearestExam(db),
        examSubjectId: nearestExamSubject(db),
      },
      new Date(),
    );
    db.insights.push(...fresh);
  });
  return id;
}

function nearestExam(db: DB): string | undefined {
  return db.subjects
    .filter((s) => s.exam && !s.archivedAt)
    .sort((a, b) => (a.exam!.date < b.exam!.date ? -1 : 1))[0]?.exam?.date;
}

function nearestExamSubject(db: DB): string | undefined {
  return db.subjects
    .filter((s) => s.exam && !s.archivedAt)
    .sort((a, b) => (a.exam!.date < b.exam!.date ? -1 : 1))[0]?.id;
}

export function recordBlurt(
  subjectId: string,
  results: { conceptId: string; status: 'remembered' | 'partial' | 'missed' }[],
  elapsedMs: number,
): void {
  store.update((db) => {
    for (const r of results) {
      const concept = db.concepts.find((c) => c.id === r.conceptId);
      if (!concept) continue;
      const attempt: Attempt = {
        id: newId('att'),
        conceptId: r.conceptId,
        subjectId,
        mode: 'blurt',
        outcome: r.status === 'remembered' ? 'correct' : r.status === 'partial' ? 'partial' : 'incorrect',
        confidence: r.status === 'remembered' ? 2 : 1,
        elapsedMs: Math.round(elapsedMs / results.length),
        at: nowISO(),
      };
      db.attempts.push(attempt);
      const prev = db.review[concept.id];
      const conf: ConfidenceLevel = r.status === 'remembered' ? 2 : r.status === 'partial' ? 1 : 0;
      const { review } = schedule(prev, conf, new Date());
      db.review[concept.id] = review;
      const m = computeMastery(concept, db.attempts, review);
      review.stage = m.stage;
    }
    awardXP(db, 'explanation', 'blurt');
    const fresh = generateInsights(
      {
        concepts: db.concepts,
        review: db.review,
        attempts: db.attempts,
        existing: db.insights,
      },
      new Date(),
    );
    db.insights.push(...fresh);
  });
}

export function recordFeynman(
  conceptId: string,
  coverage: number,
  elapsedMs: number,
  hadJargon: boolean,
): void {
  store.update((db) => {
    const concept = db.concepts.find((c) => c.id === conceptId);
    if (!concept) return;
    const attempt: Attempt = {
      id: newId('att'),
      conceptId,
      subjectId: concept.subjectId,
      mode: 'feynman',
      outcome: coverage >= 0.55 ? 'correct' : coverage >= 0.3 ? 'partial' : 'incorrect',
      confidence: hadJargon ? 1 : coverage >= 0.55 ? 2 : 1,
      elapsedMs,
      at: nowISO(),
    };
    db.attempts.push(attempt);
    const prev = db.review[concept.id];
    const conf: ConfidenceLevel = coverage >= 0.55 ? 2 : coverage >= 0.3 ? 1 : 0;
    const { review } = schedule(prev, conf, new Date());
    db.review[concept.id] = review;
    const m = computeMastery(concept, db.attempts, review);
    review.stage = m.stage;
    awardXP(db, 'explanation', 'feynman');
  });
}

export function recordExam(subjectId: string, attempts: string[], correctCount: number): void {
  store.update((db) => {
    awardXP(db, 'exam', `${correctCount} correct`);
    db.sessions.push({
      id: newId('sess'),
      subjectId,
      minutesPlanned: 0,
      minutesActual: 0,
      segments: [],
      attempts,
      status: 'done',
      startedAt: nowISO(),
      endedAt: nowISO(),
      createdAt: nowISO(),
    });
    const fresh = generateInsights(
      {
        concepts: db.concepts,
        review: db.review,
        attempts: db.attempts,
        existing: db.insights,
      },
      new Date(),
    );
    db.insights.push(...fresh);
  });
}

/* ---------------- profile & settings ---------------- */

export function setProfileName(name: string): void {
  store.update((db) => {
    db.profile = {
      id: db.profile?.id ?? 'user',
      name: name.trim(),
      joinedAt: db.profile?.joinedAt ?? nowISO(),
    };
  });
}

export function patchSettings(patch: Partial<DB['settings']>): void {
  store.update((db) => {
    Object.assign(db.settings, patch);
  });
}

export function patchAISettings(patch: Partial<DB['settings']['ai']>): void {
  store.update((db) => {
    Object.assign(db.settings.ai, patch);
  });
}

/* ---------------- data management ---------------- */

export function exportBackup(): string {
  const db = store.get();
  return JSON.stringify(
    {
      ...db,
      settings: { ...db.settings, ai: { ...db.settings.ai, apiKey: '' } }, // never export keys
      sync: { lastPushedAt: undefined, lastPulledAt: undefined, pendingPush: 0, tombstoned: {} },
    },
    null,
    2,
  );
}

export function clearAllData(): void {
  store.update((db) => {
    db.subjects = [];
    db.topics = [];
    db.concepts = [];
    db.decks = [];
    db.review = {};
    db.attempts = [];
    db.sessions = [];
    db.plans = [];
    db.goals = [];
    db.insights = [];
    db.xp = [];
    db.sync.pendingPush = 0;
  });
}
