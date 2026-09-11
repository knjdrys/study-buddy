/**
 * StudyBuddy domain model.
 * The fundamental unit is the CONCEPT — flashcards, questions, notes and
 * resources attach to concepts; every learning mode writes attempts into
 * one shared history, from which mastery, scheduling and insights derive.
 */

export type ID = string;

export type Difficulty = 1 | 2 | 3;

/** Mastery stage, lowest → highest. */
export type Stage =
  | 'new'
  | 'introduced'
  | 'learning'
  | 'familiar'
  | 'developing'
  | 'proficient'
  | 'mastered';

export type ContentOrigin = 'user' | 'ai' | 'ai-reviewed' | 'ai-verified';

export type QuestionKind = 'mc' | 'tf' | 'typed' | 'scenario' | 'problem';

export type AttemptMode =
  | 'flashcard'
  | 'mc'
  | 'tf'
  | 'typed'
  | 'scenario'
  | 'problem'
  | 'identify'
  | 'fill'
  | 'match'
  | 'short'
  | 'blurt'
  | 'feynman'
  | 'tutor'
  | 'session';

export type Outcome = 'correct' | 'partial' | 'incorrect';

export interface Exam {
  date: string; // YYYY-MM-DD
  label?: string;
}

export interface Resource {
  id: ID;
  kind: 'note' | 'link' | 'book';
  title: string;
  body?: string;
  url?: string;
  createdAt: string;
}

export interface Flashcard {
  id: ID;
  front: string;
  back: string;
  hint?: string;
}

export interface Question {
  id: ID;
  kind: QuestionKind;
  prompt: string;
  /** mc: option texts; answer = index. tf: [trueText, falseText]; answer = 'true' | 'false'. */
  options?: string[];
  answer: string;
  explanation?: string;
}

export interface Concept {
  id: ID;
  subjectId: ID;
  topicId?: ID;
  name: string;
  summary: string; // one-sentence gist used everywhere (lists, session prompts)
  explanation: string; // the full "teach it" text
  example?: string;
  misconception?: string;
  notes?: string;
  relatedIds: ID[];
  resources: Resource[];
  flashcards: Flashcard[];
  questions: Question[];
  difficulty: Difficulty;
  origin: ContentOrigin;
  /** Set when the learner explicitly verified AI-drafted content. */
  verifiedByUser?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: ID;
  subjectId: ID;
  name: string;
  description?: string;
  position: number;
}

export interface Subject {
  id: ID;
  name: string;
  code?: string;
  description?: string;
  goal?: string;
  exam?: Exam;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deck {
  id: ID;
  name: string;
  subjectId?: ID;
  description?: string;
  /** Curated subset of (conceptId, flashcardId) pairs. */
  cards: { conceptId: ID; flashcardId: ID }[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewState {
  stage: Stage;
  ease: number; // 1.3 … 2.8
  intervalDays: number;
  dueAt: string; // ISO — deterministic scheduling target
  lapses: number;
  lastReviewedAt?: string;
  reviewCount: number;
  consecutiveCorrect: number;
}

export interface Attempt {
  id: ID;
  conceptId: ID;
  subjectId: ID;
  mode: AttemptMode;
  outcome: Outcome;
  confidence: 0 | 1 | 2 | 3; // 0 = guessed/failed, 3 = certain
  elapsedMs: number;
  at: string;
  /** When a wrong multiple-choice pick was another concept's definition. */
  distractorConceptId?: ID;
}

export type SegmentKind =
  | 'warmup' // rapid retrieval of mastered concepts
  | 'review' // due / weak-concept flashcards
  | 'learn' // new concepts, understanding first
  | 'apply' // questions & scenario problems
  | 'explain' // feynman / blurting
  | 'reflect'; // session wrap-up

export interface SessionSegment {
  kind: SegmentKind;
  conceptIds: ID[];
  minutes: number;
  /** Runner-internal counters live in the runner state, not the domain. */
}

export interface StudySession {
  id: ID;
  subjectId?: ID;
  minutesPlanned: number;
  minutesActual?: number;
  segments: SessionSegment[];
  attempts: ID[];
  status: 'planned' | 'running' | 'done' | 'abandoned';
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface StudyPlan {
  id: ID;
  subjectId: ID;
  examDate: string;
  minutesPerDay: number;
  daysPerWeek: number;
  startDate: string;
  updatedAt: string;
}

export interface Goal {
  id: ID;
  kind: 'daily-minutes' | 'exam-ready';
  subjectId?: ID;
  target: number; // minutes, or 100 for readiness
  windowDays: number;
  createdAt: string;
}

export interface Insight {
  id: ID;
  subjectId?: ID;
  kind:
    | 'mistake-pattern'
    | 'confidence-mismatch'
    | 'mastery-gain'
    | 'neglect'
    | 'due-buildup'
    | 'ready'
    | 'improving';
  conceptIds: ID[];
  title: string;
  body: string;
  at: string;
}

export interface XPRecord {
  id: ID;
  amount: number;
  reason: string;
  at: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface SyncConfig {
  endpoint: string;
  token?: string;
}

export interface Settings {
  theme: ThemeMode;
  dailyGoalMinutes: number;
  preferredSessionMinutes: number;
  notifications: boolean;
  speech: boolean;
  ai: {
    provider: 'openai' | 'gemini' | 'none';
    apiKey: string;
    model: string;
  };
  sync?: SyncConfig;
}

export interface Profile {
  id: ID;
  name: string;
  joinedAt: string;
}

export interface DB {
  version: number;
  profile: Profile | null;
  settings: Settings;
  subjects: Subject[];
  topics: Topic[];
  concepts: Concept[];
  decks: Deck[];
  review: Record<ID, ReviewState>;
  attempts: Attempt[];
  sessions: StudySession[];
  plans: StudyPlan[];
  goals: Goal[];
  insights: Insight[];
  xp: XPRecord[];
  /** Sync bookkeeping. */
  sync: {
    lastPushedAt?: string;
    lastPulledAt?: string;
    pendingPush: number;
    tombstoned: Record<string, string>; // entityId -> deletedAt
  };
}
