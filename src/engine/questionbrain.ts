/**
 * The Smart Question Engine — StudyBuddy's "learning brain".
 *
 * Before a question exists, the engine *understands* the content:
 *   - what kind of thing each concept is (its category: "a hardware address",
 *     "a device", "a process"),
 *   - what it does (its function: "identify a device across networks"),
 *   - how it relates to its neighbors (shared vocabulary, shared category,
 *     same topic), and what the learner has actually done with it.
 *
 * From that it builds questions that test knowledge, not recognition:
 *   - Multiple-choice distractors are OTHER CONCEPTS' DEFINITIONS rendered
 *     as parallel "A …" statements — never a bare list of term names.
 *     If meaningful definition-based distractors cannot be built, the
 *     engine refuses to make the question and uses another mode instead.
 *   - Four cognitive levels: remember → distinguish → apply → judge.
 *   - Seven modes: multiple choice, identification, true/false, fill-in,
 *     matching, short answer, scenario.
 *
 * The adaptive planner reads every past attempt: concepts answered wrong
 * get more questions, varied wording, and comparisons against the concepts
 * they are confused with; concepts answered right move up in level and
 * down in repetition.
 */

import type { Concept, DB, Attempt, ID } from '../domain/types';
import { newId, normalize, tokens, shuffle } from '../lib/util';
import { STOPWORDS } from './analysis';

/* ====================================================================
 * 1. UNDERSTANDING — semantic profiles
 * ==================================================================== */

export interface ConceptProfile {
  id: ID;
  name: string;
  /** The canonical one-sentence definition (term stripped out). */
  definition: string;
  /** "a unique hardware address" — what KIND of thing it is. */
  category: string;
  /** "identify a device across networks" — what it DOES. */
  functionPhrase: string;
  /** Longer-form statements from the explanation (for cloze & TF). */
  facts: string[];
  example?: string;
  misconception?: string;
  keywords: string[];
  subjectId: ID;
  topicId?: ID;
  difficulty: Concept['difficulty'];
}

const SMALL_VERBS = new Set(['is', 'are', 'was', 'were', 'refers', 'describes',
  'allows', 'helps', 'uses', 'moves', 'creates', 'makes', 'gives', 'takes',
  'holds', 'means', 'works', 'acts', 'stores', 'sends', 'carries', 'keeps',
  'leads', 'sets', 'cuts', 'has', 'does', 'causes', 'produces', 'prevents',
  'represents', 'shows', 'measures', 'converts', 'divides', 'joins', 'builds',
  'convert', 'provide', 'provides', 'perform', 'performs', 'find', 'finds',
  'return', 'returns', 'organize', 'organizes', 'arrange', 'arranges',
  'contain', 'contains', 'combine', 'combines', 'reduce', 'reduces',
  'increase', 'increases', 'decrease', 'decreases', 'execute', 'executes',
  'search', 'searches', 'sort', 'sorts', 'transfer', 'transfers', 'translate',
  'translates', 'interpret', 'interprets', 'protect', 'protects', 'absorb',
  'absorbs', 'release', 'releases', 'bind', 'binds', 'regulate', 'regulates',
  'determine', 'determines', 'define', 'defines', 'specify', 'specifies',
  'identify', 'identifies', 'forward', 'forwards', 'route', 'routes',
  'maintain', 'maintains', 'require', 'requires', 'offer', 'offers',
  'change', 'changes', 'control', 'controls', 'balance', 'balances',
  'rise', 'rises', 'fall', 'falls', 'grow', 'grows', 'shrink', 'shrinks',
  'collect', 'collects', 'process', 'processes', 'convert', 'converts',
  'choose', 'chooses', 'select', 'selects', 'assign', 'assigns', 'attach',
  'attaches', 'label', 'labels', 'count', 'counts', 'track', 'tracks']);

/**
 * "A unique hardware address assigned to a network interface" → category + function.
 * Handles "is a … that …", "used to …", labels like "Complexity: …", and bare noun phrases.
 */
