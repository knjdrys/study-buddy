/**
 * Plan — planning connected to actual learning. Exams drive recommended
 * minutes per day; the calendar shows real due dates, sessions, and exams;
 * the plan adapts as readiness changes.
 */

import { h } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { subjectSummaries } from '../app/selectors';
import { computeMastery } from '../engine/mastery';
import { readiness } from '../engine/readiness';
import { pageHead, emptyState, sectionLabel, btn, bar } from './kit';
import { openSessionSetup } from './runners/session';
import { openDialog, closeDialog, toast } from '../app/ui';
import { store } from '../app/state';
import { updateSubject } from '../app/actions';
import { daysUntil, todayKey } from '../lib/util';

export function viewPlan(c: Ctx): Node[] {
  const { db } = c;
  const summaries = subjectSummaries(db).filter((s) => s.subject.exam);
  const nodes: Node[] = [
    pageHead({
      kicker: 'Plan',
      title: 'From here to exam day',
      sub: summaries.length
        ? 'Each subject shows what\u2019s left, how ready you are, and how much time per day gets you there.'
        : 'Set an exam date on any subject and a study plan will appear here.',
    }),
  ];

  if (!summaries.length) {
    nodes.push(
      emptyState({
        glyph: '◷',
        title: 'No exams on the calendar',
        body: 'Add an exam date to a subject (Learn → subject → Edit) and StudyBuddy will plan the path to it.',
        actions: [btn('Go to Learn', { kind: 'primary', run: () => c.nav('learn') })],
      }),
    );
    nodes.push(h('div', { class: 'mt-4' }, renderCalendar(c)));
    return nodes;
  }

  for (const s of summaries) {
    const concepts = db.concepts.filter((x) => x.subjectId === s.subject.id);
    const r = readiness(concepts, db.review, db.attempts);
    const days = Math.max(1, daysUntil(s.subject.exam!.date));
    const notMastered = concepts.filter((x) => {
      const m = computeMastery(x, db.attempts, db.review[x.id]);
      return !(m.stage === 'mastered' || (m.stage === 'proficient' && m.score >= 0.8));
    });
    // recommended minutes: cover remaining concepts + keep due reviews warm
    const remainingMinutes = notMastered.length * 4;
    const perDay = Math.min(60, Math.max(5, Math.ceil(remainingMinutes / Math.min(days, 21))));

    nodes.push(
      h('div', { class: 'panel' },
        h('div', { class: 'split', style: { alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
          h('div', { class: 'grow' },
            h('div', { class: 'page-kicker' }, days === 0 ? 'Exam today' : `${days} ${days === 1 ? 'day' : 'days'} to go`),
            h('h2', { style: { fontSize: '21px', margin: '2px 0 4px' } as Partial<CSSStyleDeclaration> }, s.subject.name),
            h('p', { class: 'small muted' },
              `${s.subject.exam!.date} · ${s.mastered} of ${s.conceptCount} concepts in good shape · ${notMastered.length} to go.`),
            h('p', { class: 'tiny subtle mt-1' }, r.advice),
          ),
          h('div', { class: 'center', style: { minWidth: '120px' } as Partial<CSSStyleDeclaration> },
            h('div', { style: { fontFamily: 'var(--font-display)', fontSize: '34px', fontWeight: '600', color: 'var(--pine-strong)' } as Partial<CSSStyleDeclaration> }, `${r.percent}%`),
            h('div', { class: 'tiny subtle' }, 'readiness'),
          ),
        ),
        h('div', { class: 'mt-3' }, bar(r.percent / 100)),
        h('div', { class: 'btn-row mt-3' },
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openSessionSetup({ subjectId: s.subject.id }) }, icon('play', 14), `Session · ~${perDay}m`),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => c.nav('subject', { id: s.subject.id }) }, 'Open subject'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => editExamDate(s.subject.id, s.subject.exam!.date) }, 'Change exam date'),
        ),
        notMastered.length
          ? h('div', { class: 'mt-3' },
              h('div', { class: 'page-kicker' }, 'Still to master'),
              h('div', { class: 'chip-btns mt-1' },
                ...notMastered.slice(0, 8).map((x) =>
                  h('button', { class: 'chip', type: 'button', onclick: () => c.nav('concept', { id: x.id }) }, x.name),
                ),
                notMastered.length > 8 ? h('span', { class: 'chip' }, `+${notMastered.length - 8} more`) : null,
              ),
            )
          : null,
      ),
    );
  }

  nodes.push(h('div', { class: 'mt-5' }, renderCalendar(c)));
  return nodes;
}

