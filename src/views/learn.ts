/**
 * Learn — subjects, their structure (topics → concepts), concept pages,
 * and the concept editor. The concept is the unit; everything else hangs
 * off it.
 */

import { h, mount, appendNodes } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { store } from '../app/state';
import {
  createSubject,
  updateSubject,
  archiveSubject,
  createTopic,
  createConcept,
  updateConcept,
  addFlashcards,
  replaceFlashcards,
  addQuestions,
  setRelated,
} from '../app/actions';
import { subjectSummaries, dueCount } from '../app/selectors';
import { computeMastery } from '../engine/mastery';
import { readiness } from '../engine/readiness';
import { buildLocalQuestions, aiDraftConcept } from '../ai/generate';
import { daysUntil, fmtDateMed, fmtDateShort } from '../lib/util';
import { currentRoute } from '../app/router';
import type { Concept, Difficulty, Question, Topic } from '../domain/types';
import { pageHead, sectionLabel, ring, stageChip, emptyState, field, btn, bar } from './kit';
import { openDialog, closeDialog, toast, confirmDialog } from '../app/ui';
import { registerQuickAction } from '../app/quickActions';
import { openSessionSetup } from './runners/session';
import { openCards } from './runners/cards';
import { openExamSetup } from './runners/exam';
import { openFeynman } from './runners/feynman';

/* ================= subjects list ================= */

export function viewLearn(c: Ctx): Node[] {
  const { db } = c;
  const summaries = subjectSummaries(db);

  const covers = summaries.map((s) => {
    const cover = h('button', {
      class: 'subject-cover',
      type: 'button',
      onclick: () => c.nav('subject', { id: s.subject.id }),
    });
    appendNodes(cover,
      h('div', { class: 'split' },
        h('div', {},
          h('h2', {}, s.subject.name),
          s.subject.code ? h('div', { class: 'page-kicker', style: { marginTop: '2px' } as Partial<CSSStyleDeclaration> }, s.subject.code) : null,
        ),
        ring(s.conceptCount ? s.readiness / 100 : 0, 44, { stroke: 5, label: s.conceptCount ? `${s.readiness}%` : '—', color: 'var(--pine)' }),
      ),
      s.subject.description ? h('p', { class: 'small muted' }, s.subject.description) : null,
      h('div', { class: 'split', style: { alignItems: 'center' } as Partial<CSSStyleDeclaration> },
        h('div', { class: 'chip-btns' },
          h('span', { class: 'chip' }, `${s.conceptCount} ${s.conceptCount === 1 ? 'concept' : 'concepts'}`),
          s.due > 0 ? h('span', { class: 'chip berry' }, `${s.due} due`) : null,
          s.subject.exam ? h('span', { class: 'chip amber' }, icon('flag', 12), fmtDateShort(s.subject.exam.date)) : null,
        ),
        h('span', { class: 'chev' }, icon('chevron-right', 16)),
      ),
    );
    return cover;
  });

  return [
    pageHead({
      kicker: 'Learn',
      title: 'Your subjects',
      sub: 'Pick a subject to keep going — reviews, practice and explanations live inside each one.',
      actions: [
        btn('New subject', { kind: 'primary', iconName: 'plus', run: () => openSubjectEditor() }),
      ],
    }),
    covers.length
      ? h('div', { class: 'subject-grid' }, covers)
      : emptyState({
          glyph: '◫',
          title: 'No subjects yet',
          body: 'Subjects hold your topics and concepts. Create one, import notes, or start from the sample library.',
          actions: [
            btn('Create a subject', { kind: 'primary', iconName: 'plus', run: () => openSubjectEditor() }),
            btn('Import from notes', { run: () => c.nav('library') }),
          ],
        }),
  ];
}

registerQuickAction({
  id: 'new-subject',
  label: 'Create a subject',
  icon: 'plus',
  run: () => openSubjectEditor(),
});

/* ================= subject editor ================= */

