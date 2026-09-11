/**
 * Smart Study Session runner.
 * The engine composes segments from real state; this view walks the learner
 * through them with a countdown, progress, and a reflection at the end.
 */

import { h, mount } from '../../lib/h';
import { icon } from '../../lib/icons';
import { store } from '../../app/state';
import { planSession, SEGMENT_TITLES, SEGMENT_BLURB } from '../../engine/session';
import { recordAttempt, recordSession } from '../../app/actions';
import { openDialog, closeDialog, openOverlay, closeOverlay, toast } from '../../app/ui';
import { activeSubjects, dueCount } from '../../app/selectors';
import { analyzeFeynman } from '../../engine/analysis';
import {
  planQuestions,
  MODE_LABELS,
  type BrainQuestion,
  type QuestionMode,
} from '../../engine/questionbrain';
import { fmtMinutes } from '../../lib/util';
import { shuffle } from '../../lib/util';
import type { Concept, SessionSegment } from '../../domain/types';

export function openSessionSetup(opts: { subjectId?: string } = {}): void {
  const db = store.get();
  const subjects = activeSubjects(db);
  if (!db.concepts.length) {
    toast('Add concepts first — the Library has samples and imports.');
    return;
  }

  const subjectSelect = h('select', { class: 'select', value: opts.subjectId ?? '' },
    h('option', { value: '' }, 'Everything'),
    ...subjects.map((s) => h('option', { value: s.id, selected: s.id === opts.subjectId }, s.name)),
  ) as HTMLSelectElement;

  const timeChips = [5, 10, 15, 25, 40];
  let minutes = db.settings.preferredSessionMinutes;
  let qMode: QuestionMode = 'auto';
  const chips = h('div', { class: 'btn-row' });
  const modeChips = h('div', { class: 'mode-grid' });

  const planPreview = h('div', { class: 'stack', style: { minHeight: '90px' } as Partial<CSSStyleDeclaration> });

  const renderPreview = () => {
    mount(chips, [
      ...timeChips.map((m) =>
        h('button', {
          class: `btn ${minutes === m ? 'btn-primary' : ''}`,
          type: 'button',
          onclick: () => { minutes = m; renderPreview(); },
        }, `${m}m`),
      ),
      h('span', { class: 'grow' }),
    ]);
    mount(modeChips, [
      ...(['auto', 'mc', 'identify', 'tf', 'fill', 'short'] as QuestionMode[]).map((m) =>
        h('button', {
          class: `mode-chip ${qMode === m ? 'on' : ''}`,
          type: 'button',
          aria: { pressed: qMode === m },
          onclick: () => { qMode = m; renderPreview(); },
        }, MODE_LABELS[m]),
      ),
    ]);
    const plan = planSession(minutes, db.concepts, db.review, db.attempts, {
      subjectId: subjectSelect.value || undefined,
    });
    mount(planPreview, [
      h('p', { class: 'small muted' }, plan.reason),
      h('div', { class: 'stack mt-2' },
        ...plan.segments.map((seg) =>
          h('div', { class: 'split', style: { alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' } as Partial<CSSStyleDeclaration> },
            h('span', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '8px' } as Partial<CSSStyleDeclaration> },
              icon(SEGMENT_ICON[seg.kind], 15),
              SEGMENT_TITLES[seg.kind],
              h('span', { class: 'tiny subtle' }, `${seg.conceptIds.length ? seg.conceptIds.length + ' items' : ''}`),
            ),
            h('span', { class: 'tiny num subtle' }, `~${seg.minutes}m`),
          ),
        ),
      ),
    ]);
  };

  renderPreview();
  subjectSelect.addEventListener('change', renderPreview);

  openDialog({
    title: 'Plan a study session',
    body: [
      field({ label: 'Subject', hint: 'leave on Everything for a global session', control: subjectSelect }),
      h('div', { class: 'label' }, 'How much time do you have?'),
      chips,
      h('div', { class: 'mt-3' },
        h('div', { class: 'label' }, 'Question style', h('span', { class: 'hint' }, ' · used during the Apply segment')),
        modeChips,
      ),
      h('div', { class: 'mt-3' },
        h('div', { class: 'page-kicker' }, 'Your session'),
        planPreview,
      ),
    ],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          closeDialog();
          runSession(minutes, subjectSelect.value || undefined, qMode);
        },
      }, icon('play', 15), 'Start session'),
    ],
  });
}

