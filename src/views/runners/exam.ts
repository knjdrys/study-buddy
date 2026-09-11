/**
 * Exam runner — focus during, explanation after.
 * The paper is built by the Smart Question Engine: definition-based
 * distractors (never a list of terms), four cognitive levels, and a
 * question mode the learner chooses before starting. Every answer records
 * a confidence judgment and — on wrong multiple-choice picks — WHICH
 * concept's definition fooled them, so the brain can adapt next time.
 */

import { h, mount } from '../../lib/h';
import { icon } from '../../lib/icons';
import { store } from '../../app/state';
import { recordAttempt, recordExam } from '../../app/actions';
import {
  planQuestions,
  MODE_LABELS,
  MODE_HINTS,
  type BrainQuestion,
  type QuestionMode,
} from '../../engine/questionbrain';
import { analyzeFeynman } from '../../engine/analysis';
import { openDialog, closeDialog, openOverlay, closeOverlay, toast } from '../../app/ui';
import { readiness } from '../../engine/readiness';
import { openSessionSetup } from './session';
import { shuffle } from '../../lib/util';
import type { Concept } from '../../domain/types';

interface ExamItem {
  concept: Concept;
  question: BrainQuestion;
}

export function openExamSetup(
  subjectId?: string,
  conceptIds?: string[],
  presetScope: 'all' | 'due' | 'weak' = 'all',
  presetMode: QuestionMode = 'auto',
): void {
  const db = store.get();
  if (!db.concepts.length) {
    toast('Add concepts before taking an exam.');
    return;
  }
  const subjectSelect = h('select', { class: 'select', value: subjectId ?? db.subjects[0]?.id ?? '' },
    ...db.subjects.filter((s) => !s.archivedAt).map((s) => h('option', { value: s.id, selected: s.id === subjectId }, s.name)),
  ) as HTMLSelectElement;
  const scopeSelect = h('select', { class: 'select', value: presetScope },
    h('option', { value: 'all' }, 'Everything'),
    h('option', { value: 'due' }, 'Due concepts only'),
    h('option', { value: 'weak' }, 'Weakest concepts'),
  ) as HTMLSelectElement;
  const lengthSelect = h('select', { class: 'select', value: '10' },
    h('option', { value: '10' }, '10 questions'),
    h('option', { value: '20' }, '20 questions'),
    h('option', { value: 'all' }, 'Everything available'),
  ) as HTMLSelectElement;

  let mode: QuestionMode = presetMode;
  const modeChips = h('div', { class: 'mode-grid' });
  const modeHint = h('p', { class: 'tiny subtle', style: { minHeight: '16px', marginTop: 'var(--space-2)' } as Partial<CSSStyleDeclaration> });

  const renderModes = () => {
    mount(modeChips, [
      ...(Object.keys(MODE_LABELS) as QuestionMode[]).map((m) =>
        h('button', {
          class: `mode-chip ${mode === m ? 'on' : ''}`,
          type: 'button',
          aria: { pressed: mode === m },
          onclick: () => { mode = m; renderModes(); },
        },
          icon(MODE_ICON[m], 15),
          MODE_LABELS[m],
        ),
      ),
    ]);
    modeHint.textContent = MODE_HINTS[mode];
  };
  renderModes();

  openDialog({
    title: 'Set up a practice exam',
    wide: true,
    body: [
      h('div', { class: 'field-row' },
        field('Subject', subjectSelect),
        field('Scope', scopeSelect),
        field('Length', lengthSelect),
      ),
      field({ label: 'Question mode', hint: 'how your knowledge gets tested', control: modeChips }),
      modeHint,
      h('p', { class: 'tiny subtle' },
        'Questions are generated from your concepts\u2019 actual definitions and adapt to your answer history. Wrong multiple-choice picks are tracked, so StudyBuddy learns which concepts you mix up.'),
    ],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          closeDialog();
          runExam(subjectSelect.value, scopeSelect.value, lengthSelect.value, conceptIds, mode);
        },
      }, icon('target', 15), 'Begin'),
    ],
  });
}

const MODE_ICON: Record<QuestionMode, string> = {
  auto: 'sparkle',
  mc: 'list',
  identify: 'tag',
  tf: 'check',
  fill: 'edit',
  match: 'grid',
  short: 'text',
  scenario: 'layers',
};

