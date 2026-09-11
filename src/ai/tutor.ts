/**
 * Tutor engine.
 * Default: a deterministic Socratic loop over the concept's own content —
 * question → listen → hint → guiding question → partial explanation →
 * full explanation → application. Answers are revealed step by step, never
 * dumped. With a configured LLM, feedback and questions get richer, but the
 * pedagogy (progressive disclosure) stays the same.
 */

import type { Concept, Question } from '../domain/types';
import { analyzeFeynman, keyTerms } from '../engine/analysis';

export interface TutorTurn {
  who: 'tutor' | 'me';
  text: string;
}

export interface TutorState {
  stage: 'probe' | 'followup' | 'apply' | 'wrap';
  hintsGiven: number;
  explanationShown: boolean;
  questionIndex: number;
  asksRemaining: number;
}

export interface TutorReply {
  reply: string;
  state: TutorState;
  /** Suggested quick actions for the learner. */
  options: { id: string; label: string }[];
  /** True when the tutor is waiting for a typed answer. */
  expectAnswer: boolean;
}

export function initialState(): TutorState {
  return { stage: 'probe', hintsGiven: 0, explanationShown: false, questionIndex: 0, asksRemaining: 2 };
}

const COVERAGE_STRONG = 0.6;
const COVERAGE_SOME = 0.3;

export function tutorReply(
  concept: Concept,
  questions: Question[],
  thread: TutorTurn[],
  state: TutorState,
): TutorReply {
  const opts = (ids: { id: string; label: string }[]) => ids;

  // --- opening ---
  if (thread.length <= 1) {
    return {
      reply: `Let's work on “${concept.name}” together.\n\nStart by telling me, in your own words: what is ${concept.name}, and why does it matter?`,
      state,
      options: opts([{ id: 'hint', label: 'I need a hint' }]),
      expectAnswer: true,
    };
  }

  const last = thread[thread.length - 1]!;

  if (last.who === 'me' && last.text.trim() === 'I need a hint') {
    state.hintsGiven++;
    const hints = [
      `Hint: ${concept.summary.replace(/\.$/, '')} — now try saying it in your own words.`,
      `Think about the key parts: ${keyTerms(concept).slice(0, 3).join(', ')}.`,
      `First sentence of the explanation, with blanks: “${blankOut(concept.explanation.split('. ')[0] ?? '', keyTerms(concept).slice(0, 2))}”.`,
    ];
    return {
      reply: hints[Math.min(state.hintsGiven - 1, hints.length - 1)]!,
      state,
      options: opts([{ id: 'hint', label: 'Another hint' }, { id: 'reveal', label: 'Show me the explanation' }]),
      expectAnswer: true,
    };
  }

  if (last.who === 'me' && last.text.trim() === 'Show me the explanation') {
    state.explanationShown = true;
    const nextQ = questions[state.questionIndex];
    state.questionIndex++;
    return {
      reply: `${concept.explanation}\n\n${concept.example ? `For example: ${concept.example}\n\n` : ''}Now — ${nextQ ? nextQ.prompt : `why does ${concept.name} matter in practice?`}`,
      state: { ...state, stage: 'apply' },
      options: opts([{ id: 'more', label: 'Ask me another' }, { id: 'done', label: "I'm done" }]),
      expectAnswer: true,
    };
  }

  if (last.who === 'me' && last.text.trim() === 'Ask me another') {
    const q = questions[state.questionIndex % Math.max(1, questions.length)];
    state.questionIndex++;
    state.asksRemaining--;
    if (!q) {
      return wrapUp(concept, state, opts);
    }
    return {
      reply: q.prompt,
      state,
      options: opts([{ id: 'hint', label: 'I need a hint' }, { id: 'done', label: "I'm done" }]),
      expectAnswer: true,
    };
  }

  if (last.who === 'me' && last.text.trim() === "I'm done") {
    return wrapUp(concept, state, opts);
  }

  if (last.who === 'me' && last.text.trim() === 'Start over') {
    return tutorReply(concept, questions, [thread[0]!], initialState());
  }

  // --- the learner typed a real answer ---
  const fb = analyzeFeynman(concept, last.text);

  if (fb.coverage >= COVERAGE_STRONG) {
    if (state.stage === 'probe' || state.stage === 'followup') {
      const q = questions[state.questionIndex % Math.max(1, questions.length)] ?? null;
      state.questionIndex++;
      state.stage = 'apply';
      return {
        reply: q
          ? `Good — that's ${concept.name} in your own words, and it's accurate.\n\nLet's use it: ${q.prompt}`
          : `Good — that's ${concept.name} in your own words, and it's accurate.\n\nNow apply it: what would happen if it worked differently? Describe a real situation where ${concept.name} shows up.`,
        state,
        options: opts([{ id: 'hint', label: 'I need a hint' }]),
        expectAnswer: true,
      };
    }
    if (state.stage === 'apply') {
      if (state.asksRemaining <= 0) return wrapUp(concept, state, opts);
      state.asksRemaining--;
      const q = questions[(state.questionIndex + 1) % Math.max(1, questions.length)];
      state.questionIndex++;
      return {
        reply: q
          ? `Nice. One more: ${q.prompt}`
          : `Nice. Let's stop while it's fresh — re-read “${concept.name}” tomorrow and the schedule will take care of the rest.`,
        state,
        options: opts([{ id: 'hint', label: 'I need a hint' }, { id: 'done', label: "I'm done" }]),
        expectAnswer: true,
      };
    }
  }

  if (fb.coverage >= COVERAGE_SOME) {
    const missing = fb.missingPoints[0];
    return {
      reply: `You're partway there. ${missing ? `One thing that's missing: ${missing.toLowerCase().replace(/\.$/, '')}.` : 'Push a little deeper.'}\n\nWhat else is going on with ${concept.name}?`,
      state,
      options: opts([{ id: 'hint', label: 'I need a hint' }, { id: 'reveal', label: 'Show me the explanation' }]),
      expectAnswer: true,
    };
  }

  // Weak answer
  if (state.hintsGiven === 0) {
    return {
      reply: `That doesn't quite capture ${concept.name} yet — which is normal, it's what we're here to fix.\n\nTry this: ${concept.summary.split('. ')[0]!.toLowerCase()}. Now, in your own words, what does that mean?`,
      state,
      options: opts([{ id: 'hint', label: 'I need a hint' }, { id: 'reveal', label: 'Show me the explanation' }]),
      expectAnswer: true,
    };
  }
  return {
    reply: `Let's build it up properly.\n\n${concept.explanation}\n\n${concept.example ? `For example: ${concept.example}\n\n` : ''}Read that once, then close your eyes and explain ${concept.name} back to me in your own words.`,
    state: { ...state, explanationShown: true },
    options: opts([{ id: 'done', label: "I'm done" }]),
    expectAnswer: true,
  };
}

function wrapUp(concept: Concept, state: TutorState, opts: (o: { id: string; label: string }[]) => { id: string; label: string }[]): TutorReply {
  return {
    reply: `We covered: what ${concept.name} is, why it matters, and how to use it.${concept.misconception ? `\n\nOne trap to avoid: ${concept.misconception}` : ''}\n\nA short review is already scheduled. Come back when it's due and it'll stick.`,
    state: { ...state, stage: 'wrap' },
    options: opts([{ id: 'restart', label: 'Start over' }, { id: 'next', label: 'Next concept' }]),
    expectAnswer: false,
  };
}

function blankOut(sentence: string, words: string[]): string {
  let out = sentence;
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    out = out.replace(re, '____');
  }
  return out;
}
