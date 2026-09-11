/**
 * Flashcard runner — a real retrieval loop, not a flip-card.
 * Prompt → think → (optional) type your answer → reveal → compare →
 * confidence → scheduling feedback → next. Cards teach: after grading,
 * context (misconception/example) is offered, not hidden.
 */

import { h, mount } from '../../lib/h';
import { icon } from '../../lib/icons';
import { store } from '../../app/state';
import { recordAttempt } from '../../app/actions';
import { schedule, describeSchedule } from '../../engine/scheduling';
import { openOverlay, closeOverlay, toast } from '../../app/ui';
import type { Concept, Flashcard } from '../../domain/types';

export interface CardRunOptions {
  title?: string;
  subjectId?: string;
  conceptIds?: string[];
  card?: Flashcard;
}

export function openCards(concept: Concept): void {
  runCards([concept], { title: `Cards · ${concept.name}` });
}

export function openReviewCards(concepts: Concept[], title: string): void {
  runCards(concepts, { title });
}

function runCards(concepts: Concept[], opts: CardRunOptions): void {
  // Build the queue: for each concept, its flashcards (or a synthesized one).
  const queue: { concept: Concept; card: Flashcard }[] = [];
  for (const concept of concepts) {
    const cards = concept.flashcards.length
      ? concept.flashcards
      : [{ id: 'fc_auto', front: concept.name, back: concept.summary }];
    for (const card of cards) queue.push({ concept, card });
  }
  if (!queue.length) {
    toast('Nothing to review here.');
    return;
  }

  let idx = 0;
  let revealed = false;
  let typed = '';
  let typing = false;
  let startedAt = Date.now();
  const outcomes = { correct: 0, incorrect: 0 };
  let lastScheduleLabel = '';

  const root = h('div', {
    style: {
      maxWidth: '720px',
      margin: '0 auto',
      width: '100%',
      padding: 'var(--space-6) var(--space-4) var(--space-9)',
    } as Partial<CSSStyleDeclaration>,
  });

  const closeBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => closeOverlay() }, icon('x', 15), 'Finish');
  const progressBar = h('div', { class: 'runner-progress' }, h('span', { style: { width: '0%' } as Partial<CSSStyleDeclaration> }));
  const meta = h('div', { class: 'runner-meta' },
    h('span', {}, opts.title ?? 'Flashcards'),
    h('span', { class: 'num' }, `${idx + 1} / ${queue.length}`),
  );
  const body = h('div', { class: 'view-enter' });

  const current = () => queue[idx]!;

  function render(): void {
    (progressBar.firstElementChild as HTMLElement).style.width = `${Math.round((idx / queue.length) * 100)}%`;
    meta.replaceChildren(
      h('span', {}, opts.title ?? 'Flashcards'),
      h('span', { class: 'num' }, `${Math.min(idx + 1, queue.length)} / ${queue.length}`),
    );
    mount(body, []);
    if (idx >= queue.length) return renderSummary();
    const { concept, card } = current();

    const hint = card.hint ?? concept.misconception;
    const schedulePreview = (level: 0 | 1 | 2 | 3) => {
      const prev = store.get().review[concept.id];
      return describeSchedule(schedule(prev, level, new Date()).intervalDays);
    };

    const typedInput = h('textarea', {
      class: 'textarea',
      rows: 3,
      placeholder: 'Type your answer from memory (optional but it works better)…',
    }) as HTMLTextAreaElement;

    body.appendChild(
      h('div', { class: 'flashcard' },
        h('div', {
          class: 'flashcard-inner',
          style: revealed ? undefined : { cursor: 'pointer' } as Partial<CSSStyleDeclaration>,
        },
          h('div', { class: 'flashcard-face' },
            h('span', { class: 'fc-label' }, concept.name),
            h('div', { class: 'fc-text' }, card.front),
            h('span', { class: 'fc-hint' }, 'Recall first — then flip.'),
          ),
          h('div', { class: 'flashcard-face flashcard-back' },
            h('span', { class: 'fc-label' }, 'Answer'),
            h('div', { class: 'fc-text answer' }, card.back),
            hint ? h('p', { class: 'small subtle', style: { maxWidth: '44ch' } as Partial<CSSStyleDeclaration> }, hint) : null,
          ),
        ),
      ),
    );

    const flipCard = () => {
      if (revealed) return;
      revealed = true;
      const inner = body.querySelector('.flashcard-inner') as HTMLElement | null;
      inner?.classList.add('flipped');
      renderControls();
    };

    const controls = h('div', { class: 'mt-4' });
    body.appendChild(controls);

    const renderControls = () => {
      mount(controls, []);
      if (!revealed) {
        controls.appendChild(
          h('div', { class: 'stack mt-3' },
            h('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'flex-start' } as Partial<CSSStyleDeclaration>, type: 'button', onclick: () => { typing = !typing; renderControls(); } },
              icon('pen', 14), typing ? 'Hide the text box' : 'Type my answer first'),
            typing ? typedInput : null,
            h('div', { class: 'btn-row mt-2' },
              h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => { typed = typedInput.value; flipCard(); } }, 'Reveal'),
            ),
          ),
        );
        return;
      }
      if (typing) {
        controls.appendChild(
          h('div', { class: 'mt-2' },
            h('div', { class: 'page-kicker' }, 'Your answer'),
            h('p', { class: 'small muted', style: { whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, typed || '(left blank)'),
            h('div', { class: 'page-kicker mt-2' }, 'Compare'),
            h('p', { class: 'small muted' }, 'How close were you? Be honest — it drives the schedule.'),
          ),
        );
      }
      controls.appendChild(
        h('div', { class: 'mt-3' },
          h('div', { class: 'page-kicker' }, 'How did that go?'),
          h('div', { class: 'grade-row' },
            gradeBtn(0, 'Again', `var(--berry)`, schedulePreview(0)),
            gradeBtn(1, 'Hard', 'var(--amber)', schedulePreview(1)),
            gradeBtn(2, 'Good', 'var(--pine)', schedulePreview(2)),
            gradeBtn(3, 'Easy', 'var(--moss)', schedulePreview(3)),
          ),
        ),
      );
    };

    const gradeBtn = (level: 0 | 1 | 2 | 3, label: string, color: string, scheduleLabel: string) => {
      return h('button', {
        class: 'grade-btn',
        type: 'button',
        aria: { label: `Grade: ${label} (${level + 1})` },
        onclick: () => grade(level, scheduleLabel),
      },
        h('span', { class: 'g-kbd', aria: { hidden: true } }, String(level + 1)),
        h('span', { class: 'g-label', style: { color } as Partial<CSSStyleDeclaration> }, label),
        h('span', { class: 'g-when' }, scheduleLabel),
      );
    };

    function grade(level: 0 | 1 | 2 | 3, scheduleLabel: string): void {
      const elapsed = Date.now() - startedAt;
      const correct = level >= 2;
      outcomes[correct ? 'correct' : 'incorrect']++;
      lastScheduleLabel = scheduleLabel;
      recordAttempt({
        conceptId: concept.id,
        mode: 'flashcard',
        outcome: level === 0 ? 'incorrect' : level === 1 ? 'partial' : 'correct',
        confidence: level,
        elapsedMs: Math.min(elapsed, 120000),
      });
      toast(correct
        ? `${labelOf(level)} — ${scheduleLabel.toLowerCase()}.`
        : `Logged. ${scheduleLabel} — it'll come back around.`,
      { duration: 2200 });
      next();
    }

    function next(): void {
      revealed = false;
      typing = false;
      typed = '';
      startedAt = Date.now();
      idx++;
      render();
    }

    renderControls();

    // keyboard: space reveals, 1-4 grade
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !revealed) {
        e.preventDefault();
        flipCard();
      } else if (revealed) {
        if (e.key === '1') grade(0, lastScheduleLabel || schedulePreview(0));
        else if (e.key === '2') grade(1, schedulePreview(1));
        else if (e.key === '3') grade(2, schedulePreview(2));
        else if (e.key === '4') grade(3, schedulePreview(3));
      }
    };
    const oldKey = root._keyHandler;
    if (oldKey) document.removeEventListener('keydown', oldKey, true);
    const handler = onKey as EventListener;
    document.addEventListener('keydown', handler, true);
    root._keyHandler = handler;

    const flipBtn = h('button', { class: 'btn btn-ghost btn-sm hide-mobile', type: 'button', style: { position: 'absolute', top: '8px', right: '8px', opacity: '0' } as Partial<CSSStyleDeclaration> });
    void flipBtn;
    // clicking the card flips it
    const innerEl = body.querySelector('.flashcard-inner') as HTMLElement | null;
    innerEl?.addEventListener('click', flipCard);
  }

  function renderSummary(): void {
    (progressBar.firstElementChild as HTMLElement).style.width = '100%';
    meta.replaceChildren(h('span', {}, opts.title ?? 'Flashcards'), h('span', { class: 'num' }, 'done'));
    mount(body, [
      h('div', { class: 'center', style: { padding: 'var(--space-7) 0' } as Partial<CSSStyleDeclaration> },
        h('div', { class: 'empty-art' }, '✓'),
        h('h2', { style: { fontSize: '24px', marginBottom: '4px' } as Partial<CSSStyleDeclaration> }, 'Round complete'),
        h('p', { class: 'muted' }, `${outcomes.correct} solid · ${outcomes.incorrect} need more work.`),
        h('p', { class: 'small subtle mt-2' }, 'The schedule already moved each card to its next review.'),
        h('div', { class: 'btn-row mt-4', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => closeOverlay() }, 'Done'),
        ),
      ),
    ]);
    if (root._keyHandler) {
      document.removeEventListener('keydown', root._keyHandler, true);
      root._keyHandler = null;
    }
  }

  mount(root, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'page-kicker' }, 'Retrieval practice'),
      closeBtn,
    ),
    progressBar,
    meta,
    body,
  ]);
  openOverlay(root);
  render();
}

function labelOf(level: number): string {
  return ['Again', 'Hard', 'Good', 'Easy'][level] ?? '';
}

declare global {
  interface HTMLElement {
    _keyHandler?: EventListener | null;
  }
}