function field(label: string, control: Node): Node;
function field(opts: { label: string; hint?: string; control: Node }): Node;
function field(a: string | { label: string; hint?: string; control: Node }, c?: Node): Node {
  const label = typeof a === 'string' ? a : a.label;
  const hint = typeof a === 'string' ? undefined : a.hint;
  const control = typeof a === 'string' ? c! : a.control;
  return h('div', { class: 'field' },
    h('label', { class: 'label' }, label, hint ? h('span', { class: 'hint' }, ` · ${hint}`) : null),
    control,
  );
}

function buildItems(subjectId: string, scope: string, length: string, conceptIds: string[] | undefined, mode: QuestionMode): ExamItem[] {
  const db = store.get();
  let conceptIdsFiltered = conceptIds?.length ? conceptIds : undefined;

  let pool = db.concepts.filter((c) => c.subjectId === subjectId);
  if (conceptIdsFiltered) pool = pool.filter((c) => conceptIdsFiltered!.includes(c.id));
  if (scope === 'due') {
    const now = Date.now();
    const due = pool.filter((c) => {
      const r = db.review[c.id];
      return !r || new Date(r.dueAt).getTime() <= now;
    });
    if (due.length) pool = due;
  }
  if (scope === 'weak') {
    const scored = pool
      .map((c) => ({
        c,
        acc: (() => {
          const ats = db.attempts.filter((a) => a.conceptId === c.id).slice(-5);
          if (!ats.length) return 0;
          return ats.reduce((s, a) => s + (a.outcome === 'correct' ? 1 : a.outcome === 'partial' ? 0.5 : 0), 0) / ats.length;
        })(),
      }))
      .sort((a, b) => a.acc - b.acc);
    pool = scored.slice(0, Math.max(3, Math.ceil(pool.length / 2))).map((x) => x.c);
  }
  if (!pool.length) pool = db.concepts.filter((c) => c.subjectId === subjectId);

  const count = length === 'all' ? Math.max(pool.length * 2, 10) : Number(length);
  const questions = planQuestions(db, {
    subjectId,
    conceptIds: pool.map((c) => c.id),
    count,
    mode,
  });

  return questions
    .map((question) => {
      const concept = db.concepts.find((c) => c.id === question.conceptId);
      return concept ? { concept, question } : null;
    })
    .filter((x): x is ExamItem => !!x);
}

