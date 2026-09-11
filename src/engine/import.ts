/**
 * Import engine — turns pasted text, Quizlet/Anki exports, CSV, old
 * StudyBuddy deck JSON, or a full backup into clean domain objects.
 * Pure parsers + a builder that is guaranteed to return valid concepts.
 */

import type { Concept, DB, Flashcard, Question } from '../domain/types';
import { newId, nowISO } from '../lib/util';

export interface ParsedPair {
  front: string;
  back: string;
}

const SEPARATORS = ['::', ' — ', ' – ', ' - ', '\t', ':', '=>', '→'];

export function parsePairs(text: string): ParsedPair[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pairs: ParsedPair[] = [];
  for (const line of lines) {
    const clean = line.replace(/^[\s•\-*\d.)\]]+/, '').trim();
    let found = false;
    for (const sep of SEPARATORS) {
      const idx = clean.indexOf(sep);
      if (idx > 0) {
        const front = clean.slice(0, idx).trim();
        const back = clean.slice(idx + sep.length).trim();
        if (front && back) pairs.push({ front, back });
        found = true;
        break;
      }
    }
    if (!found && clean) {
      // Single word/line — treat as a bare term needing a definition.
      pairs.push({ front: clean, back: '' });
    }
  }
  return pairs;
}

/** Parse a CSV export (Quizlet: term,definition[,hint]; Anki: front,back[,tags]). */
export function parseCSV(text: string): ParsedPair[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = rows[0]?.toLowerCase() ?? '';
  const body = /term|front|question/.test(header) ? rows.slice(1) : rows;
  const pairs: ParsedPair[] = [];
  for (const row of body) {
    const cells = splitCSVRow(row);
    if (cells.length >= 2 && cells[0] && cells[1]) {
      pairs.push({ front: cells[0]!, back: cells[1]!, ...(cells[2] ? {} : {}) });
    }
  }
  return pairs;
}

function splitCSVRow(row: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export interface ImportedBundle {
  concepts: Concept[];
  subjectName: string;
  skipped: number;
}

/** Build concepts from term/definition pairs, one flashcard each. */
export function buildConceptsFromPairs(
  subjectId: string,
  pairs: ParsedPair[],
  opts: { topicId?: string; origin?: Concept['origin'] } = {},
): ImportedBundle {
  const now = nowISO();
  const concepts: Concept[] = [];
  let skipped = 0;
  for (const p of pairs) {
    const back = p.back.trim();
    if (!p.front.trim()) {
      skipped++;
      continue;
    }
    const card: Flashcard = {
      id: newId('fc'),
      front: p.front.trim(),
      back: back || '—',
    };
    concepts.push({
      id: newId('con'),
      subjectId,
      topicId: opts.topicId,
      name: p.front.trim(),
      summary: back || `A concept called ${p.front.trim()}.`,
      explanation: back || '',
      relatedIds: [],
      resources: [],
      flashcards: [card],
      questions: [],
      difficulty: 1,
      origin: opts.origin ?? 'user',
      createdAt: now,
      updatedAt: now,
    });
  }
  return { concepts, subjectName: '', skipped };
}

/** Detect whether raw text is CSV (commas + consistent columns). */
export function looksLikeCSV(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  return lines.slice(0, 3).every((l) => (l.match(/,/g) ?? []).length >= 1);
}

export function looksLikeJSON(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[');
}

/** Old StudyBuddy deck format: {"s": subject, "t": [[term, def], ...]} */
export function parseLegacyDeckJSON(text: string): { subject: string; pairs: ParsedPair[] } | null {
  try {
    const obj = JSON.parse(text) as { s?: string; subject?: string; t?: unknown[]; terms?: unknown[] };
    const subject = obj.s ?? obj.subject ?? '';
    const raw = (obj.t ?? obj.terms ?? []) as unknown[];
    const pairs: ParsedPair[] = [];
    for (const item of raw) {
      if (Array.isArray(item) && item.length >= 2) {
        pairs.push({ front: String(item[0]), back: String(item[1]) });
      } else if (item && typeof item === 'object') {
        const o = item as { term?: string; def?: string; front?: string; back?: string };
        const f = o.term ?? o.front ?? '';
        const b = o.def ?? o.back ?? '';
        if (f && b) pairs.push({ front: f, back: b });
      }
    }
    if (!pairs.length) return null;
    return { subject, pairs };
  } catch {
    return null;
  }
}

/** Full backup format (exported by Settings). */
export function isBackupJSON(text: string): boolean {
  try {
    const obj = JSON.parse(text) as { version?: number; subjects?: unknown; concepts?: unknown };
    return typeof obj?.version === 'number' && Array.isArray(obj.subjects);
  } catch {
    return false;
  }
}

/** Validate a backup document before merging. Throws on invalid input. */
export function validateBackup(raw: string): DB {
  const obj = JSON.parse(raw) as Partial<DB>;
  if (typeof obj?.version !== 'number') throw new Error('Not a StudyBuddy backup file');
  if (!Array.isArray(obj.subjects)) throw new Error('Backup is missing subjects');
  for (const key of ['topics', 'concepts', 'decks', 'attempts', 'sessions', 'plans', 'insights', 'xp'] as const) {
    if (obj[key] !== undefined && !Array.isArray(obj[key])) throw new Error(`Backup field "${key}" is invalid`);
  }
  return obj as DB;
}

export function makeTypedQuestion(
  concept: Concept,
  answer: string,
): Question {
  return {
    id: newId('q'),
    kind: 'typed',
    prompt: `What is ${concept.name}?`,
    answer,
    explanation: concept.summary,
  };
}