const SEGMENT_ICON: Record<SessionSegment['kind'], string> = {
  warmup: 'zap',
  review: 'layers',
  learn: 'book-open',
  apply: 'target',
  explain: 'quote',
  reflect: 'check',
};

/* ================= runner ================= */

interface SegRuntime {
  seg: SessionSegment;
  conceptQueue: Concept[];
  doneCount: number;
}

function runSession(minutes: number, subjectId?: string, qMode: QuestionMode = 'auto'): void {
  const db = store.get();
  const plan = planSession(minutes, db.concepts, db.review, db.attempts, { subjectId });
  if (!plan.segments.length || plan.segments.length === 1 && plan.segments[0]!.kind === 'reflect') {
    toast('Nothing to schedule yet — add concepts first.');
    return;
  }

  const sessionId = `sess_${Math.random().toString(36).slice(2, 12)}`;
  const attempts: string[] = [];
  const conceptById = new Map(db.concepts.map((c) => [c.id, c]));
  const segments: SegRuntime[] = plan.segments
    .filter((s) => s.kind !== 'reflect')
    .map((seg) => ({
      seg,
      conceptQueue: seg.conceptIds.map((id) => conceptById.get(id)).filter((x): x is Concept => !!x),
      doneCount: 0,
    }))
    .filter((s) => s.conceptQueue.length > 0 || s.seg.kind === 'learn');
  const totalConcepts = segments.reduce((n, s) => n + s.conceptQueue.length, 0);

  let segIdx = 0;
  let secondsLeft = segments.length ? segments[0]!.seg.minutes * 60 : 0;
  let ticking = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let startedAt = Date.now();

  const root = h('div', {
    style: {
      maxWidth: '720px',
      margin: '0 auto',
      width: '100%',
      padding: 'var(--space-6) var(--space-4) var(--space-9)',
    } as Partial<CSSStyleDeclaration>,
  });

  // chrome
  const closeBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => endSession(true) }, icon('x', 15), 'End session');
  const progressBar = h('div', { class: 'runner-progress' }, h('span', { style: { width: '0%' } as Partial<CSSStyleDeclaration> }));
  const meta = h('div', { class: 'runner-meta' },
    h('span', { id: 'sess-seg' }),
    h('span', { class: 'num', id: 'sess-clock', style: { display: 'flex', alignItems: 'center', gap: '6px' } as Partial<CSSStyleDeclaration> }, icon('clock', 14), ''),
  );
  const body = h('div', { class: 'view-enter' });

  const renderClock = () => {
    const el = document.getElementById('sess-clock');
    if (el) {
      el.textContent = '';
      el.append(icon('clock', 14), fmtClock(secondsLeft));
    }
  };
  const fmtClock = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
    ticking = false;
  };
  const startTimer = (secs: number) => {
    stopTimer();
    secondsLeft = secs;
    ticking = true;
    renderClock();
    timer = setInterval(() => {
      secondsLeft--;
      renderClock();
      if (secondsLeft <= 0) {
        stopTimer();
        nextSegment();
      }
    }, 1000);
  };

  const doneOverall = () => segments.reduce((n, s) => n + s.doneCount, 0);

  const render = () => {
    mount(body, []);
    if (segIdx >= segments.length) return renderReflection();
    const rt = segments[segIdx]!;
    const segEl = document.getElementById('sess-seg');
    if (segEl) segEl.textContent = `${segIdx + 1} of ${segments.length} · ${SEGMENT_TITLES[rt.seg.kind]}`;
    const overall = Math.round((doneOverall() / Math.max(1, totalConcepts)) * 100);
    (progressBar.firstElementChild as HTMLElement).style.width = `${overall}%`;

    const concept = rt.conceptQueue[0];
    if (!concept) {
      nextSegment();
      return;
    }
    if (!ticking) startTimer(Math.max(1, rt.seg.minutes * 60));

    body.appendChild(
      h('div', { class: 'segment-card current' },
        h('span', { class: 'segment-num' }, String(segIdx + 1)),
        h('div', { class: 'grow' },
          h('h2', { style: { fontSize: '19px', marginBottom: '4px' } as Partial<CSSStyleDeclaration> }, SEGMENT_TITLES[rt.seg.kind]),
          h('p', { class: 'small muted', style: { marginBottom: 'var(--space-4)' } as Partial<CSSStyleDeclaration> }, SEGMENT_BLURB[rt.seg.kind]),
          segmentContent(rt, concept),
        ),
      ),
    );
  };

  function segmentContent(rt: SegRuntime, concept: Concept): Node {
    if (rt.seg.kind === 'learn') {
      const readBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        recordAttempt({
          conceptId: concept.id,
          mode: 'tutor',
          outcome: 'partial',
          confidence: 1,
          elapsedMs: 4000,
        });
        attempts.push(`read:${concept.id}`);
        advance(rt);
      } }, 'I\u2019ve read it — test me');
      return h('div', {},
        h('p', { style: { fontSize: '16px', lineHeight: '1.65' } as Partial<CSSStyleDeclaration> }, concept.explanation || concept.summary),
        concept.example
          ? h('div', { class: 'mt-3', style: { borderLeft: '3px solid var(--pine)', paddingLeft: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
              h('div', { class: 'page-kicker' }, 'For example'),
              h('p', { class: 'small muted' }, concept.example))
          : null,
        h('div', { class: 'mt-4' }, readBtn),
      );
    }
    if (rt.seg.kind === 'warmup' || rt.seg.kind === 'review') {
      return miniCardFlow(rt, concept);
    }
    if (rt.seg.kind === 'apply') {
      return questionFlow(rt, concept);
    }
    // explain
    return explainFlow(rt, concept);
  }

  function miniCardFlow(rt: SegRuntime, concept: Concept): Node {
    const card = concept.flashcards[0] ?? { front: concept.name, back: concept.summary };
    let revealed = false;
    const revealBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => {
      revealed = true;
      render();
    } }, 'Show the answer');
    if (revealed) {
      return h('div', { class: 'stack' },
        h('div', { class: 'center', style: { padding: 'var(--space-5)', background: 'var(--surface-2)', borderRadius: 'var(--r-md)' } as Partial<CSSStyleDeclaration> },
          h('div', { class: 'fc-label' }, 'Answer'),
          h('p', { class: 'mt-1', style: { fontSize: '16px' } as Partial<CSSStyleDeclaration> }, card.back),
        ),
        h('div', { class: 'btn-row', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> },
          confidenceBtn(rt, concept, 0, 'Missed it'),
          confidenceBtn(rt, concept, 2, 'Got it'),
          confidenceBtn(rt, concept, 3, 'Easy'),
        ),
      );
    }
    return h('div', { class: 'stack center' },
      h('div', { class: 'fc-label' }, rt.seg.kind === 'warmup' ? 'Warm-up recall' : 'Review'),
      h('p', { style: { fontSize: '22px', fontWeight: '600', margin: 'var(--space-3) 0' } as Partial<CSSStyleDeclaration> }, card.front),
      h('p', { class: 'small subtle' }, 'Answer it in your head first. Then check.'),
      revealBtn,
    );
  }

  function confidenceBtn(rt: SegRuntime, concept: Concept, level: 0 | 2 | 3, label: string): Node {
    return h('button', {
      class: `btn ${level === 0 ? '' : level === 3 ? 'btn-amber' : 'btn-primary'}`,
      type: 'button',
      onclick: () => {
        recordAttempt({
          conceptId: concept.id,
          mode: 'flashcard',
          outcome: level === 0 ? 'incorrect' : 'correct',
          confidence: level,
          elapsedMs: 5000,
        });
        attempts.push(concept.id);
        advance(rt);
      },
    }, label);
  }

  function questionFlow(rt: SegRuntime, concept: Concept): Node {
    // One adaptive question from the brain, sized to this concept's history.
    const planned = planQuestions(store.get(), {
      subjectId: concept.subjectId,
      conceptIds: [concept.id],
      count: 1,
      mode: qMode,
    });
    const q: BrainQuestion = planned[0] ?? {
      id: 'q_auto',
      conceptId: concept.id,
      kind: 'identify',
      level: 1,
      prompt: 'Which concept does this describe?',
      clue: concept.summary,
      answer: concept.name,
      options: [concept.name],
      explanation: concept.summary,
      distractorConceptIds: [],
    };
    let answered = false;

    const grade = (correct: boolean, confidence: 0 | 1 | 2 | 3, distractorConceptId?: string) => {
      if (answered) return;
      answered = true;
      recordAttempt({
        conceptId: concept.id,
        mode: q.kind === 'scenario' ? 'scenario' : q.kind === 'identify' ? 'identify' : q.kind === 'fill' ? 'fill' : q.kind === 'short' ? 'short' : q.kind === 'tf' ? 'tf' : 'mc',
        outcome: correct ? 'correct' : 'incorrect',
        confidence,
        elapsedMs: 8000,
        distractorConceptId,
      });
      attempts.push(concept.id);
      render();
    };

    const revealed = (correct: boolean) =>
      h('div', { class: 'stack' },
        h('p', { class: 'small', style: { fontWeight: '600' } as Partial<CSSStyleDeclaration> }, q.prompt),
        h('div', {
          style: {
            borderLeft: `3px solid ${correct ? 'var(--moss)' : 'var(--berry)'}`,
            padding: 'var(--space-3) var(--space-4)',
            background: correct ? 'var(--moss-soft)' : 'var(--berry-soft)',
            borderRadius: 'var(--r-sm)',
          } as Partial<CSSStyleDeclaration>,
        },
          h('div', { class: 'page-kicker', style: { color: correct ? 'var(--moss)' : 'var(--berry)' } as Partial<CSSStyleDeclaration> }, correct ? 'Correct' : 'Not quite'),
          h('p', { class: 'small', style: { whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, q.kind === 'identify' || q.kind === 'fill' ? `${q.answer} — ${q.explanation ?? ''}` : q.answer),
        ),
        q.explanation && q.kind !== 'identify' && q.kind !== 'fill' ? h('p', { class: 'tiny subtle mt-1' }, q.explanation) : null,
        h('button', { class: 'btn btn-primary mt-2', type: 'button', onclick: () => advance(rt) }, 'Next'),
      );

    if (answered) {
      const last = store.get().attempts
        .filter((a) => a.conceptId === concept.id)
        .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
      return revealed(last?.outcome === 'correct');
    }

    if (q.kind === 'mc' || q.kind === 'scenario') {
      const opts = shuffle([...(q.options ?? [])]);
      return h('div', { class: 'stack' },
        h('p', { class: 'small', style: { fontWeight: '600' } as Partial<CSSStyleDeclaration> }, q.prompt),
        ...opts.map((o) => {
          const ok = o === q.answer;
          return h('button', {
            class: 'opt',
            type: 'button',
            onclick: () => grade(ok, ok ? 2 : 1, !ok ? q.distractorConceptIds[opts.indexOf(o)] ?? undefined : undefined),
          }, o);
        }),
      );
    }
    if (q.kind === 'tf') {
      return h('div', { class: 'stack' },
        h('p', { class: 'small', style: { fontWeight: '600' } as Partial<CSSStyleDeclaration> }, q.prompt),
        ...['True', 'False'].map((o) => {
          const ok = o === q.answer;
          return h('button', { class: 'opt', type: 'button', onclick: () => grade(ok, ok ? 2 : 1, !ok ? q.distractorConceptIds[0] : undefined) }, o);
        }),
      );
    }
    if (q.kind === 'identify' || q.kind === 'fill') {
      const input = h('input', { class: 'input', type: 'text', placeholder: 'Type the term\u2026' }) as HTMLInputElement;
      const checkTyped = () => {
        const mine = input.value.trim().toLowerCase();
        const target = q.answer.trim().toLowerCase();
        if (!mine) return;
        const ok = target.includes(mine) || mine.includes(target);
        grade(ok, ok ? 2 : 1);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checkTyped(); } });
      return h('div', { class: 'stack' },
        h('p', { class: 'small', style: { fontWeight: '600' } as Partial<CSSStyleDeclaration> }, q.prompt),
        h('div', { class: 'panel', style: { background: 'var(--surface-2)', border: 'none' } as Partial<CSSStyleDeclaration> },
          h('p', { class: 'small', style: { fontSize: '15px' } as Partial<CSSStyleDeclaration> }, `\u201c${q.clue ?? q.answer}\u201d`),
        ),
        input,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: checkTyped }, 'Check'),
          ...(q.options?.length ? shuffle(q.options).slice(0, 4).map((o) => {
            const ok = o === q.answer;
            return h('button', {
              class: 'chip',
              type: 'button',
              onclick: () => grade(ok, ok ? 2 : 1, !ok ? q.distractorConceptIds[(q.options ?? []).indexOf(o)] ?? undefined : undefined),
            }, o);
          }) : []),
        ),
      );
    }
    // short answer
    const input = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Explain in your own words\u2026' }) as HTMLTextAreaElement;
    const submit = () => {
      const fb = analyzeFeynman(concept, input.value);
      grade(fb.coverage >= 0.5, fb.coverage >= 0.5 ? 2 : 1);
    };
    return h('div', { class: 'stack' },
      h('p', { class: 'small', style: { fontWeight: '600' } as Partial<CSSStyleDeclaration> }, q.prompt),
      input,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: submit }, 'Check my answer'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => grade(false, 0) }, 'I don\u2019t know'),
      ),
    );
  }

  function explainFlow(rt: SegRuntime, concept: Concept): Node {
    const input = h('textarea', { class: 'textarea', rows: 4, placeholder: `Explain ${concept.name} as if to someone who has never heard of it…` }) as HTMLTextAreaElement;
    let done = false;
    const submit = () => {
      const fb = analyzeFeynman(concept, input.value);
      done = true;
      recordAttempt({
        conceptId: concept.id,
        mode: 'feynman',
        outcome: fb.coverage >= 0.55 ? 'correct' : fb.coverage >= 0.3 ? 'partial' : 'incorrect',
        confidence: fb.coverage >= 0.55 ? 2 : 1,
        elapsedMs: 20000,
      });
      attempts.push(concept.id);
      render();
    };
    if (done) {
      const fb = analyzeFeynman(concept, input.value);
      return h('div', { class: 'stack' },
        h('p', { class: 'small', style: { fontWeight: '600' } as Partial<CSSStyleDeclaration> }, fb.verdict),
        fb.missingPoints.length
          ? h('div', { class: 'small muted', style: { borderLeft: '3px solid var(--amber)', paddingLeft: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
              `Missing: ${fb.missingPoints[0]!.toLowerCase().replace(/\.$/, '')}`)
          : null,
        h('div', { class: 'small muted', style: { borderLeft: '3px solid var(--pine)', paddingLeft: 'var(--space-3)' } as Partial<CSSStyleDeclaration> }, `Official: ${concept.summary}`),
        h('button', { class: 'btn btn-primary mt-2', type: 'button', onclick: () => advance(rt) }, 'Next'),
      );
    }
    return h('div', { class: 'stack' },
      input,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: submit }, 'Check my explanation'),
      ),
    );
  }

  function advance(rt: SegRuntime): void {
    rt.doneCount++;
    rt.conceptQueue.shift();
    if (rt.conceptQueue.length === 0) nextSegment();
    else render();
  }

  function nextSegment(): void {
    stopTimer();
    segIdx++;
    if (segIdx >= segments.length) {
      renderReflection();
    } else {
      render();
    }
  }

  function renderReflection(): void {
    stopTimer();
    const segEl = document.getElementById('sess-seg');
    if (segEl) segEl.textContent = 'Wrap up';
    (progressBar.firstElementChild as HTMLElement).style.width = '100%';
    const minutesActual = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const due = dueCount(store.get());
    mount(body, [
      h('div', { class: 'center', style: { padding: 'var(--space-7) 0' } as Partial<CSSStyleDeclaration> },
        h('div', { class: 'empty-art' }, '✓'),
        h('h2', { style: { fontSize: '24px', marginBottom: '6px' } as Partial<CSSStyleDeclaration> }, 'Session complete'),
        h('p', { class: 'muted' }, `${fmtMinutes(minutesActual)} of focused study · ${attempts.length} answers logged.`),
        h('p', { class: 'small subtle mt-2' }, due > 0 ? `${due} ${due === 1 ? 'concept' : 'concepts'} still due — tomorrow will handle them.` : 'Everything is caught up. Nice.'),
        h('div', { class: 'btn-row mt-4', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => endSession(false) }, 'Done'),
          h('button', { class: 'btn', type: 'button', onclick: () => { window.location.hash = '#/review'; endSession(false); } }, 'Keep studying'),
        ),
      ),
    ]);
    recordSession({
      id: sessionId,
      subjectId,
      minutesPlanned: minutes,
      minutesActual,
      segments: segments.map((s) => s.seg),
      attempts,
    });
  }

  function endSession(abandoned: boolean): void {
    stopTimer();
    if (abandoned && attempts.length) {
      const minutesActual = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
      recordSession({
        id: sessionId,
        subjectId,
        minutesPlanned: minutes,
        minutesActual,
        segments: segments.map((s) => s.seg),
        attempts,
      });
      toast('Progress saved — the rest will stay scheduled.');
    }
    closeOverlay();
  }

  const wrap = h('div', {},
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'page-kicker' }, 'Study session'),
      closeBtn,
    ),
    progressBar,
    meta,
    body,
  );
  root.appendChild(wrap);
  openOverlay(root, () => endSession(true));
  render();
}

function field(opts: { label: string; hint?: string; control: Node }): Node {
  return h('div', { class: 'field' },
    h('label', { class: 'label' }, opts.label, opts.hint ? h('span', { class: 'hint' }, ` · ${opts.hint}`) : null),
    opts.control,
  );
}