export function openSubjectEditor(subjectId?: string): void {
  const db = store.get();
  const existing = subjectId ? db.subjects.find((s) => s.id === subjectId) : undefined;
  const name = h('input', { class: 'input', placeholder: 'e.g. Organic Chemistry', value: existing?.name ?? '' }) as HTMLInputElement;
  const code = h('input', { class: 'input', placeholder: 'e.g. CHEM 204 (optional)', value: existing?.code ?? '' }) as HTMLInputElement;
  const description = h('input', { class: 'input', placeholder: 'One line about the subject (optional)', value: existing?.description ?? '' }) as HTMLInputElement;
  const goal = h('input', { class: 'input', placeholder: 'e.g. Pass the final in May (optional)', value: existing?.goal ?? '' }) as HTMLInputElement;
  const examDate = h('input', { class: 'input', type: 'date', value: existing?.exam?.date ?? '' }) as HTMLInputElement;

  openDialog({
    title: existing ? 'Edit subject' : 'New subject',
    body: [
      field({ label: 'Name', control: name }),
      h('div', { class: 'field-row' }, field({ label: 'Code', hint: 'optional', control: code }), field({ label: 'Exam date', hint: 'optional', control: examDate })),
      field({ label: 'Description', control: description }),
      field({ label: 'Goal', hint: 'what you are working toward', control: goal }),
    ],
    actions: [
      existing
        ? h('button', { class: 'btn btn-danger', type: 'button', onclick: () => {
            closeDialog();
            confirmDialog({
              title: `Archive ${existing.name}?`,
              body: 'The subject and its concepts stay saved — it just disappears from your active lists. You can restore it in the Library.',
              confirmLabel: 'Archive',
              danger: true,
              onConfirm: () => { archiveSubject(existing.id); toast('Subject archived. Restore it anytime from the Library.'); },
            });
          } }, 'Archive')
        : h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          const n = name.value.trim();
          if (!n) { toast('Give the subject a name.'); return; }
          if (existing) {
            updateSubject(existing.id, {
              name: n,
              code: code.value.trim() || undefined,
              description: description.value.trim() || undefined,
              goal: goal.value.trim() || undefined,
              exam: examDate.value ? { date: examDate.value } : undefined,
            });
            toast('Subject updated.');
          } else {
            createSubject({
              name: n,
              code: code.value.trim() || undefined,
              description: description.value.trim() || undefined,
              goal: goal.value.trim() || undefined,
              examDate: examDate.value || undefined,
            });
            toast('Subject created. Now add concepts — or import notes.');
          }
          closeDialog();
        },
      }, existing ? 'Save' : 'Create'),
    ],
  });
}

/* ================= subject detail ================= */

