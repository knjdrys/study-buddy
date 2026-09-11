/**
 * Feynman teach-back — explain it like you're teaching a beginner, then a
 * thoughtful review: what you covered, what's missing, jargon to simplify.
 * Optional LLM pass upgrades the feedback when a provider is configured.
 */

import { h, mount } from '../../lib/h';
import { icon } from '../../lib/icons';
import { store } from '../../app/state';
import { recordFeynman } from '../../app/actions';
import { analyzeFeynman } from '../../engine/analysis';
import { aiFeynmanFeedback } from '../../ai/generate';
import { isConfigured } from '../../ai/provider';
import { openOverlay, closeOverlay, toast } from '../../app/ui';
import type { Concept } from '../../domain/types';

export function openFeynman(concept: Concept): void {
  let phase: 'explain' | 'feedback' = 'explain';
  const startedAt = Date.now();
  let aiFeedback = '';

  const root = h('div', {
    style: { maxWidth: '720px', margin: '0 auto', width: '100%', padding: 'var(--space-6) var(--space-4) var(--space-9)' } as Partial<CSSStyleDeclaration>,
  });
  const body = h('div', { class: 'view-enter' });

  const render = () => {
    mount(body, []);
    if (phase === 'explain') {
      const input = h('textarea', {
        class: 'textarea',
        rows: 8,
        placeholder: `“${concept.name} is…” — keep going. Plain words, one idea at a time, as if they've never heard of it.`,
        style: { minHeight: '220px', fontSize: '15px' } as Partial<CSSStyleDeclaration>,
      }) as HTMLTextAreaElement;
      body.appendChild(
        h('div', { class: 'stack' },
          h('div', { class: 'page-kicker' }, 'Teach it back'),
          h('h2', { style: { fontSize: '24px', marginBottom: '4px' } as Partial<CSSStyleDeclaration> },
            `Explain ${concept.name} to a beginner`),
          h('p', { class: 'small muted' }, 'No notes, no peeking. If you get stuck, say so — that\u2019s useful information too.'),
          input,
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
              if (!input.value.trim()) { toast('Write something first — even an honest attempt counts.'); return; }
              phase = 'feedback';
              render();
              maybeAI(input.value);
            } }, 'Hear how I did'),
          ),
        ),
      );
      return;
    }

    const input = body.querySelector('textarea') as HTMLTextAreaElement | null;
    const fb = analyzeFeynman(concept, input?.value ?? '');
    const pct = Math.round(fb.coverage * 100);
    body.appendChild(
      h('div', { class: 'stack' },
        h('div', { class: 'center', style: { padding: 'var(--space-5) 0' } as Partial<CSSStyleDeclaration> },
          h('div', {
            style: {
              fontFamily: 'var(--font-display)',
              fontSize: '48px',
              fontWeight: '600',
              color: pct >= 70 ? 'var(--pine)' : pct >= 45 ? 'var(--amber-strong)' : 'var(--berry)',
              lineHeight: '1',
            } as Partial<CSSStyleDeclaration>,
          }, `${pct}%`),
          h('p', { class: 'small subtle mt-1' }, 'of the key points, in your own words'),
        ),
        h('p', { class: 'muted', style: { fontSize: '15.5px', lineHeight: '1.6' } as Partial<CSSStyleDeclaration> }, fb.verdict),
        fb.coveredPoints.length
          ? h('div', { class: 'mt-3' },
              h('div', { class: 'page-kicker', style: { color: 'var(--moss)' } as Partial<CSSStyleDeclaration> }, 'You covered'),
              h('div', { class: 'stack mt-1' }, ...fb.coveredPoints.map((p) => h('p', { class: 'small muted' }, `· ${p}`))))
          : null,
        fb.missingPoints.length
          ? h('div', { class: 'mt-3' },
              h('div', { class: 'page-kicker', style: { color: 'var(--amber-strong)' } as Partial<CSSStyleDeclaration> }, 'Missing'),
              h('div', { class: 'stack mt-1' }, ...fb.missingPoints.slice(0, 3).map((p) => h('p', { class: 'small muted' }, `· ${p}`))))
          : null,
        fb.jargon.length
          ? h('div', { class: 'mt-3' },
              h('div', { class: 'page-kicker', style: { color: 'var(--slate)' } as Partial<CSSStyleDeclaration> }, 'Jargon to unpack'),
              h('p', { class: 'small muted mt-1' }, fb.suggestions[1] ?? `Try replacing ${fb.jargon.join(', ')} with everyday words.`))
          : null,
        aiFeedback
          ? h('div', { class: 'mt-3', style: { border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--space-4)', background: 'var(--surface)' } as Partial<CSSStyleDeclaration> },
              h('div', { class: 'page-kicker' }, 'A tutor\u2019s read'),
              h('p', { class: 'small muted mt-1', style: { lineHeight: '1.6', whiteSpace: 'pre-wrap' } as Partial<CSSStyleDeclaration> }, aiFeedback))
          : isConfigured(store.get().settings)
            ? h('p', { class: 'tiny subtle pulse mt-2' }, 'Asking for a tutor\u2019s read…')
            : null,
        h('div', { class: 'mt-4', style: { borderLeft: '3px solid var(--pine)', paddingLeft: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
          h('div', { class: 'page-kicker' }, 'The official version'),
          h('p', { class: 'small muted mt-1', style: { lineHeight: '1.6' } as Partial<CSSStyleDeclaration> }, concept.summary)),
        h('div', { class: 'btn-row mt-4' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
            recordFeynman(concept.id, fb.coverage, Date.now() - startedAt, fb.jargon.length > 0);
            closeOverlay();
            toast(fb.coverage >= 0.55 ? 'Saved — strong explanation.' : 'Saved — it\u2019ll come back around soon.');
          } }, 'Done — schedule it'),
          h('button', { class: 'btn', type: 'button', onclick: () => { phase = 'explain'; render(); } }, 'Try again'),
        ),
      ),
    );
  };

  function maybeAI(text: string): void {
    const settings = store.get().settings;
    if (!isConfigured(settings)) return;
    aiFeynmanFeedback(settings, concept, text)
      .then((t) => {
        aiFeedback = t;
        render();
      })
      .catch(() => { /* offline or quota — local feedback is enough */ });
  }

  mount(root, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'page-kicker' }, 'Feynman teach-back'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => closeOverlay() }, icon('x', 15), 'Close'),
    ),
    body,
  ]);
  openOverlay(root);
  render();
}