function editExamDate(subjectId: string, current: string): void {
  const input = h('input', { class: 'input', type: 'date', value: current, min: todayKey() }) as HTMLInputElement;
  openDialog({
    title: 'Exam date',
    body: [
      h('p', { class: 'small muted mb-2' }, 'The plan recalculates itself whenever you change this.'),
      input,
    ],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        if (!input.value) return;
        updateSubject(subjectId, { exam: { date: input.value } });
        closeDialog();
        toast('Plan updated.');
      } }, 'Save'),
    ],
  });
}

function renderCalendar(_c: Ctx): HTMLElement {
  const db = store.get();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const today = todayKey();
  const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;

  const dueByDay = new Map<string, number>();
  for (const concept of db.concepts) {
    const r = db.review[concept.id];
    if (!r) continue;
    const dueKey = r.dueAt.slice(0, 10);
    if (dueKey.startsWith(monthKey)) dueByDay.set(dueKey, (dueByDay.get(dueKey) ?? 0) + 1);
  }
  const sessionsByDay = new Map<string, number>();
  for (const s of db.sessions) {
    if (s.status !== 'done' || !s.endedAt) continue;
    const key = s.endedAt.slice(0, 10);
    sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1);
  }
  const examByDay = new Map<string, string>();
  for (const s of db.subjects) {
    if (s.exam) examByDay.set(s.exam.date, s.name);
  }

  const cells: Node[] = [];
  for (let i = 0; i < first; i++) cells.push(h('div', { class: 'cal-day muted' }, ''));
  for (let day = 1; day <= daysIn; day++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const due = dueByDay.get(key) ?? 0;
    const sess = sessionsByDay.get(key) ?? 0;
    const exam = examByDay.get(key);
    const cell = h('div', { class: `cal-day ${key === today ? 'today' : ''}` },
      h('div', { class: 'split', style: { alignItems: 'center' } as Partial<CSSStyleDeclaration> },
        h('span', { style: { fontWeight: key === today ? '700' : '500' } as Partial<CSSStyleDeclaration> }, String(day)),
        exam ? h('span', { class: 'cal-exam', title: `${exam} exam` }, 'exam') : null,
      ),
      h('div', { class: 'cal-dots' },
        due > 0 ? h('span', { class: 'cal-dot', title: `${due} reviews due` }) : null,
        sess > 0 ? h('span', { class: 'cal-dot amber', title: `${sess} session${sess > 1 ? 's' : ''}` }) : null,
      ),
    );
    cells.push(cell);
  }

  return h('div', {},
    sectionLabel(
      `${now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`,
    ),
    h('div', { class: 'cal-grid' },
      ...['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) =>
        h('div', { class: 'center tiny subtle', style: { padding: '2px 0' } as Partial<CSSStyleDeclaration> }, d),
      ),
      cells,
    ),
    h('div', { class: 'chip-btns mt-2' },
      h('span', { class: 'chip' }, h('span', { class: 'cal-dot', style: { display: 'inline-block' } as Partial<CSSStyleDeclaration> }), 'reviews due'),
      h('span', { class: 'chip' }, h('span', { class: 'cal-dot amber', style: { display: 'inline-block' } as Partial<CSSStyleDeclaration> }), 'study session'),
      h('span', { class: 'chip berry' }, 'exam'),
    ),
  );
}
