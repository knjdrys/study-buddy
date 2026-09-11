/**
 * Review — the retrieval queue. Due concepts first, then mistakes, then
 * the explanation modes (blurting, teach-back) for what needs deepening.
 */

import { h } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { dueConcepts } from '../app/selectors';
import { computeMastery } from '../engine/mastery';
import { dueLabel } from '../engine/scheduling';
import { pageHead, emptyState, stageChip, btn, sectionLabel } from './kit';
import { openReviewCards } from './runners/cards';
import { openBlurt } from './runners/blurt';
import { openFeynman } from './runners/feynman';
import { openSessionSetup } from './runners/session';
import type { Concept } from '../domain/types';

export function viewReview(c: Ctx): Node[] {
  const { db } = c;
  const due = dueConcepts(db);
  const subjects = db.subjects.filter((s) => !s.archivedAt);

  // mistakes: recently incorrect concepts, still shaky
  const mistakeConcepts: Concept[] = [];
  const recent = db.attempts.filter((a) => Date.now() - new Date(a.at).getTime() < 14 * 86_400_000);
  for (const concept of db.concepts) {
    const own = recent.filter((a) => a.conceptId === concept.id);
    if (!own.length) continue;
    const miss = own.filter((a) => a.outcome === 'incorrect').length;
    const last = own[own.length - 1]!;
    if ((miss >= 2 || last.outcome === 'incorrect') && !due.includes(concept)) {
      mistakeConcepts.push(concept);
    }
  }

  const nodes: Node[] = [
    pageHead({
      kicker: 'Review',
      title: due.length ? `${due.length} ${due.length === 1 ? 'concept' : 'concepts'} due` : 'Reviews are clear',
      sub: due.length
        ? 'The schedule knows what\u2019s slipping. Ten minutes now beats an hour the night before.'
        : 'Nothing overdue. You can still sharpen mistakes, or explain a concept back to lock it in.',
      actions: due.length
        ? [btn('Review all due', { kind: 'primary', iconName: 'play', run: () => openReviewCards(due, 'Due review') })]
        : [btn('Start a session', { kind: 'primary', iconName: 'play', run: () => openSessionSetup({}) })],
    }),
  ];

  if (due.length) {
    const bySubject = new Map<string, Concept[]>();
    for (const concept of due) {
      const arr = bySubject.get(concept.subjectId) ?? [];
      arr.push(concept);
      bySubject.set(concept.subjectId, arr);
    }
    for (const [subjectId, list] of bySubject) {
      const subject = db.subjects.find((s) => s.id === subjectId);
      nodes.push(
        sectionLabel(subject?.name ?? 'Concepts', { label: 'Review these', run: () => openReviewCards(list, `Due · ${subject?.name ?? 'concepts'}`) }),
        h('div', {},
          ...list.map((concept) => {
            const info = computeMastery(concept, db.attempts, db.review[concept.id]);
            const r = db.review[concept.id];
            return h('button', {
              class: 'row',
              type: 'button',
              onclick: () => openReviewCards([concept], `Review · ${concept.name}`),
            },
              h('div', { class: 'row-main' },
                h('div', { class: 'row-title' }, concept.name),
                h('div', { class: 'row-sub' }, r ? dueLabel(r) : 'never reviewed'),
              ),
              stageChip(concept, info),
            );
          }),
        ),
      );
    }
  }

  if (mistakeConcepts.length) {
    nodes.push(
      sectionLabel('Recent mistakes', { label: 'Rework them', run: () => openReviewCards(mistakeConcepts.slice(0, 8), 'Reworking mistakes') }),
      h('p', { class: 'small muted' }, 'Wrong answers are scheduling data — these came back wrong recently and are worth a second pass.'),
      h('div', {},
        ...mistakeConcepts.slice(0, 5).map((concept) => {
          const info = computeMastery(concept, db.attempts, db.review[concept.id]);
          return h('button', {
            class: 'row',
            type: 'button',
            onclick: () => c.nav('concept', { id: concept.id }),
          },
            h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, concept.name), h('div', { class: 'row-sub' }, concept.summary)),
            stageChip(concept, info),
          );
        }),
      ),
    );
  }

  // explanation modes
  const explainable = db.concepts.filter((c) => {
    const m = computeMastery(c, db.attempts, db.review[c.id]);
    return m.score > 0.3 && m.evidence.explanation === 0;
  }).slice(0, 3);

  nodes.push(
    sectionLabel('Go deeper'),
    h('div', {
      class: 'grid-2',
    },
      h('div', { class: 'panel' },
        h('h3', { class: 'panel-title' }, icon('text', 16), 'Blurting sprint'),
        h('p', { class: 'small muted', style: { marginBottom: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
          'Hide everything and write what you remember. The gaps it finds are your real review list.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openBlurt({}) }, 'Blurt everything'),
          subjects.length ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openBlurt({ subjectId: subjects[0]!.id }) }, `Just ${subjects[0]!.name}`) : null,
        ),
      ),
      h('div', { class: 'panel' },
        h('h3', { class: 'panel-title' }, icon('quote', 16), 'Teach it back'),
        h('p', { class: 'small muted', style: { marginBottom: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
          'Explain a concept to a beginner, then see what you covered and what you skipped.'),
        explainable.length
          ? h('div', { class: 'chip-btns' },
              ...explainable.map((concept) =>
                h('button', { class: 'chip pine', type: 'button', onclick: () => openFeynman(concept) }, concept.name),
              ))
          : h('p', { class: 'tiny subtle' }, 'Explanations covered recently — nice.'),
      ),
    ),
  );

  if (!due.length && !mistakeConcepts.length) {
    nodes.splice(1, 0,
      emptyState({
        glyph: '✓',
        title: 'All caught up',
        body: 'Every review is current. A short session or a practice exam keeps things warm.',
        actions: [btn('Start a session', { kind: 'primary', run: () => openSessionSetup({}) })],
      }),
    );
  }

  return nodes;
}
