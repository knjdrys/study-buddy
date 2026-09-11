/**
 * Local, deterministic analysis for blurting and Feynman teach-backs.
 * Honest heuristics: they work on real concept content (names, key terms,
 * explanation points) and are transparent about being approximate. An
 * optional LLM pass can add qualitative feedback on top.
 */

import type { Concept } from '../domain/types';
import { normalize, tokens } from '../lib/util';

const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'into', 'which', 'when',
  'where', 'what', 'who', 'how', 'why', 'for', 'are', 'was', 'were', 'have',
  'has', 'had', 'not', 'but', 'can', 'could', 'will', 'would', 'should',
  'about', 'over', 'under', 'between', 'through', 'their', 'there', 'they',
  'these', 'those', 'than', 'then', 'them', 'each', 'other', 'some', 'such',
  'its', 'his', 'her', 'our', 'your', 'you', 'she', 'been', 'being', 'does',
  'doing', 'also', 'very', 'just', 'more', 'most', 'much', 'many', 'only',
  'like', 'make', 'made', 'makes', 'because', 'often', 'while', 'after',
  'before', 'during', 'within', 'without', 'above', 'below', 'both', 'once',
  'every', 'onto', 'into', 'near', 'called', 'known', 'means', 'using',
  'used', 'use', 'one', 'two', 'way', 'ways', 'things', 'thing', 'form',
  'forms', 'type', 'types', 'different', 'instead', 'rather', 'certain',
  'usually', 'typically', 'generally', 'becomes', 'become', 'example',
]);

export { STOPWORDS };

export function keyTerms(concept: Concept, max = 8): string[] {
  const source = `${concept.name} ${concept.summary} ${concept.explanation.split('. ')[0] ?? ''}`;
  const freq = new Map<string, number>();
  for (const t of tokens(source)) {
    if (STOPWORDS.has(t) || t.length < 4) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w);
}

/* ---------------- blurting ---------------- */

export type RecallStatus = 'remembered' | 'partial' | 'missed';

export interface ConceptRecall {
  conceptId: string;
  status: RecallStatus;
  coverage: number; // 0..1
  matchedTerms: string[];
}

export function analyzeBlurt(text: string, concepts: Concept[]): ConceptRecall[] {
  const hay = normalize(text);
  const hayTokens = new Set(tokens(text));
  return concepts.map((c) => {
    const name = normalize(c.name);
    const nameHit = hay.includes(name);
    const terms = keyTerms(c);
    const matched = terms.filter((t) => hayTokens.has(t) || hay.includes(t));
    const coverage = terms.length ? matched.length / terms.length : 0;

    let status: RecallStatus;
    if (nameHit && coverage >= 0.35) status = 'remembered';
    else if (nameHit || coverage >= 0.45) status = 'partial';
    else if (coverage >= 0.18) status = 'partial';
    else status = 'missed';

    return { conceptId: c.id, status, coverage, matchedTerms: matched };
  });
}

export function blurtScore(recalls: ConceptRecall[]): number {
  const vals = { remembered: 1, partial: 0.5, missed: 0 } as const;
  return recalls.length
    ? Math.round((recalls.reduce((s, r) => s + vals[r.status], 0) / recalls.length) * 100)
    : 0;
}

/* ---------------- Feynman ---------------- */

export interface ExplanationPoint {
  text: string;
  terms: string[];
}

export interface FeynmanFeedback {
  coverage: number; // 0..1 of key points covered
  coveredPoints: string[];
  missingPoints: string[];
  jargon: string[];
  suggestions: string[];
  verdict: string;
}

export function explanationPoints(concept: Concept): ExplanationPoint[] {
  const chunks = [concept.explanation, concept.example, concept.misconception]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .flatMap((t) =>
      t
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.split(' ').length >= 4),
    );
  const points = chunks.slice(0, 6);
  return points.map((text) => {
    const toks = tokens(text).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
    return { text, terms: [...new Set(toks)].slice(0, 6) };
  });
}

const COMMON_WORDS = new Set([
  'because', 'example', 'something', 'different', 'important', 'process',
  'through', 'another', 'together', 'between', 'however', 'therefore',
  'actually', 'usually', 'generally', 'particular', 'especially',
]);

export function analyzeFeynman(concept: Concept, text: string): FeynmanFeedback {
  const hay = normalize(text);
  const hayTokens = new Set(tokens(text));
  const points = explanationPoints(concept);

  const coveredPoints: string[] = [];
  const missingPoints: string[] = [];
  for (const p of points) {
    const hits = p.terms.filter((t) => hayTokens.has(t) || hay.includes(t)).length;
    if (hits >= Math.max(1, Math.ceil(p.terms.length * 0.4))) coveredPoints.push(p.text);
    else missingPoints.push(p.text);
  }
  const coverage = points.length ? coveredPoints.length / points.length : 0;

  // Jargon: long words the learner repeated from the material without
  // putting them in plain terms.
  const jargon = tokens(text)
    .filter((t) => t.length >= 9 && !COMMON_WORDS.has(t) && hayTokens.has(t))
    .filter((t) => tokens(concept.explanation).includes(t))
    .slice(0, 4);

  const suggestions: string[] = [];
  if (missingPoints.length)
    suggestions.push(
      `You didn't mention: ${missingPoints[0]!.toLowerCase().replace(/\.$/, '')}. Try folding that in.`,
    );
  if (jargon.length)
    suggestions.push(
      `You kept the technical words (${jargon.slice(0, 2).join(', ')}). Try saying them in everyday words.`,
    );
  if (coverage >= 0.7 && !jargon.length)
    suggestions.push('Strong pass. Try a harder audience: explain it to a curious 8-year-old.');
  if (!suggestions.length) suggestions.push('Check the official explanation and note what surprised you.');

  const verdict =
    coverage >= 0.7 && jargon.length <= 1
      ? 'You genuinely understand this — and can say it simply.'
      : coverage >= 0.45
        ? 'You have the gist, but some important pieces are missing.'
        : 'There are gaps. Read the explanation once more, then try again.';

  return { coverage, coveredPoints, missingPoints, jargon, suggestions, verdict };
}
