/**
 * Global search — subjects, topics, concepts, decks, questions, notes.
 * Prefix + token scoring, ranked, type-tagged. Fast enough to run on every
 * keystroke for a personal library (thousands of entries).
 */

import type { DB } from '../domain/types';
import { normalize } from '../lib/util';

export type SearchKind = 'subject' | 'topic' | 'concept' | 'deck' | 'question' | 'note';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  subjectId?: string;
  title: string;
  snippet: string;
  score: number;
}

export function search(db: DB, queryRaw: string, limit = 10): SearchResult[] {
  const q = normalize(queryRaw);
  if (!q) return [];
  const qTokens = q.split(' ').filter(Boolean);
  const results: SearchResult[] = [];

  const score = (title: string, body: string): number => {
    const t = normalize(title);
    const b = normalize(body);
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (t.includes(q)) return 60;
    let s = 0;
    for (const tok of qTokens) {
      if (t.includes(tok)) s += 25;
      else if (b.includes(tok)) s += 8;
    }
    return s;
  };

  const push = (r: Omit<SearchResult, 'score'> & { score: number }) => {
    if (r.score > 0) results.push(r);
  };

  for (const s of db.subjects) {
    if (s.archivedAt) continue;
    push({
      kind: 'subject',
      id: s.id,
      title: s.name,
      snippet: s.description ?? s.goal ?? `${db.concepts.filter((c) => c.subjectId === s.id).length} concepts`,
      score: score(s.name, `${s.description ?? ''} ${s.code ?? ''}`),
    });
  }
  for (const t of db.topics) {
    push({
      kind: 'topic',
      id: t.id,
      subjectId: t.subjectId,
      title: t.name,
      snippet: t.description ?? 'Topic',
      score: score(t.name, t.description ?? ''),
    });
  }
  for (const c of db.concepts) {
    push({
      kind: 'concept',
      id: c.id,
      subjectId: c.subjectId,
      title: c.name,
      snippet: c.summary,
      score: score(c.name, `${c.summary} ${c.explanation} ${c.notes ?? ''}`),
    });
  }
  for (const d of db.decks) {
    push({
      kind: 'deck',
      id: d.id,
      subjectId: d.subjectId,
      title: d.name,
      snippet: `${d.cards.length} cards`,
      score: score(d.name, d.description ?? ''),
    });
  }
  for (const c of db.concepts) {
    for (const qq of c.questions) {
      push({
        kind: 'question',
        id: qq.id,
        subjectId: c.subjectId,
        title: qq.prompt,
        snippet: c.name,
        score: score(qq.prompt, qq.explanation ?? ''),
      });
    }
    for (const r of c.resources) {
      push({
        kind: 'note',
        id: r.id,
        subjectId: c.subjectId,
        title: r.title,
        snippet: (r.body ?? '').slice(0, 120),
        score: score(r.title, r.body ?? ''),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