export function viewSubject(c: Ctx): Node[] {
  const id = currentRoute().params.id;
  const db = store.get();
  const subject = db.subjects.find((s) => s.id === id);
  if (!subject) {
    return [emptyState({ glyph: '◫', title: 'Subject not found', body: 'It may have been archived or removed.', actions: [btn('Back to subjects', { run: () => c.nav('learn') })] })];
  }
  const concepts = db.concepts.filter((x) => x.subjectId === subject.id);
  const topics = db.topics.filter((t) => t.subjectId === subject.id).sort((a, b) => a.position - b.position);
  const r = readiness(concepts, db.review, db.attempts);
  const due = dueCount(db, subject.id);
  const examDays = subject.exam ? daysUntil(subject.exam.date) : undefined;

  const actions: Node[] = [];
  if (concepts.length) {
    actions.push(
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openSessionSetup({ subjectId: subject.id }) }, icon('play', 16), 'Study this'),
      h('button', { class: 'btn', type: 'button', onclick: () => openExamSetup(subject.id) }, 'Practice exam'),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', aria: { label: 'Edit subject' }, onclick: () => openSubjectEditor(subject.id) }, icon('edit', 16)),
    );
  } else {
    actions.push(
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openConceptEditor({ subjectId: subject.id }) }, icon('plus', 16), 'Add a concept'),
      h('button', { class: 'btn', type: 'button', onclick: () => c.nav('library') }, 'Import notes'),
    );
  }

  // readiness panel
  const readyPanel = h('section', {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-lg)',
      padding: 'var(--space-5)',
      display: 'flex',
      gap: 'var(--space-5)',
      alignItems: 'center',
      flexWrap: 'wrap',
    } as Partial<CSSStyleDeclaration>,
  });
  appendNodes(readyPanel,
    ring(concepts.length ? r.percent / 100 : 0, 76, { stroke: 7, label: concepts.length ? `${r.percent}%` : '—' }),
    h('div', { class: 'grow', style: { minWidth: '240px' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'page-kicker' }, 'Exam readiness'),
      h('h2', { style: { fontSize: '20px', margin: '2px 0 4px' } as Partial<CSSStyleDeclaration> }, r.verdict),
      h('p', { class: 'small muted' }, r.advice),
      concepts.length
        ? h('div', { class: 'mt-2' }, bar(r.percent / 100))
        : null,
    ),
    h('div', { style: { display: 'flex', gap: 'var(--space-5)', textAlign: 'left' } as Partial<CSSStyleDeclaration> },
      statBlock(`${r.mastered}/${r.total}`, 'mastered'),
      subject.exam && examDays !== undefined && examDays >= 0
        ? statBlock(examDays === 0 ? 'today' : `${examDays}d`, 'until exam', true)
        : null,
      statBlock(String(due), 'due now'),
    ),
  );

  const nodes: Node[] = [
    h('div', { class: 'page-kicker' }, subject.code ?? 'Subject'),
    h('div', { class: 'split', style: { alignItems: 'flex-end', marginBottom: 'var(--space-1)' } as Partial<CSSStyleDeclaration> },
      h('h1', { class: 'page-title', style: { fontSize: '30px' } as Partial<CSSStyleDeclaration> }, subject.name),
      h('div', { class: 'btn-row' }, actions),
    ),
    ...(subject.goal ? [h('p', { class: 'page-sub' }, `Working toward: ${subject.goal}`)] : []),
    h('div', { class: 'mt-4' }, readyPanel),
  ];

  // topics + concepts
  if (!concepts.length) {
    nodes.push(
      emptyState({
        glyph: '❡',
        title: 'This subject has no concepts yet',
        body: 'A concept is a single idea you can explain — with cards, questions, and notes attached. Add your first one, or import a batch.',
        actions: [
          btn('Add a concept', { kind: 'primary', iconName: 'plus', run: () => openConceptEditor({ subjectId: subject.id }) }),
          btn('Import from notes', { run: () => c.nav('library') }),
        ],
      }),
    );
    return nodes;
  }

  const topicMap = new Map<string, Topic[]>();
  for (const t of topics) topicMap.set(t.id, [t]);
  const conceptRows = (list: Concept[]) =>
    list.map((concept) => {
      const info = computeMastery(concept, db.attempts, db.review[concept.id]);
      const rState = db.review[concept.id];
      const dueLabel = rState ? (new Date(rState.dueAt).getTime() <= Date.now() ? 'due' : '') : 'new';
      return h('button', {
        class: 'row',
        type: 'button',
        onclick: () => c.nav('concept', { id: concept.id }),
      },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, concept.name),
          h('div', { class: 'row-sub' }, concept.summary),
        ),
        h('div', { class: 'row-side' },
          dueLabel === 'due' ? h('span', { class: 'chip berry tiny' }, 'due') : dueLabel === 'new' ? h('span', { class: 'chip tiny' }, 'new') : null,
          h('span', { class: 'chip tiny' }, `${concept.flashcards.length + concept.questions.length} items`),
          stageChip(concept, info),
        ),
      );
    });

  const grouped = new Map<string | undefined, Concept[]>();
  for (const concept of concepts) {
    const key = concept.topicId ?? 'ungrouped';
    const arr = grouped.get(key) ?? [];
    arr.push(concept);
    grouped.set(key, arr);
  }
  const orderedKeys = [...topics.map((t) => t.id), 'ungrouped'].filter((k) => grouped.has(k));

  for (const key of orderedKeys) {
    const list = grouped.get(key)!;
    const topic = key === 'ungrouped' ? undefined : topics.find((t) => t.id === key);
    nodes.push(
      sectionLabel(
        topic?.name ?? 'Other concepts',
        { label: 'Add', run: () => openConceptEditor({ subjectId: subject.id, topicId: topic?.id }) },
      ),
      h('div', {}, conceptRows(list)),
    );
  }

  // concept map
  if (concepts.length >= 2) {
    nodes.push(
      sectionLabel('Concept map'),
      conceptMap(c, subject, concepts, topics),
    );
  }

  nodes.push(
    h('div', { class: 'hr' }),
    h('div', { class: 'btn-row' },
      btn('Add topic', { iconName: 'plus', run: () => {
        openDialog({
          title: 'New topic',
          body: [
            field({ label: 'Topic name', control: (() => { const i = h('input', { class: 'input', placeholder: 'e.g. Cell division' }) as HTMLInputElement; return i; })() }),
          ],
          actions: [
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
              const i = document.querySelector<HTMLInputElement>('.dialog input')!;
              if (!i.value.trim()) return;
              createTopic(subject.id, i.value);
              closeDialog();
              toast('Topic added.');
            } }, 'Add topic'),
          ],
        });
      } }),
      btn('Add a concept', { kind: 'primary', iconName: 'plus', run: () => openConceptEditor({ subjectId: subject.id }) }),
      btn('Edit subject', { run: () => openSubjectEditor(subject.id) }),
    ),
  );

  return nodes;
}