function splitCategory(text: string): { category: string; func: string } {
  const t = text.trim().replace(/^[a-z]/, (c) => c.toUpperCase());
  const bare = t.replace(/^(A|An|The)\s+/i, '');
  const words = bare.split(' ');

  // labels: "Complexity: O(log n)", "A collision: two keys …"
  const colon = bare.indexOf(':');
  if (colon > 0 && colon < bare.length - 1) {
    const left = bare.slice(0, colon).trim().split(' ');
    const right = bare.slice(colon + 1).trim();
    if (right.split(' ').length >= 2 && left.length <= 4) {
      return { category: left.join(' '), func: right.replace(/^[a-z]/, (c) => c.toUpperCase()) };
    }
  }

  // "used to …" marks the cleanest function clause
  const usedTo = words.findIndex((w, i) => w === 'used' && words[i + 1] === 'to');
  if (usedTo > 0 && usedTo < words.length - 2) {
    return { category: words.slice(0, usedTo).join(' '), func: words.slice(usedTo + 2).join(' ') };
  }
  // "that"/"which" clause
  const marker = words.findIndex((w) => w === 'that' || w === 'which');
  if (marker > 0 && marker < words.length - 1) {
    return { category: words.slice(0, marker).join(' '), func: words.slice(marker + 1).join(' ') };
  }
  // strong verb forms first (assigned, used, divided…) — "addresses" is a
  // plural noun, so a bare -s ending alone is not enough
  for (const tail of ['ed', 'ing']) {
    const cut = words.findIndex((w) => w.length > 4 && w.toLowerCase().endsWith(tail));
    if (cut > 0) return { category: words.slice(0, cut).join(' '), func: words.slice(cut).join(' ') };
  }
  // then known verbs (moves, rises, stores…)
  let cut = -1;
  for (let i = 1; i < words.length; i++) {
    if (SMALL_VERBS.has(words[i]!)) { cut = i; break; }
  }
  if (cut > 0) return { category: words.slice(0, cut).join(' '), func: words.slice(cut).join(' ') };
  // no verb found: keep at most the first four words as the category
  const head = words.slice(0, 4);
  return { category: head.join(' '), func: words.length > 4 ? words.slice(4).join(' ') : '' };
  const category = words.slice(0, cut).join(' ');
  const func = words.slice(cut).join(' ');
  // keep the category noun-phrase short
  if (category.split(' ').length > 5) {
    const head = category.split(' ').slice(0, 4).join(' ');
    return { category: head, func: [category.split(' ').slice(4).join(' '), func].filter(Boolean).join(' ') };
  }
  return { category, func };
}

function cleanDefinition(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
}

/** Remove the term's own name and any leading label from a definition. */
export function stripTerm(text: string, name: string): string {
  const n = normalize(name);
  let out = cleanDefinition(text);
  const patterns = [
    new RegExp(`^${name}s?\\s+(is|are|was|were)\\s+`, 'i'),
    new RegExp(`^${name}s?\\s*:\\s*`, 'i'),
    new RegExp(`^(a|an|the)\\s+${name}s?\\s+(is|are)\\s+`, 'i'),
    new RegExp(`^${name}s?\\s+(refers? to|describes|means)\\s+`, 'i'),
    // labels like "Complexity:", "Time:", "Key idea:" — drop them
    /^(complexity|time|runtime|space|key idea|note|idea)\s*:\s*/i,
  ];
  for (const p of patterns) out = out.replace(p, '');
  if (normalize(out) === n) return out;
  return out;
}