function runExam(subjectId: string, scope: string, length: string, conceptIds: string[] | undefined, mode: QuestionMode): void {
  const db = store.get();
  const subject = db.subjects.find((s) => s.id === subjectId);
  const items = buildItems(subjectId, scope, length, conceptIds, mode);
  if (!items.length) {
    toast('No questions available for that selection.');
    return;
  }

  let idx = 0;
  let correct = 0;
  const recordedAttempts: string[] = [];
  const perConcept = new Map<string, { total: number; correct: number }>();
  const confidenceMismatch = new Map<string, { certain: number; wrongCertain: number }>();
  const confusionCounts = new Map<string, number>();

  const root = h('div', {
    style: { maxWidth: '720px', margin: '0 auto', width: '100%', padding: 'var(--space-6) var(--space-4) var(--space-9)' } as Partial<CSSStyleDeclaration>,
  });
  const progressBar = h('div', { class: 'runner-progress' }, h('span', { style: { width: '0%' } as Partial<CSSStyleDeclaration> }));
  const meta = h('div', { class: 'runner-meta' },
    h('span', {}, subject?.name ?? 'Practice exam'),
    h('span', { class: 'num' }, ''),
  );
  const body = h('div', { class: 'view-enter' });

  const questionLabel = (q: BrainQuestion): string =>
    q.kind === 'identify' ? 'Identification'
      : q.kind === 'fill' ? 'Fill the blank'
        : q.kind === 'match' ? 'Matching'
          : q.kind === 'short' ? 'Short answer'
            : q.kind === 'scenario' ? 'Scenario'
              : q.kind === 'tf' ? 'True or false'
                : 'Multiple choice';

  function render(): void {
    mount(body, []);
    (progressBar.firstElementChild as HTMLElement).style.width = `${Math.round((idx / items.length) * 100)}%`;
    meta.replaceChildren(
      h('span', {}, subject?.name ?? 'Practice exam'),
      h('span', { class: 'num' }, `Question ${Math.min(idx + 1, items.length)} of ${items.length}`),
    );
    if (idx >= items.length) return renderResults();
    const item = items[idx]!;
    const q = item.question;

    const answer = (correctAns: boolean, confidence: 0 | 1 | 2, elapsedMs: number, distractorConceptId?: string) => {
      const rec = perConcept.get(item.concept.id) ?? { total: 0, correct: 0 };
      rec.total++;
      if (correctAns) {
        rec.correct++;
        correct++;
      }
      perConcept.set(item.concept.id, rec);
      if (confidence === 2) {
        const cm = confidenceMismatch.get(item.concept.id) ?? { certain: 0, wrongCertain: 0 };
        cm.certain++;
        if (!correctAns) cm.wrongCertain++;
        confidenceMismatch.set(item.concept.id, cm);
      }
      if (distractorConceptId) {
        confusionCounts.set(distractorConceptId, (confusionCounts.get(distractorConceptId) ?? 0) + 1);
      }
      const attemptId = recordAttempt({
        conceptId: item.concept.id,
        mode: q.kind === 'scenario' ? 'scenario' : q.kind === 'identify' ? 'identify' : q.kind === 'fill' ? 'fill' : q.kind === 'match' ? 'match' : q.kind === 'short' ? 'short' : q.kind === 'tf' ? 'tf' : 'mc',
        outcome: correctAns ? 'correct' : 'incorrect',
        confidence,
        elapsedMs,
        distractorConceptId,
      });
      recordedAttempts.push(attemptId);
      idx++;
      render();
    };

    const confidenceRow = (correctAns: boolean, elapsedMs: number, distractorConceptId?: string) =>
      h('div', { class: 'mt-3' },
        h('div', { class: 'page-kicker' }, 'How sure were you?'),
        h('div', { class: 'btn-row mt-1' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => answer(correctAns, 0, elapsedMs, distractorConceptId) }, 'Guessed'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => answer(correctAns, 1, elapsedMs, distractorConceptId) }, 'Fairly sure'),
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => answer(correctAns, 2, elapsedMs, distractorConceptId) }, 'Certain'),
        ),
      );

    const started = Date.now();

    if (q.kind === 'match' && q.pairs) {
      renderMatch(q, confidenceRow, started);
      return;
    }
    if (q.kind === 'short') {
      renderShort(q, confidenceRow, started);
      return;
    }
    if (q.kind === 'identify' || q.kind === 'fill') {
      renderIdentifyOrFill(q, confidenceRow, started);
      return;
    }
    if (q.kind === 'mc' || q.kind === 'scenario') {
      const opts = shuffle([...(q.options ?? [])]);
      body.appendChild(
        h('div', { class: 'stack' },
          h('div', { class: 'runner-meta', style: { marginBottom: '8px' } as Partial<CSSStyleDeclaration> },
            h('span', { class: 'chip slate', style: { fontSize: '10.5px' } as Partial<CSSStyleDeclaration> }, questionLabel(q)),
          ),
          h('p', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1.5', whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, q.prompt),
          ...opts.map((o) =>
            h('button', { class: 'opt', type: 'button', onclick: (e: Event) => {
              const t = e.target as HTMLElement;
              t.classList.add('picked');
              const ok = o === q.answer;
              const distractorConceptId = !ok
                ? q.distractorConceptIds[opts.indexOf(o)] ?? undefined
                : undefined;
              setTimeout(() => {
                t.classList.remove('picked');
                t.classList.add(ok ? 'right' : 'wrong');
                mount(body, []);
                renderRevealed(ok, q, confidenceRow(ok, Date.now() - started, distractorConceptId));
              }, 350);
            } }, o),
          ),
        ),
      );
      return;
    }
    if (q.kind === 'tf') {
      body.appendChild(
        h('div', { class: 'stack' },
          h('div', { class: 'runner-meta', style: { marginBottom: '8px' } as Partial<CSSStyleDeclaration> },
            h('span', { class: 'chip slate', style: { fontSize: '10.5px' } as Partial<CSSStyleDeclaration> }, questionLabel(q)),
          ),
          h('p', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1.5' } as Partial<CSSStyleDeclaration> }, q.prompt),
          ...['True', 'False'].map((o) =>
            h('button', { class: 'opt', type: 'button', onclick: () => {
              const ok = o === q.answer;
              renderRevealed(ok, q, confidenceRow(ok, Date.now() - started, !ok && q.distractorConceptIds[0] ? q.distractorConceptIds[0] : undefined));
            } }, o),
          ),
        ),
      );
      return;
    }
    // user-authored typed / fallback: free text
    const input = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Your answer…' }) as HTMLTextAreaElement;
    body.appendChild(
      h('div', { class: 'stack' },
        h('p', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1.5' } as Partial<CSSStyleDeclaration> }, q.prompt),
        input,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
            const mine = input.value.trim().toLowerCase();
            const target = q.answer.trim().toLowerCase();
            const ok = mine.length > 0 && (mine.includes(target.slice(0, Math.min(40, target.length))) || target.includes(mine.slice(0, Math.min(40, mine.length))) || mine === target);
            renderRevealed(ok, q, confidenceRow(ok, Date.now() - started));
          } }, 'Check'),
        ),
      ),
    );
  }

  function renderIdentifyOrFill(
    q: BrainQuestion,
    confidenceRow: (ok: boolean, elapsedMs: number, distractorConceptId?: string) => Node,
    started: number,
  ): void {
    let usedChoices = false;
    const grade = (ok: boolean, distractorConceptId?: string) => {
      renderRevealed(ok, q, confidenceRow(ok, Date.now() - started, distractorConceptId));
    };
    const typed = h('input', { class: 'input', type: 'text', placeholder: 'Type the term…', style: { maxWidth: '420px' } as Partial<CSSStyleDeclaration> }) as HTMLInputElement;
    typed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const mine = typed.value.trim().toLowerCase();
        const target = q.answer.trim().toLowerCase();
        grade(mine.length > 0 && (target.includes(mine) || mine.includes(target)));
      }
    });
    const chooseList = h('div', { class: 'btn-row' });
    const showChoices = () => {
      usedChoices = true;
      mount(chooseList, [
        ...shuffle([...(q.options ?? [])]).map((o) => {
          const ok = o === q.answer;
          return h('button', {
            class: 'chip',
            type: 'button',
            onclick: () => grade(ok, !ok ? q.distractorConceptIds[(q.options ?? []).indexOf(o)] ?? undefined : undefined),
          }, ok ? '✓' : '', o);
        }),
      ]);
    };
    body.appendChild(
      h('div', { class: 'stack' },
        h('div', { class: 'runner-meta', style: { marginBottom: '8px' } as Partial<CSSStyleDeclaration> },
          h('span', { class: 'chip slate', style: { fontSize: '10.5px' } as Partial<CSSStyleDeclaration> }, questionLabel(q)),
        ),
        h('p', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1.5' } as Partial<CSSStyleDeclaration> }, q.prompt),
        q.kind === 'fill'
          ? h('div', {
              style: {
                fontSize: '17px', lineHeight: '1.7', background: 'var(--surface-2)',
                padding: 'var(--space-4)', borderRadius: 'var(--r-md)',
                border: '1px solid var(--line)',
              } as Partial<CSSStyleDeclaration>,
            }, q.clue ?? q.prompt)
          : h('div', {
              style: {
                fontSize: '15.5px', lineHeight: '1.6', background: 'var(--surface-2)',
                padding: 'var(--space-4)', borderRadius: 'var(--r-md)',
                border: '1px solid var(--line)', color: 'var(--ink-2)',
              } as Partial<CSSStyleDeclaration>,
            }, `“${q.clue ?? q.answer}”`),
        typed,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
            const mine = typed.value.trim().toLowerCase();
            const target = q.answer.trim().toLowerCase();
            grade(mine.length > 0 && (target.includes(mine) || mine.includes(target)));
          } }, 'Check'),
          !usedChoices
            ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: showChoices }, 'Show term choices instead')
            : null,
        ),
        chooseList,
      ),
    );
  }

  function renderShort(
    q: BrainQuestion,
    confidenceRow: (ok: boolean, elapsedMs: number, distractorConceptId?: string) => Node,
    started: number,
  ): void {
    const input = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Explain in your own words…' }) as HTMLTextAreaElement;
    const resultBox = h('div', {});
    let checked = false;
    const check = () => {
      const text = input.value.trim();
      if (!text) { toast('Write something first — even a rough try.'); return; }
      checked = true;
      const concept = db.concepts.find((c) => c.id === q.conceptId);
      const fb = q.expectedTerms?.length && concept
        ? analyzeFeynman(concept, text)
        : null;
      const pct = fb ? Math.round(fb.coverage * 100) : 0;
      mount(resultBox, [
        h('div', { class: 'stack' },
          h('div', { style: { borderLeft: '3px solid var(--slate)', padding: 'var(--space-3) var(--space-4)', background: 'var(--slate-soft)', borderRadius: 'var(--r-sm)' } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'page-kicker', style: { color: 'var(--slate)' } as Partial<CSSStyleDeclaration> }, 'The answer'),
            h('p', { class: 'small', style: { whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, q.answer),
          ),
          fb
            ? h('div', { class: 'mt-2' },
                h('div', { class: 'split', style: { alignItems: 'center' } as Partial<CSSStyleDeclaration> },
                  h('span', { class: 'tiny subtle' }, `Coverage of the concept's explanation: ${pct}%`),
                  h('span', { class: 'tiny subtle' }, fb.missingPoints.slice(0, 2).map((t) => t.length > 58 ? t.slice(0, 58) + '…' : t).join(' · ')),
                ),
                h('div', { class: 'bar mt-1', style: { background: 'var(--line)' } as Partial<CSSStyleDeclaration> },
                  h('span', { style: { width: `${Math.min(100, pct)}%`, background: pct >= 60 ? 'var(--moss)' : 'var(--amber)' } as Partial<CSSStyleDeclaration> }),
                ),
              )
            : null,
          h('div', { class: 'mt-2' },
            h('div', { class: 'page-kicker' }, 'Be honest — it drives the schedule'),
            confidenceRow(pct >= 60, Date.now() - started),
          ),
        ),
      ]);
    };
    body.appendChild(
      h('div', { class: 'stack' },
        h('div', { class: 'runner-meta', style: { marginBottom: '8px' } as Partial<CSSStyleDeclaration> },
          h('span', { class: 'chip slate', style: { fontSize: '10.5px' } as Partial<CSSStyleDeclaration> }, questionLabel(q)),
        ),
        h('p', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1.5' } as Partial<CSSStyleDeclaration> }, q.prompt),
        input,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', type: 'button', disabled: checked, onclick: check }, icon('check', 15), 'Compare with the answer'),
        ),
        resultBox,
      ),
    );
  }

  function renderMatch(
    q: BrainQuestion,
    confidenceRow: (ok: boolean, elapsedMs: number, distractorConceptId?: string) => Node,
    started: number,
  ): void {
    const pairs = q.pairs ?? [];
    const leftCol = h('div', { class: 'stack' });
    const rightCol = h('div', { class: 'stack' });
    const leftTerms = shuffle(pairs.map((p) => p.term));
    const rightDefs = shuffle(pairs.map((p) => p.definition));
    const done = new Set<string>();
    let selected: string | null = null;
    let wrongFlash: string | null = null;
    let complete = 0;
    const attemptsPerPair = new Map<string, number>();

    const pairForTerm = (term: string) => pairs.find((p) => p.term === term)!;
    const pairForDef = (def: string) => pairs.find((p) => p.definition === def)!;

    const rerender = () => {
      mount(leftCol, [
        ...leftTerms.map((term) => {
          const locked = done.has(term);
          return h('button', {
            class: `opt ${locked ? 'right' : ''} ${selected === term ? 'picked' : ''} ${wrongFlash === term ? 'wrong' : ''}`,
            type: 'button',
            disabled: locked,
            onclick: () => { selected = selected === term ? null : term; wrongFlash = null; rerender(); },
            style: { marginTop: '0', marginBottom: 'var(--space-2)', textAlign: 'center' } as Partial<CSSStyleDeclaration>,
          }, term);
        }),
      ]);
      mount(rightCol, [
        ...rightDefs.map((def) => {
          const locked = done.has(pairForDef(def).term);
          return h('button', {
            class: `opt match-def ${locked ? 'right' : ''} ${wrongFlash === def ? 'wrong' : ''}`,
            type: 'button',
            disabled: locked,
            onclick: () => {
              if (!selected) { toast('Pick a term first.'); return; }
              const termPair = pairForTerm(selected);
              const defPair = pairForDef(def);
              const ok = termPair.conceptId === defPair.conceptId;
              const tries = attemptsPerPair.get(termPair.conceptId) ?? 0;
              attemptsPerPair.set(termPair.conceptId, tries + 1);
              if (ok) {
                done.add(selected);
                complete++;
                recordAttempt({
                  conceptId: termPair.conceptId,
                  mode: 'match',
                  outcome: tries === 0 ? 'correct' : 'partial',
                  confidence: 2,
                  elapsedMs: Math.min(Date.now() - started, 240000),
                });
                selected = null;
                wrongFlash = null;
              } else {
                wrongFlash = def;
                selected = null;
                setTimeout(() => { wrongFlash = null; rerender(); }, 450);
              }
              if (complete === pairs.length) {
                renderRevealed(true, q, confidenceRow(true, Date.now() - started));
                return;
              }
              rerender();
            },
            style: {
              marginTop: '0', marginBottom: 'var(--space-2)', textAlign: 'left',
              fontSize: '13px', lineHeight: '1.4',
            } as Partial<CSSStyleDeclaration>,
          }, def);
        }),
      ]);
    };
    rerender();

    body.appendChild(
      h('div', { class: 'stack' },
        h('div', { class: 'runner-meta', style: { marginBottom: '8px' } as Partial<CSSStyleDeclaration> },
          h('span', { class: 'chip slate', style: { fontSize: '10.5px' } as Partial<CSSStyleDeclaration> }, questionLabel(q)),
        ),
        h('p', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1.5' } as Partial<CSSStyleDeclaration> }, q.prompt),
        h('p', { class: 'tiny subtle' }, `${pairs.length} pairs — tap a term, then its definition.`),
        h('div', { class: 'match-grid' }, leftCol, rightCol),
      ),
    );
  }

  function renderRevealed(ok: boolean, q: BrainQuestion, next: Node): void {
    mount(body, [
      h('div', { class: 'stack' },
        h('p', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1.5', whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, q.prompt),
        h('div', {
          style: {
            borderLeft: `3px solid ${ok ? 'var(--moss)' : 'var(--berry)'}`,
            padding: 'var(--space-3) var(--space-4)',
            background: ok ? 'var(--moss-soft)' : 'var(--berry-soft)',
            borderRadius: 'var(--r-sm)',
          } as Partial<CSSStyleDeclaration>,
        },
          h('div', { class: 'page-kicker', style: { color: ok ? 'var(--moss)' : 'var(--berry)' } as Partial<CSSStyleDeclaration> }, ok ? 'Correct' : 'Not quite'),
          h('p', { class: 'small', style: { whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, ok ? q.answer : `Answer: ${q.answer}`),
          q.explanation ? h('p', { class: 'tiny subtle mt-1' }, q.explanation) : null,
        ),
        next,
      ),
    ]);
  }

  function renderResults(): void {
    (progressBar.firstElementChild as HTMLElement).style.width = '100%';
    meta.replaceChildren(h('span', {}, subject?.name ?? 'Practice exam'), h('span', { class: 'num' }, 'results'));
    recordExam(subjectId, recordedAttempts, correct);
    const score = Math.round((correct / items.length) * 100);

    const sorted = [...perConcept.entries()]
      .map(([id, rec]) => ({
        concept: db.concepts.find((c) => c.id === id)!,
        accuracy: rec.correct / rec.total,
        total: rec.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
    const weak = sorted.filter((x) => x.accuracy < 0.6);
    const strong = sorted.filter((x) => x.accuracy === 1).slice(0, 4);
    const misconceptions = weak.map((x) => x.concept).filter((c) => c.misconception);

    const mismatched = [...confidenceMismatch.entries()]
      .filter(([, cm]) => cm.certain >= 2 && cm.wrongCertain / cm.certain >= 0.5)
      .map(([id]) => db.concepts.find((c) => c.id === id))
      .filter((c): c is Concept => !!c);

    const mixups = [...confusionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([distractorId]) => {
        const confused = db.concepts.find((c) => c.id === distractorId);
        return confused;
      })
      .filter((c): c is Concept => !!c);

    const subjectConcepts = db.concepts.filter((c) => c.subjectId === subjectId);
    const r = readiness(subjectConcepts, db.review, db.attempts);

    mount(body, [
      h('div', { class: 'center', style: { padding: 'var(--space-6) 0 var(--space-4)' } as Partial<CSSStyleDeclaration> },
        h('div', {
          style: {
            fontFamily: 'var(--font-display)',
            fontSize: '54px',
            fontWeight: '600',
            color: score >= 80 ? 'var(--pine)' : score >= 60 ? 'var(--amber-strong)' : 'var(--berry)',
            lineHeight: '1',
          } as Partial<CSSStyleDeclaration>,
        }, `${score}%`),
        h('p', { class: 'muted mt-1' }, `${correct} of ${items.length} correct · exam readiness now ${r.percent}%`),
      ),
      score >= 80
        ? h('p', { class: 'small center', style: { color: 'var(--moss)', fontWeight: '600' } as Partial<CSSStyleDeclaration> }, r.verdict)
        : h('p', { class: 'small center muted' }, r.verdict),
      h('div', { class: 'grid-2 mt-4' },
        h('div', {},
          h('div', { class: 'section-label', style: { marginTop: '0' } as Partial<CSSStyleDeclaration> }, h('h3', {}, weak.length ? 'Needs work' : 'Weak spots')),
          weak.length
            ? h('div', { class: 'stack' }, ...weak.map((x) =>
                h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
                  icon('alert', 15),
                  h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, x.concept.name)),
                  h('span', { class: 'chip berry tiny' }, `${Math.round(x.accuracy * 100)}%`),
                )))
            : h('p', { class: 'small subtle' }, 'No clear weak spots in this paper.'),
        ),
        h('div', {},
          h('div', { class: 'section-label', style: { marginTop: '0' } as Partial<CSSStyleDeclaration> }, h('h3', {}, 'Solid')),
          strong.length
            ? h('div', { class: 'stack' }, ...strong.map((x) =>
                h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
                  icon('check', 15),
                  h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, x.concept.name)),
                )))
            : h('p', { class: 'small subtle' }, 'Keep the reviews coming — nothing here yet.'),
        ),
      ),
      misconceptions.length
        ? h('div', { class: 'mt-4', style: { borderLeft: '3px solid var(--amber)', paddingLeft: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'page-kicker', style: { color: 'var(--amber-strong)' } as Partial<CSSStyleDeclaration> }, 'Possible misconceptions'),
            h('div', { class: 'stack mt-1' }, ...misconceptions.slice(0, 2).map((c) =>
              h('p', { class: 'small muted' }, `${c.name}: ${c.misconception}`))))
        : null,
      mixups.length
        ? h('div', { class: 'mt-4', style: { borderLeft: '3px solid var(--berry)', paddingLeft: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'page-kicker', style: { color: 'var(--berry)' } as Partial<CSSStyleDeclaration> }, 'Concepts you mix up'),
            h('p', { class: 'small muted mt-1' },
              `Your wrong picks described ${mixups.map((c) => c.name).join(', ')}. The next paper will compare these directly.`))
        : null,
      mismatched.length
        ? h('div', { class: 'mt-4', style: { borderLeft: '3px solid var(--berry)', paddingLeft: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'page-kicker', style: { color: 'var(--berry)' } as Partial<CSSStyleDeclaration> }, 'Confidence check'),
            h('p', { class: 'small muted mt-1' },
              `You were certain — and wrong — on ${mismatched.map((c) => c.name).join(', ')}. Slow down half a beat before answering these.`))
        : null,
      h('div', { class: 'center mt-5' },
        h('p', { class: 'small muted' }, 'Your next study session, built from this paper:'),
        h('div', { class: 'btn-row mt-2', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
            closeOverlay();
            openSessionSetup({ subjectId });
          } }, icon('play', 15), 'Start the follow-up session'),
          h('button', { class: 'btn', type: 'button', onclick: () => closeOverlay() }, 'Done'),
        ),
      ),
    ]);
  }

  mount(root, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'page-kicker' }, `Practice exam · ${MODE_LABELS[mode]}`),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => closeOverlay() }, icon('x', 15), 'End early'),
    ),
    progressBar,
    meta,
    body,
  ]);
  openOverlay(root);
  render();
}