function statBlock(value: string, label: string, warm = false): Node {
  return h('div', { class: 'center' },
    h('div', {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: '22px',
        fontWeight: '600',
        color: warm ? 'var(--amber-strong)' : 'var(--ink)',
      } as Partial<CSSStyleDeclaration>,
    }, value),
    h('div', { class: 'tiny subtle' }, label),
  );
}

/* ================= concept map ================= */

function conceptMap(c: Ctx, subject: { id: string; name: string }, concepts: Concept[], topics: Topic[]): HTMLElement {
  const width = 760;
  const height = 380;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('style', 'width:100%;height:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg)');
  const db = store.get();

  const cx = width / 2;
  const cy = height / 2;
  const center = hSvgCircle(svg, cx, cy, 30, 'var(--pine)', 'var(--pine-ink)', subject.name);

  const groupOrder: (string | undefined)[] = [...topics.map((t) => t.id), undefined].filter(
    (k) => concepts.some((x) => x.topicId === k),
  );
  const slotFor = (topicId: string | undefined): number => {
    const idx = groupOrder.indexOf(topicId);
    const count = Math.max(1, groupOrder.length);
    return (idx / count) * Math.PI * 2 - Math.PI / 2;
  };

  const placed = new Map<string, { x: number; y: number }>();
  for (const [i, concept] of concepts.entries()) {
    const slot = slotFor(concept.topicId);
    const inGroup = concepts.filter((x) => x.topicId === concept.topicId);
    const j = inGroup.indexOf(concept);
    const spread = Math.min(0.6, (inGroup.length - 1) * 0.12);
    const angle = slot + (j - (inGroup.length - 1) / 2) * spread;
    const radius = 150 + (i % 3) * 26;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    placed.set(concept.id, { x, y });
  }

  const used = new Set<string>();
  for (const concept of concepts) {
    const p = placed.get(concept.id)!;
    for (const rel of concept.relatedIds) {
      const other = placed.get(rel);
      if (!other) continue;
      const key = [concept.id, rel].sort().join('|');
      if (used.has(key)) continue;
      used.add(key);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(p.x));
      line.setAttribute('y1', String(p.y));
      line.setAttribute('x2', String(other.x));
      line.setAttribute('y2', String(other.y));
      line.setAttribute('stroke', 'var(--line-2)');
      line.setAttribute('stroke-width', '1.2');
      svg.appendChild(line);
    }
  }

  for (const concept of concepts) {
    const p = placed.get(concept.id)!;
    const info = computeMastery(concept, db.attempts, db.review[concept.id]);
    const color =
      info.stage === 'mastered' ? 'var(--pine)'
      : info.stage === 'proficient' || info.stage === 'developing' ? 'var(--moss)'
      : info.stage === 'new' ? 'var(--line-2)'
      : info.needsReview ? 'var(--berry)' : 'var(--amber)';
    const node = hSvgCircle(svg, p.x, p.y, 14, color, '#fff', concept.name);
    node.addEventListener('click', () => c.nav('concept', { id: concept.id }));
  }

  svg.appendChild(center);
  return h('div', { class: 'mt-1' }, svg);
}

