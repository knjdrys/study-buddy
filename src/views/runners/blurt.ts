/**
 * Blurting — retrieval-first writing. Hide the material, recall everything,
 * compare, see what you remembered / missed / confused, then retry or
 * schedule. The match analysis is transparent about being approximate and
 * lets the learner correct it.
 */

import { h, mount } from '../../lib/h';
import { icon } from '../../lib/icons';
import { store } from '../../app/state';
import { recordBlurt } from '../../app/actions';
import { analyzeBlurt, blurtScore, type ConceptRecall } from '../../engine/analysis';
import { openOverlay, closeOverlay, toast } from '../../app/ui';
import { fmtMinutes } from '../../lib/util';
import type { Concept } from '../../domain/types';

export function openBlurt(opts: { subjectId?: string; concepts?: Concept[] } = {}): void {
  const db = store.get();
  const pool = opts.concepts ?? db.concepts.filter((c) => !opts.subjectId || c.subjectId === opts.subjectId);
  if (!pool.length) {
    toast('Add concepts before blurting.');
    return;
  }

  let phase: 'ready' | 'writing' | 'results' = 'ready';
  let seconds = 3 * 60;
  let timer: ReturnType<typeof setInterval> | null = null;
  let recalls: ConceptRecall[] = [];
  const overrides = new Map<string, ConceptRecall['status']>();
  const startedAt = Date.now();

  const root = h('div', {
    style: { maxWidth: '760px', margin: '0 auto', width: '100%', padding: 'var(--space-6) var(--space-4) var(--space-9)' } as Partial<CSSStyleDeclaration>,
  });
  const body = h('div', { class: 'view-enter' });

  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const fmtClock = () => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  function render(): void {
    mount(body, []);
    if (phase === 'ready') {
      body.appendChild(
        h('div', { class: 'center', style: { padding: 'var(--space-7) 0' } as Partial<CSSStyleDeclaration> },
          h('div', { class: 'empty-art' }, '✎'),
          h('h2', { style: { fontSize: '24px', marginBottom: '6px' } as Partial<CSSStyleDeclaration> }, 'Blurting'),
          h('p', { class: 'muted', style: { maxWidth: '48ch', margin: '0 auto' } as Partial<CSSStyleDeclaration> },
            `When you start, write down everything you remember about these ${pool.length} concepts — no peeking. Then we compare what you recalled against what's in your library.`),
          h('div', { class: 'chip-btns mt-3', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> },
            ...pool.slice(0, 6).map((c) => h('span', { class: 'chip' }, c.name)),
            pool.length > 6 ? h('span', { class: 'chip' }, `+${pool.length - 6} more`) : null,
          ),
          h('div', { class: 'btn-row mt-4', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> },
            h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => {
              phase = 'writing';
              timer = setInterval(() => {
                seconds--;
                const el = document.getElementById('blurt-clock');
                if (el) el.textContent = fmtClock();
                if (seconds <= 0) {
                  stopTimer();
                  analyze();
                }
              }, 1000);
              render();
              (body.querySelector('textarea') as HTMLTextAreaElement)?.focus();
            } }, icon('play', 16), 'Start — hide everything'),
          ),
          h('p', { class: 'tiny subtle mt-3' }, 'Three minutes. Quality over quantity — it\u2019s a memory test, not a race.'),
        ),
      );
      return;
    }

    if (phase === 'writing') {
      const input = h('textarea', {
        class: 'textarea',
        rows: 10,
        placeholder: 'Everything you remember — names, mechanisms, examples, connections…',
        style: { minHeight: '240px', fontSize: '15px' } as Partial<CSSStyleDeclaration>,
      }) as HTMLTextAreaElement;
      body.appendChild(
        h('div', { class: 'stack' },
          h('div', { class: 'runner-meta' },
            h('span', {}, `${pool.length} concepts · recall as much as you can`),
            h('span', { class: 'num', id: 'blurt-clock', style: { fontWeight: '700', color: seconds < 30 ? 'var(--berry)' : 'var(--ink)' } as Partial<CSSStyleDeclaration> }, fmtClock()),
          ),
          input,
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { stopTimer(); analyze(); } }, 'I\u2019m done — compare'),
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { stopTimer(); phase = 'ready'; render(); } }, 'Go back'),
          ),
        ),
      );
      return;
    }

    // results
    const score = blurtScore(recalls);
    const remembered = recalls.filter((r) => overrides.get(r.conceptId) ?? r.status === 'remembered');
    const partial = recalls.filter((r) => (overrides.get(r.conceptId) ?? r.status) === 'partial');
    const missed = recalls.filter((r) => (overrides.get(r.conceptId) ?? r.status) === 'missed');
    const name = (id: string) => db.concepts.find((c) => c.id === id)?.name ?? '';

    const recallRow = (r: ConceptRecall) => {
      const status = overrides.get(r.conceptId) ?? r.status;
      return h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, name(r.conceptId)),
          r.matchedTerms.length ? h('div', { class: 'row-sub' }, `you mentioned: ${r.matchedTerms.slice(0, 3).join(', ')}`) : null,
        ),
        h('select', {
          class: 'select',
          style: { width: 'auto', fontSize: '12px', padding: '4px 8px' } as Partial<CSSStyleDeclaration>,
          value: status,
          onchange: (e: Event) => {
            overrides.set(r.conceptId, (e.target as HTMLSelectElement).value as ConceptRecall['status']);
            render();
          },
        },
          h('option', { value: 'remembered', selected: status === 'remembered' }, 'Remembered'),
          h('option', { value: 'partial', selected: status === 'partial' }, 'Partial'),
          h('option', { value: 'missed', selected: status === 'missed' }, 'Missed'),
        ),
      );
    };

    body.appendChild(
      h('div', {},
        h('div', { class: 'center', style: { padding: 'var(--space-5) 0 var(--space-4)' } as Partial<CSSStyleDeclaration> },
          h('div', {
            style: {
              fontFamily: 'var(--font-display)',
              fontSize: '48px',
              fontWeight: '600',
              color: score >= 70 ? 'var(--pine)' : score >= 40 ? 'var(--amber-strong)' : 'var(--berry)',
              lineHeight: '1',
            } as Partial<CSSStyleDeclaration>,
          }, `${score}%`),
          h('p', { class: 'muted mt-1' }, `${remembered.length} remembered · ${partial.length} partial · ${missed.length} missed`),
          h('p', { class: 'tiny subtle mt-1' }, 'The match is approximate — fix any row you disagree with.'),
        ),
        h('div', { class: 'grid-2' },
          h('div', {},
            h('div', { class: 'section-label', style: { marginTop: '0' } as Partial<CSSStyleDeclaration> }, h('h3', { style: { color: 'var(--moss)' } as Partial<CSSStyleDeclaration> }, 'You remembered')),
            remembered.length
              ? h('div', {}, ...remembered.map(recallRow))
              : h('p', { class: 'small subtle' }, 'Nothing yet — keep at it.'),
          ),
          h('div', {},
            h('div', { class: 'section-label', style: { marginTop: '0' } as Partial<CSSStyleDeclaration> }, h('h3', { style: { color: 'var(--berry)' } as Partial<CSSStyleDeclaration> }, 'Missed or confused')),
            [...missed, ...partial].length
              ? h('div', {}, ...[...missed, ...partial].map(recallRow))
              : h('p', { class: 'small subtle' }, 'Clean sweep.'),
          ),
        ),
        h('div', { class: 'center mt-4' },
          h('p', { class: 'small muted' }, missed.length
            ? `The missed ones are now scheduled for review soon — ${fmtMinutes(Math.max(2, missed.length))} to close the gaps.`
            : 'Everything you forgot is rescheduled; what you remembered is pushed further out.'),
          h('div', { class: 'btn-row mt-3', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
              const list = [...remembered, ...partial, ...missed].map((r) => ({
                conceptId: r.conceptId,
                status: overrides.get(r.conceptId) ?? r.status,
              }));
              recordBlurt(pool[0]!.subjectId, list, Date.now() - startedAt);
              closeOverlay();
              toast(`Blurt saved — ${list.filter((x) => x.status === 'missed').length} concepts will come back sooner.`);
            } }, 'Save & schedule'),
            h('button', { class: 'btn', type: 'button', onclick: () => { phase = 'ready'; render(); } }, 'Try again'),
          ),
        ),
      ),
    );
  }

  function analyze(): void {
    const input = body.querySelector('textarea') as HTMLTextAreaElement | null;
    recalls = analyzeBlurt(input?.value ?? '', pool);
    phase = 'results';
    render();
  }

  mount(root, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'page-kicker' }, 'Blurting'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { stopTimer(); closeOverlay(); } }, icon('x', 15), 'Close'),
    ),
    body,
  ]);
  openOverlay(root);
  render();
}
