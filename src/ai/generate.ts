/**
 * Content creation helpers.
 * Local question builders work without any AI and are always available.
 * `aiDraftConcept` upgrades drafting when (and only when) a key is set —
 * and everything AI-drafted is flagged until the learner verifies it.
 */

import type { Concept, Question, Settings } from '../domain/types';
import { callLLM, isConfigured } from './provider';
import { newId, shuffle } from '../lib/util';

/* ---------------- local question builders ---------------- */

export function buildLocalQuestions(concept: Concept, siblingConcepts: Concept[]): Question[] {
  const qs: Question[] = [];

  // Typed recall (answer = concept name)
  if (concept.summary.trim()) {
    qs.push({
      id: newId('q'),
      kind: 'typed',
      prompt: `Which concept does this describe? — “${concept.summary}”`,
      answer: concept.name,
      explanation: concept.summary,
    });
  }

  // Multiple choice: definition → name
  const distractors = siblingConcepts
    .filter((c) => c.id !== concept.id && c.name)
    .map((c) => c.name);
  if (concept.summary && distractors.length >= 2) {
    const opts = shuffle([concept.name, ...shuffle(distractors).slice(0, 3)]);
    qs.push({
      id: newId('q'),
      kind: 'mc',
      prompt: `What is ${concept.name}?`,
      options: opts,
      answer: concept.name,
      explanation: concept.summary,
    });
  }

  // True/false from the misconception (a *false* statement is the trap)
  if (concept.misconception?.trim()) {
    const isTrue = Math.random() > 0.5;
    qs.push({
      id: newId('q'),
      kind: 'tf',
      prompt: isTrue
        ? `True or false: “${concept.summary}”`
        : `True or false: “${concept.misconception}”`,
      options: ['True', 'False'],
      answer: isTrue ? 'True' : 'False',
      explanation: isTrue
        ? concept.summary
        : `This is a common misconception. Actually: ${concept.summary}`,
    });
  }

  // Scenario: apply the concept
  if (concept.example?.trim()) {
    qs.push({
      id: newId('q'),
      kind: 'scenario',
      prompt: `In your own words: how would ${concept.name} show up in this situation?\n\n“${concept.example}”`,
      answer: concept.summary,
      explanation: 'Check your answer against the explanation — did you capture the mechanism, not just the name?',
    });
  }

  return qs;
}

/* ---------------- optional LLM drafting ---------------- */

export interface DraftedContent {
  summary: string;
  explanation: string;
  example?: string;
  misconception?: string;
  flashcards: { front: string; back: string }[];
  questions: { kind: Question['kind']; prompt: string; options?: string[]; answer: string; explanation?: string }[];
}

export async function aiDraftConcept(
  settings: Settings,
  conceptName: string,
  subjectName: string,
  notes: string,
): Promise<DraftedContent> {
  if (!isConfigured(settings)) {
    throw new Error('No AI provider configured — add a key in Settings, or write it yourself.');
  }
  const system = [
    'You draft study material for a spaced-repetition learning app.',
    'You are precise and neutral; you never invent facts and you flag uncertainty.',
    'Respond with STRICT JSON matching the requested shape.',
  ].join(' ');
  const user = `Concept: ${conceptName}\nSubject: ${subjectName}\nThe learner's own notes (may be empty): ${notes || '(none)'}\n\nDraft: a one-sentence "summary" (plain, testable definition), a 3-5 sentence "explanation" (clear, one concrete mechanism or idea), an optional concrete "example", an optional common "misconception" (stated as the wrong belief), 3 "flashcards" [{front, back}] that test recall not recognition, and 2 "questions" [{kind: "mc"|"tf"|"typed"|"scenario", prompt, options (for mc/tf only), answer, explanation}].\n\nJSON only.`;
  const raw = await callLLM(settings, system, user, { json: true, maxTokens: 1200 });
  const parsed = JSON.parse(raw) as Partial<DraftedContent>;
  if (!parsed.summary || !parsed.explanation) {
    throw new Error('The draft came back incomplete — try again or write it yourself.');
  }
  return {
    summary: String(parsed.summary),
    explanation: String(parsed.explanation),
    example: parsed.example ? String(parsed.example) : undefined,
    misconception: parsed.misconception ? String(parsed.misconception) : undefined,
    flashcards: (parsed.flashcards ?? [])
      .filter((f) => f && f.front && f.back)
      .slice(0, 5)
      .map((f) => ({ front: String(f.front), back: String(f.back) })),
    questions: (parsed.questions ?? [])
      .filter((q) => q && q.prompt && q.answer)
      .slice(0, 6)
      .map((q) => ({
        kind: q.kind ?? 'typed',
        prompt: String(q.prompt),
        options: q.options?.map(String),
        answer: String(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      })),
  };
}

/** Optional LLM qualitative feedback for Feynman explanations. */
export async function aiFeynmanFeedback(
  settings: Settings,
  concept: Concept,
  learnerText: string,
): Promise<string> {
  if (!isConfigured(settings)) throw new Error('No AI provider configured');
  const system =
    'You are a thoughtful tutor reviewing a student\'s explanation. Be warm, specific, and brief (2-4 sentences). Name what was right, what was missing or wrong, and one thing to improve. Never write the whole answer for them.';
  const user = `Concept: ${concept.name}\nOfficial explanation: ${concept.explanation}\nExample: ${concept.example ?? '—'}\nCommon misconception: ${concept.misconception ?? '—'}\n\nThe learner's explanation:\n${learnerText}`;
  return callLLM(settings, system, user, { maxTokens: 260 });
}