function keyTermsOf(profile: { name: string; definition: string; facts: string[] }): string[] {
  const source = `${profile.name} ${profile.definition} ${profile.facts.slice(0, 2).join(' ')}`;
  const freq = new Map<string, number>();
  const nameTokens = new Set(tokens(profile.name).filter((w) => w.length >= 4));
  for (const t of tokens(source)) {
    if (STOPWORDS.has(t) || t.length < 4 || nameTokens.has(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 12)
    .map(([w]) => w);
}

/** A definition-shaped statement, not an answer fragment like "O(log n)" or "To produce…". */
function looksLikeDefinition(s: string): boolean {
  return (
    /^(a|an|the)\s/i.test(s)
    || /\b(is|are|refers to|describes|means|used to)\b/i.test(s)
    || /\b(that|which)\b/i.test(s)
  );
}

export function understand(concept: Concept): ConceptProfile {
  // A definition must be a real statement — short card backs ("O(log n)")
  // and verb-led answer fragments ("To produce most of the cell's ATP")
  // are details, not definitions, so prefer the summary.
  const cardBack = concept.flashcards[0]?.back?.trim() ?? '';
  const candidates = [
    cardBack.split(' ').length >= 4 && looksLikeDefinition(cardBack) ? cardBack : '',
    concept.summary.trim(),
    concept.explanation.split(/[.!?]\s+/)[0]?.trim() ?? '',
    cardBack,
  ].filter(Boolean);
  const rawDef = candidates[0] ?? concept.name;
  const definition = cleanDefinition(stripTerm(rawDef, concept.name)) || rawDef;
  const { category, func } = splitCategory(definition);
  const facts = concept.explanation
    .split(/(?<=[.!?])\s+/)
    .map((s) => cleanDefinition(s))
    .filter((s) => s.split(' ').length >= 4)
    .slice(0, 5);
  const profile: ConceptProfile = {
    id: concept.id,
    name: concept.name,
    definition,
    category: category || 'concept',
    functionPhrase: func,
    facts,
    example: concept.example?.trim() || undefined,
    misconception: concept.misconception?.trim() || undefined,
    keywords: [],
    subjectId: concept.subjectId,
    topicId: concept.topicId,
    difficulty: concept.difficulty,
  };
  profile.keywords = keyTermsOf(profile);
  return profile;
}

/** The head noun of a category: "unique hardware address" → "address". */
function headNoun(category: string): string {
  const words = normalize(category).split(' ').filter((w) => w.length > 2 && w !== 'type' && w !== 'kind' && w !== 'form');
  return words[words.length - 1] ?? '';
}

/** Content similarity between two concepts, 0..1. */
export function similarity(a: ConceptProfile, b: ConceptProfile): number {
  const ka = new Set(a.keywords);
  const kb = new Set(b.keywords);
  if (!ka.size || !kb.size) return 0;
  let shared = 0;
  for (const k of kb) if (ka.has(k)) shared++;
  let score = shared / Math.sqrt(ka.size * kb.size);
  if (a.topicId && a.topicId === b.topicId) score += 0.16;
  if (normalize(a.category) === normalize(b.category)) score += 0.35;
  // same kind of thing ("… address" vs "… address") is the classic confusable
  const ha = headNoun(a.category);
  const hb = headNoun(b.category);
  if (ha && ha === hb && normalize(a.category) !== normalize(b.category)) score += 0.35;
  return Math.min(1, score);
}

/* ====================================================================
 * 2. DISTRACTORS — definitions, never a list of names
 * ==================================================================== */



function uncapitalize(s: string): string {
  return s.replace(/^[A-Z]/, (c) => c.toLowerCase());
}

const PLURAL_HEAD = /[a-z]s$/i;
const SINGULAR_EXCEPTIONS = /(ss|us|is|sis)$/i;

/** Render a profile as an "A …" option (the correct-answer shape). */
export function asDefinition(p: ConceptProfile): string {
  const cat = p.category.replace(/^(a|an|the)\s+/i, '').replace(/^[a-z]/, (c) => c.toUpperCase());
  // article agreement: "A cellular machine…" but "Cellular machines…"
  const head = cat.split(' ')[0] ?? '';
  const plural = PLURAL_HEAD.test(head) && !SINGULAR_EXCEPTIONS.test(head);
  let out = plural ? cat : `A ${cat}`;
  const f = p.functionPhrase.trim();
  if (f) {
    const first = (f.split(' ')[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const lower = f.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.+$/, '');
    if (first === 'to' || first === 'that' || first === 'which' || first === 'used') {
      out += ` ${lower}`;
    } else if (first.endsWith('ed') || first.endsWith('ing') || SMALL_VERBS.has(first)) {
      out += ` ${lower}`; // "assigned to …", "divides …"
    } else {
      out += ` that ${lower}`; // noun-led remainder: "that address …"
    }
  }
  out = out.replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
  // malformed shapes like "A To convert …" mean extraction failed — repair
  if (/^A (to|the|of|for|with)\b/i.test(out) && p.definition.length >= out.length - 2) {
    return p.definition.replace(/^[a-z]/, (c) => c.toUpperCase());
  }
  return out;
}

/** A concept's definition rendered as a parallel "A …" statement. */
export function asOption(p: ConceptProfile): string {
  const own = asDefinition(p);
  if (own.split(' ').length >= 3) return own;
  return p.definition.replace(/^[a-z]/, (c) => c.toUpperCase());
}

function optionTextSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a).filter((t) => t.length >= 4));
  const tb = new Set(tokens(b).filter((t) => t.length >= 4));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of tb) if (ta.has(t)) shared++;
  return shared / Math.sqrt(ta.size * tb.size);
}

export interface Distractor {
  conceptId: ID;
  text: string;
}

/**
 * Build meaningfully-wrong options for a concept: parallel definition
 * statements taken from *similar* concepts. If too few exist, the result
 * is short — callers must then switch question mode rather than fall back
 * to bare term names.
 */
export function distractorDefinitions(
  target: ConceptProfile,
  pool: ConceptProfile[],
  n = 3,
  preferredIds: ID[] = [],
): Distractor[] {
  const candidates = pool
    .filter((p) => p.id !== target.id)
    .map((p) => ({ p, sim: similarity(target, p) }))
    .sort((a, b) => {
      const pa = preferredIds.indexOf(a.p.id);
      const pb = preferredIds.indexOf(b.p.id);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 1 : 0) - (pb === -1 ? 1 : 0);
      return b.sim - a.sim;
    });

  const out: Distractor[] = [];
  const seen = new Set<string>();
  for (const { p } of candidates) {
    if (out.length >= n) break;
    const text = asOption(p);
    const key = normalize(text).slice(0, 60);
    if (seen.has(key)) continue;
    if (optionTextSimilarity(text, asOption(target)) > 0.75) continue; // too close to the answer
    seen.add(key);
    out.push({ conceptId: p.id, text });
  }
  return out;
}