function hSvgCircle(svg: SVGSVGElement, x: number, y: number, r: number, fill: string, textColor: string, label: string): SVGCircleElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(x));
  circle.setAttribute('cy', String(y));
  circle.setAttribute('r', String(r));
  circle.setAttribute('fill', fill);
  circle.setAttribute('stroke', 'var(--surface)');
  circle.setAttribute('stroke-width', '2');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y + 4));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '11');
  text.setAttribute('font-family', 'var(--font-ui)');
  text.setAttribute('fill', textColor);
  text.textContent = label.length > 22 ? label.slice(0, 21) + '…' : label;
  g.append(circle, text);
  svg.appendChild(g);
  return circle;
}

/* ================= concept detail ================= */

export function viewConcept(c: Ctx): Node[] {
  const id = currentRoute().params.id;
  const db = store.get();
  const concept = db.concepts.find((x) => x.id === id);
  if (!concept) {
    return [emptyState({ glyph: '❡', title: 'Concept not found', body: 'It may have been deleted.', actions: [btn('Back to Learn', { run: () => c.nav('learn') })] })];
  }
  const subject = db.subjects.find((s) => s.id === concept.subjectId);
  const info = computeMastery(concept, db.attempts, db.review[concept.id]);
  const rState = db.review[concept.id];
  const attempts = db.attempts.filter((a) => a.conceptId === concept.id).slice(-8).reverse();

  const nodes: Node[] = [
    h('div', { class: 'split', style: { alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'grow', style: { maxWidth: '640px' } as Partial<CSSStyleDeclaration> },
        h('button', { class: 'btn btn-ghost btn-sm', style: { marginLeft: '-6px', marginBottom: 'var(--space-2)' } as Partial<CSSStyleDeclaration>, type: 'button', onclick: () => subject ? c.nav('subject', { id: subject.id }) : c.nav('learn') },
          icon('arrow-left', 14), subject?.name ?? 'Subjects'),
        h('h1', { class: 'page-title', style: { fontSize: '30px' } as Partial<CSSStyleDeclaration> }, concept.name),
        h('div', { class: 'chip-btns mt-2' },
          stageChip(concept, info),
          h('span', { class: 'chip' }, rState ? `${rState.reviewCount} reviews` : 'never reviewed'),
          concept.difficulty > 1 ? h('span', { class: 'chip' }, concept.difficulty === 3 ? 'challenging' : 'moderate') : null,
          concept.origin !== 'user'
            ? h('span', { class: `chip ${concept.verifiedByUser ? 'moss' : 'gold'}` },
                concept.verifiedByUser ? 'verified' : concept.origin === 'ai' ? 'AI draft · unverified' : 'AI-reviewed')
            : null,
        ),
      ),
      h('div', { class: 'btn-row', style: { marginTop: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openCards(concept) }, icon('layers', 15), 'Cards'),
        h('button', { class: 'btn', type: 'button', onclick: () => openConceptQuestions(concept) }, icon('target', 15), 'Questions'),
        h('button', { class: 'btn', type: 'button', onclick: () => openFeynman(concept) }, icon('quote', 15), 'Explain it'),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', aria: { label: 'Edit concept' }, onclick: () => openConceptEditor({ conceptId: concept.id }) }, icon('edit', 16)),
      ),
    ),
  ];

  // Understand
  nodes.push(sectionLabel('Understand'));
  nodes.push(
    h('div', { style: { maxWidth: '720px' } as Partial<CSSStyleDeclaration> },
      h('p', { style: { fontSize: '16.5px', lineHeight: '1.65' } as Partial<CSSStyleDeclaration> }, concept.explanation || concept.summary),
      concept.example
        ? h('div', { class: 'mt-3', style: { borderLeft: '3px solid var(--pine)', paddingLeft: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'page-kicker' }, 'For example'),
            h('p', { class: 'muted', style: { lineHeight: '1.6' } as Partial<CSSStyleDeclaration> }, concept.example))
        : null,
      concept.misconception
        ? h('div', { class: 'mt-3', style: { borderLeft: '3px solid var(--amber)', paddingLeft: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'page-kicker', style: { color: 'var(--amber-strong)' } as Partial<CSSStyleDeclaration> }, 'Watch out'),
            h('p', { class: 'muted', style: { lineHeight: '1.6' } as Partial<CSSStyleDeclaration> }, concept.misconception))
        : null,
      concept.notes
        ? h('div', { class: 'mt-3' },
            h('div', { class: 'page-kicker' }, 'Your notes'),
            h('p', { class: 'muted', style: { lineHeight: '1.6', whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, concept.notes))
        : null,
    ),
  );

  // Your material
  const materialNodes: Node[] = [];
  for (const f of concept.flashcards) {
    materialNodes.push(
      h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
        icon('layers', 16),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, f.front), h('div', { class: 'row-sub' }, f.back)),
      ),
    );
  }
  for (const q of concept.questions) {
    materialNodes.push(
      h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
        icon('target', 16),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, q.prompt.length > 90 ? q.prompt.slice(0, 88) + '…' : q.prompt),
          h('div', { class: 'row-sub' }, q.kind === 'mc' ? `Answer: ${q.answer}` : q.kind === 'tf' ? `Answer: ${q.answer}` : q.kind.toUpperCase()),
        ),
      ),
    );
  }
  if (!materialNodes.length) {
    materialNodes.push(h('p', { class: 'small muted', style: { padding: 'var(--space-3) var(--space-2)' } as Partial<CSSStyleDeclaration> },
      'No cards or questions yet. Edit this concept to add material, or let StudyBuddy draft practice questions from the explanation.'));
  }
  nodes.push(sectionLabel('Your material', { label: 'Edit', run: () => openConceptEditor({ conceptId: concept.id }) }), h('div', {}, materialNodes));

  // related
  const related = concept.relatedIds.map((rid) => db.concepts.find((x) => x.id === rid)).filter((x): x is Concept => !!x);
  if (related.length) {
    nodes.push(
      sectionLabel('Related concepts'),
      h('div', { class: 'chip-btns' },
        ...related.map((r) =>
          h('button', { class: 'chip pine', type: 'button', onclick: () => c.nav('concept', { id: r.id }) }, r.name),
        ),
      ),
    );
  }

  // history
  if (attempts.length) {
    nodes.push(
      sectionLabel('Recent attempts'),
      h('div', { class: 'stack' },
        ...attempts.map((a) =>
          h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
            h('span', {
              class: 'chip',
              style: a.outcome === 'correct' ? { background: 'var(--moss-soft)', color: 'var(--moss)' } as Partial<CSSStyleDeclaration>
                : a.outcome === 'partial' ? { background: 'var(--amber-soft)', color: 'var(--amber-strong)' } as Partial<CSSStyleDeclaration>
                : { background: 'var(--berry-soft)', color: 'var(--berry)' } as Partial<CSSStyleDeclaration>,
            }, a.outcome),
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title', style: { fontSize: '13px' } as Partial<CSSStyleDeclaration> }, a.mode),
            ),
            h('span', { class: 'tiny subtle' }, fmtDateMed(a.at.slice(0, 10))),
          ),
        ),
      ),
    );
  }

  return nodes;
}

