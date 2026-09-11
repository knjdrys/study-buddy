/**
 * Tutor — guided learning, not a chatbot.
 * A deterministic Socratic loop over real concept content: probe → listen →
 * hint → guiding question → partial explanation → application. The tutor
 * knows the learner's history (recent mistakes, mastery) and uses it.
 */

import { h, mount } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { store } from '../app/state';
import { recordAttempt } from '../app/actions';
import { tutorReply, initialState, type TutorState, type TutorTurn } from '../ai/tutor';
import { isConfigured } from '../ai/provider';
import { computeMastery } from '../engine/mastery';
import { analyzeFeynman } from '../engine/analysis';
import { pageHead, emptyState, btn } from './kit';
import { toast } from '../app/ui';
import type { Concept } from '../domain/types';

export function viewTutor(c: Ctx): Node[] {
  const db = store.get();
  const subjects = db.subjects.filter((s) => !s.archivedAt);
  const concepts = db.concepts;
  const paramId = location.hash.match(/tutor\/([^/]+)/)?.[1];

  const nodes: Node[] = [
    pageHead({
      kicker: 'Tutor',
      title: 'A tutor for the hard parts',
      sub: 'Socratic by design: the tutor asks, you answer, it nudges — answers come out step by step, only when you need them.',
    }),
  ];

  if (!concepts.length) {
    nodes.push(
      emptyState({
        glyph: '❝',
        title: 'Nothing to tutor on yet',
        body: 'Add concepts first — the tutor works with your own material, so it always knows what you\u2019re supposed to learn.',
        actions: [btn('Go to the Library', { kind: 'primary', run: () => c.nav('library') })],
      }),
    );
    return nodes;
  }

  // pick a concept
  const subjectSelect = h('select', { class: 'select', value: subjects[0]?.id ?? '' },
    ...subjects.map((s) => h('option', { value: s.id, selected: s.id === subjects[0]?.id }, s.name)),
  ) as HTMLSelectElement;
  const conceptSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  const renderConcepts = () => {
    mount(conceptSelect, [
      ...db.concepts
        .filter((x) => x.subjectId === subjectSelect.value)
        .map((x) => h('option', { value: x.id }, x.name)),
    ]);
  };
  renderConcepts();
  subjectSelect.addEventListener('change', renderConcepts);

  const thread = h('div', { class: 'tutor-thread', style: { maxWidth: '680px' } as Partial<CSSStyleDeclaration> });

  nodes.push(
    h('div', { class: 'panel', style: { maxWidth: '720px' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'field-row' },
        h('div', { class: 'field', style: { marginBottom: '0' } as Partial<CSSStyleDeclaration> },
          h('label', { class: 'label' }, 'Subject'),
          subjectSelect),
        h('div', { class: 'field', style: { marginBottom: '0' } as Partial<CSSStyleDeclaration> },
          h('label', { class: 'label' }, 'Concept'),
          conceptSelect),
      ),
      h('button', { class: 'btn btn-primary mt-3', type: 'button', onclick: () => startThread(conceptSelect.value, thread) }, icon('chat', 15), 'Start tutoring'),
    ),
    h('div', { class: 'mt-4' }, thread),
  );
  if (!isConfigured(db.settings)) {
    nodes.push(
      h('p', { class: 'tiny subtle mt-3', style: { maxWidth: '680px' } as Partial<CSSStyleDeclaration> },
        'Running on local reasoning over your material — no AI service involved. Add your own AI key in Settings for richer feedback (optional).'),
    );
  }

  // resume by URL param
  if (paramId && db.concepts.some((x) => x.id === paramId)) {
    setTimeout(() => startThread(paramId, thread), 0);
  }

  return nodes;
}