/** Names of similar concepts — used only for reverse/cloze term options. */
export function similarTerms(
  target: ConceptProfile,
  pool: ConceptProfile[],
  n = 3,
  preferredIds: ID[] = [],
): { conceptId: ID; term: string }[] {
  return pool
    .filter((p) => p.id !== target.id)
    .map((p) => ({ p, sim: similarity(target, p) }))
    .sort((a, b) => {
      const pa = preferredIds.indexOf(a.p.id);
      const pb = preferredIds.indexOf(b.p.id);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 1 : 0) - (pb === -1 ? 1 : 0);
      return b.sim - a.sim;
    })
    .slice(0, n)
    .map((x) => ({ conceptId: x.p.id, term: x.p.name }));
}

/* ====================================================================
 * 3. QUESTIONS BY LEVEL — remember → distinguish → apply → judge
 * ==================================================================== */

export type BrainKind = 'mc' | 'identify' | 'tf' | 'fill' | 'match' | 'short' | 'scenario';
export type QLevel = 1 | 2 | 3 | 4;
export type QuestionMode = 'auto' | 'mc' | 'identify' | 'tf' | 'fill' | 'match' | 'short' | 'scenario';

export const MODE_LABELS: Record<QuestionMode, string> = {
  auto: 'Adaptive',
  mc: 'Multiple choice',
  identify: 'Identification',
  tf: 'True or false',
  fill: 'Fill the blank',
  match: 'Matching',
  short: 'Short answer',
  scenario: 'Scenario',
};

export const MODE_HINTS: Record<QuestionMode, string> = {
  auto: 'Difficulty and question type adapt to how you answer',
  mc: 'Meaningful definition-based choices — no word-matching',
  identify: 'You see the definition; you name the concept',
  tf: 'Statements that need understanding, not guesses',
  fill: 'Complete real sentences from your material',
  match: 'Pair terms with their true definitions',
  short: 'Explain in your own words, then compare',
  scenario: 'Apply concepts inside realistic situations',
};

export interface MatchPair {
  conceptId: ID;
  term: string;
  definition: string;
}

export interface BrainQuestion {
  id: ID;
  conceptId: ID;
  kind: BrainKind;
  level: QLevel;
  prompt: string;
  options?: string[];
  /** mc: correct option text; tf: 'True'|'False'; identify: the term; short: model text */
  answer: string;
  explanation?: string;
  /** concepts whose content served as the wrong options (confusion tracking) */
  distractorConceptIds: ID[];
  /** fill: the sentence with the blank; identify: the clue shown */
  clue?: string;
  /** match only */
  pairs?: MatchPair[];
  /** short: expected content terms for the coverage meter */
  expectedTerms?: string[];
}

function shuffled<T>(arr: T[]): T[] {
  return shuffle([...arr]);
}

/* ---------- level 1 · remember: "What is X?" with definition choices ---------- */

export function qDefinition(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  const correct = asOption(target);
  const dist = distractorDefinitions(target, pool, 3, preferredConfusions);
  const options = shuffled([correct, ...dist.map((d) => d.text)]);
  return {
    id: newId('q'),
    conceptId: target.id,
    kind: 'mc',
    level: 1,
    prompt: `What is ${target.name}?`,
    options,
    answer: correct,
    explanation: `${target.name} — ${target.definition}`,
    distractorConceptIds: dist.map((d) => d.conceptId),
  };
}

/* ---------- level 2 · distinguish: statements, swapped features, traps ---------- */

export function qDistinguish(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  const confusable = distractorDefinitions(target, pool, 3, preferredConfusions)[0];
  const correct = asOption(target);
  const wrong: string[] = [];
  for (const d of distractorDefinitions(target, pool, 4, preferredConfusions)) wrong.push(d.text);
  // trap: the misconception, stated as a plausible option
  if (target.misconception && wrong.length < 3) {
    wrong.push(target.misconception.replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/\.+$/, ''));
  }
  const dist = distractorDefinitions(target, pool, 4, preferredConfusions);
  const options = shuffled([correct, ...wrong.slice(0, 3)]);
  const stems = [
    `Which of the following best defines ${target.name}?`,
    `Which statement accurately describes ${target.name}?`,
    `Which of these is true of ${target.name}?`,
  ];
  return {
    id: newId('q'),
    conceptId: target.id,
    kind: 'mc',
    level: 2,
    prompt: stems[Math.floor(Math.random() * stems.length)]!,
    options,
    answer: correct,
    explanation: confusable
      ? `The right answer is the definition of ${target.name}. “${confusable.text}” describes ${pool.find((p) => p.id === confusable.conceptId)?.name ?? 'a related concept'} — a common mix-up.`
      : `${target.name} — ${target.definition}`,
    distractorConceptIds: dist.map((d) => d.conceptId),
  };
}

