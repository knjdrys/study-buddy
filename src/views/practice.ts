/**
 * Practice — application. Knowledge counts when you can use it: exams,
 * quick checks, and scenario questions per subject.
 */

import { h } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { subjectSummaries } from '../app/selectors';
import { pageHead, emptyState, btn } from './kit';
import { openExamSetup } from './runners/exam';
import { fmtDateMed } from '../lib/util';

export function viewPractice(c: Ctx): Node[] {
  const { db } = c;
  const summaries = subjectSummaries(db);

  // Recent practice (exams recorded as sessions with no segments)
  const exams = db.sessions
    .filter((s) => s.status === 'done' && s.segments.length === 0 && s.attempts.length > 0)
    .sort((a, b) => (a.endedAt! < b.endedAt! ? 1 : -1))
    .slice(0, 5);

  const nodes: Node[] = [
    pageHead({
      kicker: 'Practice',
      title: 'Put it to work',
      sub: 'Recall shows you remember; practice shows you can use it. Exams adapt to what needs work.',
    }),
  ];

  if (!summaries.length) {
    nodes.push(
      emptyState({
        glyph: '◎',
        title: 'Nothing to practice yet',
        body: 'Add concepts with questions first — or import notes and let StudyBuddy draft the questions.',
        actions: [btn('Go to the Library', { kind: 'primary', run: () => c.nav('library') })],
      }),
    );
    return nodes;
  }

  nodes.push(
    h('div', { class: 'subject-grid' },
      ...summaries.map((s) => {
        const questionCount = db.concepts
          .filter((x) => x.subjectId === s.subject.id)
          .reduce((n, x) => n + Math.max(x.questions.length, 1), 0);
        return h('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
          h('div', { class: 'split' },
            h('h2', { style: { fontSize: '18px' } as Partial<CSSStyleDeclaration> }, s.subject.name),
            h('span', { class: 'chip' }, `${s.readiness}% ready`),
          ),
          h('p', { class: 'small muted' }, `${questionCount} questions available${s.due ? ` · ${s.due} due` : ''}.`),
          h('div', { class: 'btn-row mt-1' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openExamSetup(s.subject.id) }, icon('target', 15), 'Practice exam'),
            h('button', { class: 'btn', type: 'button', onclick: () => openExamSetup(s.subject.id, undefined, 'due') }, 'Quick check'),
          ),
        );
      }),
    ),
  );

  if (exams.length) {
    nodes.push(
      h('div', { class: 'section-label', style: { marginTop: 'var(--space-7)' } as Partial<CSSStyleDeclaration> }, h('h3', {}, 'Recent practice')),
      h('div', {},
        ...exams.map((ex) => {
          const subject = db.subjects.find((s) => s.id === ex.subjectId);
          const correct = ex.attempts.filter((aid) => {
            const a = db.attempts.find((x) => x.id === aid);
            return a?.outcome === 'correct';
          }).length;
          const pct = ex.attempts.length ? Math.round((correct / ex.attempts.length) * 100) : 0;
          return h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
            icon('target', 16),
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, subject?.name ?? 'Practice'),
              h('div', { class: 'row-sub' }, `${ex.attempts.length} questions · ${fmtDateMed(ex.endedAt!.slice(0, 10))}`),
            ),
            h('span', {
              class: 'chip',
              style: pct >= 80 ? { background: 'var(--moss-soft)', color: 'var(--moss)' } as Partial<CSSStyleDeclaration>
                : pct >= 60 ? { background: 'var(--amber-soft)', color: 'var(--amber-strong)' } as Partial<CSSStyleDeclaration>
                : { background: 'var(--berry-soft)', color: 'var(--berry)' } as Partial<CSSStyleDeclaration>,
            }, `${pct}%`),
          );
        }),
      ),
    );
  }

  return nodes;
}