function openConceptQuestions(concept: Concept): void {
  if (!concept.questions.length) {
    toast('No questions yet — edit the concept and add or draft some.');
    openConceptEditor({ conceptId: concept.id });
    return;
  }
  openExamSetup(concept.subjectId, [concept.id]);
}

/* ================= concept editor ================= */

export function openConceptEditor(opts: { conceptId?: string; subjectId?: string; topicId?: string }): void {
  const db = store.get();
  const existing = opts.conceptId ? db.concepts.find((x) => x.id === opts.conceptId) : undefined;
  const subjectId = existing?.subjectId ?? opts.subjectId ?? db.subjects[0]?.id;
  if (!subjectId) {
    toast('Create a subject first.');
    return;
  }
  const subjects = db.subjects.filter((s) => !s.archivedAt);
  const draftQuestions: Question[] = [];

  const name = h('input', { class: 'input', placeholder: 'e.g. Cell division', value: existing?.name ?? '' }) as HTMLInputElement;
  const summary = h('input', { class: 'input', placeholder: 'One sentence a classmate could test you on', value: existing?.summary ?? '' }) as HTMLInputElement;
  const explanation = h('textarea', { class: 'textarea', rows: 4, placeholder: 'The full explanation — how it works, in your own words', value: existing?.explanation ?? '' }) as HTMLTextAreaElement;
  const example = h('input', { class: 'input', placeholder: 'A concrete example (optional)', value: existing?.example ?? '' }) as HTMLInputElement;
  const misconception = h('input', { class: 'input', placeholder: 'The mistake people usually make (optional)', value: existing?.misconception ?? '' }) as HTMLInputElement;
  const difficulty = h('select', { class: 'select', value: String(existing?.difficulty ?? 1) },
    h('option', { value: '1' }, 'Gentle'),
    h('option', { value: '2' }, 'Moderate'),
    h('option', { value: '3' }, 'Challenging'),
  ) as HTMLSelectElement;
  const subjectSelect = h('select', { class: 'select', value: subjectId },
    ...subjects.map((s) => h('option', { value: s.id, selected: s.id === subjectId }, s.name)),
  ) as HTMLSelectElement;
  const topicSelect = h('select', { class: 'select', value: existing?.topicId ?? opts.topicId ?? '' },
    h('option', { value: '' }, 'No topic'),
    ...db.topics.filter((t) => t.subjectId === subjectId).map((t) => h('option', { value: t.id, selected: t.id === (existing?.topicId ?? opts.topicId) }, t.name)),
  ) as HTMLSelectElement;

  const cardList = h('div', { class: 'stack' });
  const cardRows: { front: HTMLInputElement; back: HTMLInputElement }[] = [];
  const renderCards = (cards: { front: string; back: string }[]) => {
    cardRows.length = 0;
    mount(cardList, []);
    for (const card of cards.length ? cards : [{ front: '', back: '' }]) {
      const front = h('input', { class: 'input', placeholder: 'Front — the prompt', value: card.front }) as HTMLInputElement;
      const back = h('input', { class: 'input', placeholder: 'Back — the answer', value: card.back }) as HTMLInputElement;
      cardRows.push({ front, back });
      cardList.appendChild(h('div', { class: 'field-row' }, front, back));
    }
  };
  renderCards(existing?.flashcards.map((f) => ({ front: f.front, back: f.back })) ?? []);

  // related concepts — local draft set, applied only on save
  const draftRelated = new Set<string>(existing?.relatedIds ?? []);
  const relatedChips = h('div', { class: 'chip-btns' });
  const relatedPool = db.concepts.filter((x) => x.id !== existing?.id && x.subjectId === subjectId);
  const renderRelated = () => {
    mount(relatedChips, []);
    for (const r of relatedPool) {
      const on = draftRelated.has(r.id);
      relatedChips.appendChild(
        h('button', { class: `chip ${on ? 'pine' : ''}`, type: 'button', onclick: () => {
          on ? draftRelated.delete(r.id) : draftRelated.add(r.id);
          renderRelated();
        } }, r.name),
      );
    }
  };
  renderRelated();

  const aiButton = h('button', {
    class: 'btn',
    type: 'button',
    onclick: () => {
      const settings = store.get().settings;
      const n = name.value.trim();
      if (!n) { toast('Name the concept first.'); return; }
      aiButton.disabled = true;
      aiButton.textContent = 'Drafting…';
      aiDraftConcept(settings, n, subjects.find((s) => s.id === subjectSelect.value)?.name ?? '', summary.value)
        .then((draft) => {
          summary.value = draft.summary;
          explanation.value = draft.explanation;
          example.value = draft.example ?? '';
          misconception.value = draft.misconception ?? '';
          renderCards(draft.flashcards);
          toast('AI draft filled in — check every line before you save. AI can be wrong.');
        })
        .catch((e: Error) => toast(e.message))
        .finally(() => {
          aiButton.disabled = false;
          aiButton.textContent = 'Draft with AI';
        });
    },
  },
    icon('wand', 15), 'Draft with AI',
  );

  openDialog({
    title: existing ? `Edit “${existing.name}”` : 'New concept',
    wide: true,
    body: [
      field({ label: 'Name', control: name }),
      field({ label: 'Summary', hint: 'the testable one-liner', control: summary }),
      field({ label: 'Explanation', hint: 'how it actually works', control: explanation }),
      h('div', { class: 'field-row' },
        field({ label: 'Example', control: example }),
        field({ label: 'Common misconception', control: misconception }),
      ),
      h('div', { class: 'field-row' },
        field({ label: 'Subject', control: subjectSelect }),
        field({ label: 'Topic', control: topicSelect }),
        field({ label: 'Difficulty', control: difficulty }),
      ),
      h('div', { class: 'label' }, 'Flashcards', h('span', { class: 'hint' }, ' · prompt on the front, answer on the back')),
      cardList,
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
        const front = h('input', { class: 'input', placeholder: 'Front' }) as HTMLInputElement;
        const back = h('input', { class: 'input', placeholder: 'Back' }) as HTMLInputElement;
        cardRows.push({ front, back });
        cardList.appendChild(h('div', { class: 'field-row' }, front, back));
      } }, icon('plus', 14), 'Add card'),
      h('div', { class: 'mt-4' },
        h('div', { class: 'label' }, 'Related concepts', h('span', { class: 'hint' }, ' · tap to link')),
        relatedChips,
      ),
      h('div', { class: 'hr soft' }),
      h('div', { class: 'btn-row' }, aiButton,
        h('button', { class: 'btn', type: 'button', onclick: () => {
          const n = name.value.trim();
          const exp = explanation.value.trim();
          if (!n || !exp) { toast('Add a name and explanation first — questions are built from them.'); return; }
          const temp: Concept = {
            id: existing?.id ?? 'temp',
            subjectId: subjectSelect.value,
            name: n,
            summary: summary.value.trim() || exp.slice(0, 120),
            explanation: exp,
            example: example.value.trim() || undefined,
            misconception: misconception.value.trim() || undefined,
            relatedIds: [],
            resources: [],
            flashcards: [],
            questions: [],
            difficulty: Number(difficulty.value) as Difficulty,
            origin: existing?.origin ?? 'user',
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const siblings = db.concepts.filter((x) => x.subjectId === temp.subjectId && x.id !== existing?.id);
          draftQuestions.push(...buildLocalQuestions(temp, siblings));
          toast(`Drafted ${draftQuestions.length} practice question${draftQuestions.length === 1 ? '' : 's'} — saved with the concept.`);
        } }, icon('target', 15), 'Draft practice questions'),
      ),
    ],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          const n = name.value.trim();
          if (!n) { toast('Give the concept a name.'); return; }
          const base = {
            name: n,
            summary: summary.value.trim() || name.value.trim(),
            explanation: explanation.value.trim() || summary.value.trim() || name.value.trim(),
            example: example.value.trim() || undefined,
            misconception: misconception.value.trim() || undefined,
            difficulty: Number(difficulty.value) as Difficulty,
          };
          const newCards = cardRows.filter((r) => r.front.value.trim()).map((r) => ({ front: r.front.value.trim(), back: r.back.value.trim() || '—' }));
          if (existing) {
            updateConcept(existing.id, base);
            replaceFlashcards(existing.id, newCards);
            setRelated(existing.id, [...draftRelated]);
            if (draftQuestions.length) addQuestions(existing.id, draftQuestions);
            toast('Concept saved.');
          } else {
            const created = createConcept({
              subjectId: subjectSelect.value,
              topicId: topicSelect.value || undefined,
              ...base,
            });
            addFlashcards(created.id, newCards);
            setRelated(created.id, [...draftRelated]);
            if (draftQuestions.length) addQuestions(created.id, draftQuestions);
            toast('Concept created.');
          }
          closeDialog();
        },
      }, 'Save concept'),
    ],
  });
}

registerQuickAction({
  id: 'new-concept',
  label: 'Create a concept',
  icon: 'plus',
  run: () => openConceptEditor({}),
});