/* ---------- level 2 · true/false from features & misconceptions ---------- */

export function qTrueFalse(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  const confusable = distractorDefinitions(target, pool, 1, preferredConfusions)[0];
  const confusableName = pool.find((p) => p.id === confusable?.conceptId)?.name;
  const variants: { statement: string; isTrue: boolean; why: string }[] = [];

  // true: the real definition stated plainly (never "X is a term")
  if (target.definition.split(' ').length >= 6) {
    variants.push({
      statement: `${target.name} ${target.definition.replace(/^[A-Z]/, (c) => c.toLowerCase())}`,
      isTrue: true,
      why: `That is exactly what ${target.name} is: ${target.definition}`,
    });
  }
  // false: this concept wearing a similar concept's definition
  if (confusable && confusableName) {
    variants.push({
      statement: `${target.name} ${confusable.text.replace(/^[A-Z]/, (c) => c.toLowerCase())}`,
      isTrue: false,
      why: `That describes ${confusableName}, not ${target.name}. ${target.name} is ${target.definition.replace(/^[A-Z]/, (c) => c.toLowerCase())}`,
    });
  }
  // false: the misconception, stated as fact
  if (target.misconception) {
    variants.push({
      statement: `${target.name} ${target.misconception.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.+$/, '')}`,
      isTrue: false,
      why: `A common belief, but no: ${target.definition}`,
    });
  }
  if (!variants.length) return qIdentify(target, pool, preferredConfusions);
  const v = variants[Math.floor(Math.random() * variants.length)]!;
  return {
    id: newId('q'),
    conceptId: target.id,
    kind: 'tf',
    level: 2,
    prompt: `True or false? ${v.statement}.`,
    options: ['True', 'False'],
    answer: v.isTrue ? 'True' : 'False',
    explanation: v.why,
    distractorConceptIds: !v.isTrue && confusable ? [confusable.conceptId] : [],
  };
}

/* ---------- level 2 · identification: definition → term ---------- */

export function qIdentify(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  return {
    id: newId('q'),
    conceptId: target.id,
    kind: 'identify',
    level: 2,
    prompt: `Which concept does this describe?`,
    clue: target.definition.replace(/^[A-Z]/, (c) => c.toLowerCase()),
    options: [target.name, ...similarTerms(target, pool, 3, preferredConfusions).map((t) => t.term)],
    answer: target.name,
    explanation: `“${target.definition}” is ${target.name}.`,
    distractorConceptIds: similarTerms(target, pool, 3, preferredConfusions).map((t) => t.conceptId),
  };
}

/* ---------- level 2 · fill-in: real sentences, the term blanked ---------- */