function startThread(conceptId: string, threadEl: HTMLElement): void {
  const db = store.get();
  const concept = db.concepts.find((x) => x.id === conceptId);
  if (!concept) { toast('Pick a concept first.'); return; }

  const history: TutorTurn[] = [];
  let state: TutorState = initialState();
  let lastCoverage = 0;
  let lastCoverageSet = false;

  mount(threadEl, []);

  const addMsg = (who: 'tutor' | 'me', text: string) => {
    history.push({ who, text });
    threadEl.appendChild(
      h('div', { class: `msg ${who === 'tutor' ? 'tutor' : 'me'}` },
        h('span', { class: 'who' }, who === 'tutor' ? 'Tutor' : 'You'),
        text,
      ),
    );
    threadEl.scrollTop = threadEl.scrollHeight;
  };

  const inputRow = h('div', {
    class: 'tutor-input-row',
    style: {
      display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)',
      maxWidth: '680px', flexWrap: 'wrap', alignItems: 'center',
    } as Partial<CSSStyleDeclaration>,
  });
  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Your answer…',
    style: { flex: '1', minWidth: '200px' } as Partial<CSSStyleDeclaration>,
  }) as HTMLInputElement;
  const quickRow = h('div', { class: 'chip-btns', style: { marginTop: 'var(--space-2)', maxWidth: '680px' } as Partial<CSSStyleDeclaration> });
  threadEl.appendChild(inputRow);
  threadEl.appendChild(quickRow);

  const renderOptions = (opts: { id: string; label: string }[]) => {
    mount(quickRow, [
      ...opts.map((o) =>
        h('button', { class: 'chip', type: 'button', onclick: () => respond(o.id) }, o.label),
      ),
    ]);
  };

  const respond = (text: string) => {
    if (text === 'hint') text = 'I need a hint';
    else if (text === 'reveal') text = 'Show me the explanation';
    else if (text === 'more') text = 'Ask me another';
    else if (text === 'done') text = "I'm done";
    else if (text === 'restart') text = 'Start over';
    else if (text === 'next') {
      // next concept in the same subject
      const siblings = db.concepts.filter((x) => x.subjectId === concept.subjectId && x.id !== concept.id);
      if (siblings.length) {
        finishAttempt();
        startThread(siblings[Math.floor(Math.random() * siblings.length)]!.id, threadEl);
        return;
      }
      finishAttempt();
      addMsg('tutor', 'That\u2019s the last concept in this subject. Well done — reviews are scheduled.');
      mount(quickRow, []);
      return;
    }
    if (text === 'Start over') {
      history.length = 1;
      state = initialState();
      mount(threadEl, []);
      threadEl.appendChild(inputRow);
      threadEl.appendChild(quickRow);
      addMsg('tutor', `Let's work on “${concept.name}” together.`);
      const first = tutorReply(concept, concept.questions, history, state);
      addMsg('tutor', first.reply);
      renderOptions(first.options);
      input.value = '';
      return;
    }
    addMsg('me', text === 'I need a hint' ? 'I need a hint' : text);
    const reply = tutorReply(concept, concept.questions, history, state);
    state = reply.state;
    addMsg('tutor', reply.reply);
    renderOptions(reply.options);
    input.value = '';
  };

  const submitTyped = () => {
    const v = input.value.trim();
    if (!v) return;
    addMsg('me', v);
    const reply = tutorReply(concept, concept.questions, history, state);
    state = reply.state;
    lastCoverage = replyCoverage(v, concept);
    lastCoverageSet = true;
    addMsg('tutor', reply.reply);
    renderOptions(reply.options);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitTyped();
    }
  });
  const sendBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: submitTyped }, icon('arrow-right', 15), 'Answer');
  inputRow.append(input, sendBtn);

  const finishAttempt = () => {
    if (!lastCoverageSet) return;
    recordAttempt({
      conceptId: concept.id,
      mode: 'tutor',
      outcome: lastCoverage >= 0.55 ? 'correct' : lastCoverage >= 0.3 ? 'partial' : 'incorrect',
      confidence: lastCoverage >= 0.55 ? 2 : 1,
      elapsedMs: 60000,
    });
    lastCoverageSet = false;
  };

  // context-aware opening
  const info = computeMastery(concept, db.attempts, db.review[concept.id]);
  const recentMiss = db.attempts
    .filter((a) => a.conceptId === concept.id)
    .slice(-4)
    .some((a) => a.outcome === 'incorrect');
  addMsg('tutor', `Let's work on “${concept.name}” together.`);
  if (recentMiss) addMsg('tutor', 'I noticed this one came up wrong recently, so we\u2019ll rebuild it from the ground up.');
  else if (info.stage === 'new' || info.stage === 'introduced') addMsg('tutor', 'New territory — we\u2019ll go step by step. No rush.');
  else addMsg('tutor', `You're at ${info.stage} on this. Let's see if you can teach it back to me.`);
  const first = tutorReply(concept, concept.questions, history, state);
  state = first.state;
  addMsg('tutor', first.reply);
  renderOptions(first.options);
}

/** How well the learner's answer covers the concept (for honest logging). */
function replyCoverage(text: string, concept: Concept): number {
  return analyzeFeynman(concept, text).coverage;
}