export function qFillBlank(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  const nameTokens = tokens(target.name);
  const first = nameTokens[0]?.length ? nameTokens.join(' ') : '';
  const candidates = [target.definition, ...target.facts];
  let sentence = '';
  let blank = target.name;
  for (const s of candidates) {
    const i = normalize(s).indexOf(normalize(first));
    if (i !== -1 && s.split(' ').length >= 5) { sentence = s; break; }
  }
  if (!sentence && candidates[0]) {
    // blank the category phrase instead — still a real definitional cloze
    sentence = candidates[0]!;
    blank = target.category;
  }
  if (!sentence) return qIdentify(target, pool, preferredConfusions);
  const clue = sentence.replace(new RegExp(escapeRegex(first || blank), 'i'), '______');
  const terms = [target.name, ...similarTerms(target, pool, 3, preferredConfusions).map((t) => t.term)];
  return {
    id: newId('q'),
    conceptId: target.id,
    kind: 'fill',
    level: 2,
    prompt: 'Complete the sentence with the right term.',
    clue,
    options: shuffled(terms),
    answer: target.name,
    explanation: `${sentence} — that is ${target.name}.`,
    distractorConceptIds: similarTerms(target, pool, 3, preferredConfusions).map((t) => t.conceptId),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- level 3 · apply: examples & context ---------- */

export function qApply(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  const correct = asOption(target);
  const dist = distractorDefinitions(target, pool, 3, preferredConfusions);
  if (target.example && dist.length >= 2) {
    return {
      id: newId('q'),
      conceptId: target.id,
      kind: 'scenario',
      level: 3,
      prompt: `Consider this: “${target.example}”\n\nWhich concept is being applied?`,
      options: shuffled([correct, ...dist.map((d) => d.text)]),
      answer: correct,
      explanation: `The situation shows ${target.name} at work: ${target.definition}`,
      distractorConceptIds: dist.map((d) => d.conceptId),
    };
  }
  if (target.functionPhrase && dist.length >= 2) {
    return {
      id: newId('q'),
      conceptId: target.id,
      kind: 'mc',
      level: 3,
      prompt: `You need to ${uncapitalize(target.functionPhrase)}. Which of the following do you use?`,
      options: shuffled([correct, ...dist.map((d) => d.text)]),
      answer: correct,
      explanation: `${target.name}: ${target.definition}`,
      distractorConceptIds: dist.map((d) => d.conceptId),
    };
  }
  return qDistinguish(target, pool, preferredConfusions);
}

/* ---------- level 4 · judge: situations call for one concept, not another ---------- */

export function qJudge(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  const confusable = distractorDefinitions(target, pool, 1, preferredConfusions)[0];
  if (!target.functionPhrase || !confusable) return qApply(target, pool, preferredConfusions);
  const confusableProfile = pool.find((p) => p.id === confusable.conceptId);
  const confusableName = confusableProfile?.name ?? 'the other option';
  const others = distractorDefinitions(target, pool, 3, preferredConfusions).slice(1);
  const correctScenario = `You need to ${uncapitalize(target.functionPhrase)} — this is exactly what ${target.name} does`;
  const wrong: { text: string; conceptId: ID }[] = [];
  if (confusableProfile?.functionPhrase) {
    wrong.push({
      text: `You need to ${uncapitalize(confusableProfile.functionPhrase)} — that is ${confusableName}'s job`,
      conceptId: confusableProfile.id,
    });
  }
  for (const o of others) {
    const op = pool.find((p) => p.id === o.conceptId);
    if (op?.functionPhrase && wrong.length < 3) {
      wrong.push({ text: `You need to ${uncapitalize(op.functionPhrase)} — that is ${op.name}'s job`, conceptId: op.id });
    }
  }
  if (!wrong.length) return qApply(target, pool, preferredConfusions);
  return {
    id: newId('q'),
    conceptId: target.id,
    kind: 'scenario',
    level: 4,
    prompt: `Which situation calls for ${target.name}?`,
    options: shuffled([correctScenario, ...wrong.map((w) => w.text)]),
    answer: correctScenario,
    explanation: `${target.name} is what you use to ${uncapitalize(target.functionPhrase)}.`,
    distractorConceptIds: wrong.map((w) => w.conceptId),
  };
}

/* ---------- short answer: explain & compare, checked against content ---------- */

export function qShort(target: ConceptProfile, pool: ConceptProfile[], preferredConfusions: ID[] = []): BrainQuestion {
  const confusable = distractorDefinitions(target, pool, 1, preferredConfusions)[0];
  const confusableName = pool.find((p) => p.id === confusable?.conceptId)?.name;
  return {
    id: newId('q'),
    conceptId: target.id,
    kind: 'short',
    level: confusable ? 3 : 2,
    prompt: confusable
      ? `In your own words: what is ${target.name}, and how is it different from ${confusableName}?`
      : `In your own words: what is ${target.name}?`,
    answer: `${target.name} — ${target.definition}${confusable && confusableName ? `\n\nvs ${confusableName}: ${pool.find((p) => p.id === confusable.conceptId)?.definition ?? ''}` : ''}`,
    explanation: 'The coverage meter compares your answer to the concept\u2019s actual explanation — look for the gaps.',
    distractorConceptIds: confusable ? [confusable.conceptId] : [],
    expectedTerms: [...target.keywords.slice(0, 8), ...(confusable ? pool.find((p) => p.id === confusable.conceptId)?.keywords.slice(0, 4) ?? [] : [])],
  };
}

/* ---------- matching: terms ↔ true definitions ---------- */

export function qMatching(group: ConceptProfile[]): BrainQuestion | null {
  const usable = group.filter((p) => p.definition.split(' ').length >= 3);
  if (usable.length < 3) return null;
  return {
    id: newId('q'),
    conceptId: usable[0]!.id,
    kind: 'match',
    level: 2,
    prompt: 'Match each term to its definition.',
    answer: '',
    pairs: shuffled(usable.map((p) => ({
      conceptId: p.id,
      term: p.name,
      definition: asOption(p),
    }))),
    distractorConceptIds: usable.slice(1).map((p) => p.id),
    explanation: 'Definitions are drawn from your own material — read them, then decide.',
  };
}

/* ====================================================================
 * 4. ADAPTIVE — levels and planning from real answer history
 * ==================================================================== */

const outcomeScore = (o: Attempt['outcome']): number => (o === 'correct' ? 1 : o === 'partial' ? 0.5 : 0);

export function attemptsFor(db: DB, conceptId: ID): Attempt[] {
  return db.attempts
    .filter((a) => a.conceptId === conceptId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Concepts the learner has confused this concept with (from wrong picks). */
export function confusions(db: DB, conceptId: ID): { conceptId: ID; count: number }[] {
  const counts = new Map<ID, number>();
  for (const a of db.attempts) {
    if (a.conceptId !== conceptId || a.outcome === 'correct' || !a.distractorConceptId) continue;
    counts.set(a.distractorConceptId, (counts.get(a.distractorConceptId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([conceptId, count]) => ({ conceptId, count }))
    .sort((a, b) => b.count - a.count);
}

/** The cognitive level this concept should be tested at right now. */
export function levelFor(db: DB, conceptId: ID): QLevel {
  const ats = attemptsFor(db, conceptId).slice(0, 8);
  if (!ats.length) return 1;
  const recent = ats.slice(0, 5);
  const acc = recent.reduce((s, a) => s + outcomeScore(a.outcome), 0) / recent.length;
  const misses = recent.filter((a) => a.outcome === 'incorrect').length;
  const fast = recent.filter((a) => a.outcome === 'correct' && a.elapsedMs < 9000).length;

  if (misses >= 2 || (recent[0] && recent[0].outcome === 'incorrect')) return 1;
  if (acc < 0.6) return 2;
  if (acc >= 0.85 && ats.length >= 4 && fast >= 3) return 4;
  if (acc >= 0.85) return 3;
  return 2;
}

interface Weakness {
  profile: ConceptProfile;
  acc: number;
  misses: number;
  attempts: number;
  confusions: { conceptId: ID; count: number }[];
  due: boolean;
}

function weakness(db: DB, profile: ConceptProfile): Weakness {
  const ats = attemptsFor(db, profile.id).slice(0, 8);
  const recent = ats.slice(0, 5);
  const acc = recent.length
    ? recent.reduce((s, a) => s + outcomeScore(a.outcome), 0) / recent.length
    : 0.5;
  const misses = recent.filter((a) => a.outcome === 'incorrect').length;
  const r = db.review[profile.id];
  const due = !r || new Date(r.dueAt).getTime() <= Date.now();
  return {
    profile,
    acc,
    misses,
    attempts: ats.length,
    confusions: confusions(db, profile.id),
    due,
  };
}

export interface PlanOptions {
  subjectId?: ID;
  conceptIds?: ID[];
  count: number;
  mode: QuestionMode;
}

/**
 * Build an adaptive question paper. Weak concepts get more questions and
 * comparisons against their confusions; strong concepts move up a level.
 */
export function planQuestions(db: DB, opts: PlanOptions): BrainQuestion[] {
  let concepts = db.concepts.filter((c) => c.subjectId === opts.subjectId || !opts.subjectId);
  if (opts.conceptIds?.length) {
    const ids = new Set(opts.conceptIds);
    concepts = concepts.filter((c) => ids.has(c.id));
  }
  if (!concepts.length) return [];
  // drop concepts whose subject is explicitly archived; keep the rest
  const subjectById = new Map(db.subjects.map((s) => [s.id, s]));
  concepts = concepts.filter((c) => {
    const s = subjectById.get(c.subjectId);
    return !s || !s.archivedAt;
  });
  if (!concepts.length) return [];

  const profiles = new Map(concepts.map((c) => [c.id, understand(c)]));
  const ranked = concepts
    .map((c) => weakness(db, profiles.get(c.id)!))
    .sort((a, b) => {
      const wa = (1 - a.acc) * (0.6 + Math.min(a.attempts, 6) / 12) + a.misses * 0.25 + (a.due ? 0.15 : 0);
      const wb = (1 - b.acc) * (0.6 + Math.min(b.attempts, 6) / 12) + b.misses * 0.25 + (b.due ? 0.15 : 0);
      return wb - wa;
    });

  const questions: BrainQuestion[] = [];
  const usedPool = [...profiles.values()];

  const kindsFor = (mode: QuestionMode, level: QLevel): BrainKind[] => {
    switch (mode) {
      case 'mc': return [level >= 4 ? 'scenario' : 'mc'];
      case 'identify': return ['identify'];
      case 'tf': return ['tf'];
      case 'fill': return ['fill'];
      case 'short': return ['short'];
      case 'scenario': return ['scenario', 'mc'];
      case 'match': return [];
      case 'auto':
      default: {
        if (level === 1) return ['mc', 'identify'];
        if (level === 2) return ['mc', 'identify', 'tf', 'fill'];
        if (level === 3) return ['mc', 'tf', 'scenario', 'short'];
        return ['scenario', 'mc', 'short'];
      }
    }
  };

  const makeFor = (w: Weakness, level: QLevel, kind: BrainKind): BrainQuestion => {
    const p = w.profile;
    const preferred = w.confusions.map((x) => x.conceptId);
    switch (kind) {
      case 'mc': return level <= 1 ? qDefinition(p, usedPool, preferred) : qDistinguish(p, usedPool, preferred);
      case 'identify': return qIdentify(p, usedPool, preferred);
      case 'tf': return qTrueFalse(p, usedPool, preferred);
      case 'fill': return qFillBlank(p, usedPool, preferred);
      case 'short': return qShort(p, usedPool, preferred);
      case 'scenario': return level >= 4 ? qJudge(p, usedPool, preferred) : qApply(p, usedPool, preferred);
      case 'match': return qDefinition(p, usedPool, preferred);
    }
  };

  if (opts.mode === 'match') {
    const groups: ConceptProfile[][] = [];
    let group: ConceptProfile[] = [];
    for (const w of ranked) {
      group.push(w.profile);
      if (group.length === 5) { groups.push(group); group = []; }
    }
    if (group.length) {
      if (groups.length) groups[groups.length - 1]!.push(...group);
      else groups.push(group);
    }
    for (const g of groups) {
      const q = qMatching(g);
      if (q) questions.push(q);
    }
    return questions.slice(0, Math.max(1, Math.ceil(opts.count / 5)));
  }

  // decide how many questions each concept gets (adaptive repetition)
  const allocations = new Map<ID, number>();
  let budget = opts.count;
  // struggling concepts FIRST — they are the reason for practice — then new ones
  const weak = ranked.filter((w) => w.attempts > 0 && (w.acc < 0.6 || w.misses >= 1));
  const needy = ranked.filter((w) => w.attempts === 0);
  const solid = ranked.filter((w) => w.attempts > 0 && w.acc >= 0.6 && w.misses === 0);
  for (const w of [...weak, ...needy]) {
    const share = w.misses >= 2 ? 3 : 2;
    allocations.set(w.profile.id, Math.min(share, budget));
    budget -= Math.min(share, budget);
    if (budget <= 0) break;
  }
  let solidIdx = 0;
  while (budget > 0 && solid.length) {
    const w = solid[solidIdx % solid.length]!;
    const share = Math.min(1, budget);
    allocations.set(w.profile.id, (allocations.get(w.profile.id) ?? 0) + share);
    budget -= share;
    solidIdx++;
  }
  if (budget > 0 && ranked.length) {
    // still budget: cycle everyone (more practice for the strongest too)
    let i = 0;
    while (budget > 0) {
      const w = ranked[i % ranked.length]!;
      allocations.set(w.profile.id, (allocations.get(w.profile.id) ?? 0) + 1);
      budget--;
      i++;
    }
  }

  // build the queue, varied by kind and separated from itself
  const queue: BrainQuestion[] = [];
  for (const w of ranked) {
    const n = allocations.get(w.profile.id) ?? 0;
    if (!n) continue;
    const level = levelFor(db, w.profile.id);
    const kinds = kindsFor(opts.mode, level);
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % kinds.length]!;
      queue.push(makeFor(w, level, kind));
    }
  }

  // interleave so a concept never follows itself
  const out: BrainQuestion[] = [];
  const byConcept = new Map<ID, BrainQuestion[]>();
  for (const q of shuffle(queue)) {
    const list = byConcept.get(q.conceptId) ?? [];
    list.push(q);
    byConcept.set(q.conceptId, list);
  }
  const lastUsed = new Map<ID, number>();
  let guard = 0;
  while (out.length < queue.length && guard++ < queue.length * 6) {
    // pick the placeable concept with the MOST items left — leaving a big
    // pile for the end is what creates back-to-back repeats
    let best: [ID, BrainQuestion[]] | null = null;
    for (const [cid, list] of byConcept) {
      if (!list.length) continue;
      const last = lastUsed.get(cid) ?? -10;
      if (out.length - last < 2) continue;
      if (!best || list.length > best[1].length) best = [cid, list];
    }
    if (best) {
      out.push(best[1].shift()!);
      lastUsed.set(best[0], out.length - 1);
      continue;
    }
    // nothing placeable at a distance: take the biggest remaining pile
    let fallback: [ID, BrainQuestion[]] | null = null;
    for (const [cid, list] of byConcept) {
      if (list.length && (!fallback || list.length > fallback[1].length)) fallback = [cid, list];
    }
    if (fallback) {
      out.push(fallback[1].shift()!);
      lastUsed.set(fallback[0], out.length - 1);
    }
  }
  return out.slice(0, opts.count);
}
