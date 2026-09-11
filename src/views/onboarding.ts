/**
 * Onboarding — asks only for what's useful, then lands in a working
 * product. Four short steps: name → subject & goal → exam → time.
 */

import { h, mount } from '../lib/h';
import { icon } from '../lib/icons';
import { store } from '../app/state';
import { createSubject, setProfileName, patchSettings } from '../app/actions';
import { parsePairs, buildConceptsFromPairs } from '../engine/import';
import { buildSeedDB } from '../data/seed';
import type { Ctx } from '../app/ctx';
import { navigate } from '../app/router';

const STEPS = ['You', 'Subject', 'Goal', 'Time'] as const;

interface Form {
  name: string;
  subject: string;
  goal: string;
  examDate: string;
  minutes: number;
  withSamples: boolean;
}

export function viewOnboarding(_c: Ctx): Node[] {
  const form: Form = {
    name: store.get().profile?.name ?? '',
    subject: '',
    goal: '',
    examDate: '',
    minutes: store.get().settings.preferredSessionMinutes,
    withSamples: store.get().subjects.length === 0,
  };
  const state = { step: 0, err: '' };

  const wrap = h('div', { class: 'ob-wrap' });
  const brand = h('div', { class: 'ob-brand' },
    h('span', { class: 'wordmark-mark' }, icon('book-open', 17)),
    h('span', { class: 'ob-brand-name' }, 'Study', h('em', {}, 'Buddy')),
  );
  const card = h('div', { class: 'ob-card' });
  const progress = h('div', { class: 'runner-progress' }, h('span', { style: { width: '25%' } as Partial<CSSStyleDeclaration> }));
  const actions = h('div', { class: 'form-actions' });

  const finish = () => {
    if (form.name.trim()) setProfileName(form.name);
    if (form.subject.trim()) {
      const subject = createSubject({
        name: form.subject,
        goal: form.goal.trim() || undefined,
        examDate: form.examDate || undefined,
      });
      // Anything pasted goes straight into the new subject.
      const pasted = (document.getElementById('ob-paste') as HTMLTextAreaElement | null)?.value ?? '';
      if (pasted.trim()) {
        const pairs = parsePairs(pasted);
        const built = buildConceptsFromPairs(subject.id, pairs);
        store.update((db) => db.concepts.push(...built.concepts));
      }
    }
    patchSettings({ preferredSessionMinutes: form.minutes });
    if (form.withSamples && store.get().subjects.length === 0) {
      store.update((db) => {
        const seed = buildSeedDB();
        db.subjects.push(...seed.subjects);
        db.topics.push(...seed.topics);
        db.concepts.push(...seed.concepts);
      });
    }
    navigate('home');
  };

  const renderStep = () => {
    mount(card, []);
    const pct = ((state.step + 1) / STEPS.length) * 100;
    progress.replaceChildren(h('span', { style: { width: `${pct}%` } as Partial<CSSStyleDeclaration> }));

    const stepNodes: Node[] = [];
    if (state.step === 0) {
      stepNodes.push(
        h('div', { class: 'page-kicker' }, 'A personal learning system'),
        h('h1', { class: 'page-title', style: { fontSize: '30px', marginBottom: '10px' } as Partial<CSSStyleDeclaration> },
          'A calm place to study with purpose.'),
        h('p', { class: 'page-sub', style: { marginBottom: '20px' } as Partial<CSSStyleDeclaration> },
          'StudyBuddy keeps track of what you understand, what\u2019s slipping, and what to do next — so you don\u2019t have to figure out how to study.'),
        h('label', { class: 'label' }, 'What should we call you?'),
        h('input', {
          class: 'input ob-focus',
          type: 'text',
          placeholder: 'Your name',
          value: form.name,
          oninput: (e: Event) => { form.name = (e.target as HTMLInputElement).value; },
          onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') go(1); },
        }),
      );
    } else if (state.step === 1) {
      stepNodes.push(
        h('div', { class: 'page-kicker' }, 'Step 2 of 4'),
        h('h2', { class: 'page-title', style: { fontSize: '26px', marginBottom: '8px' } as Partial<CSSStyleDeclaration> }, 'What are you studying?'),
        h('p', { class: 'page-sub', style: { marginBottom: '20px' } as Partial<CSSStyleDeclaration> },
          'One subject is plenty to start — you can add more anytime in the Library.'),
        h('label', { class: 'label' }, 'Subject name'),
        h('input', {
          class: 'input ob-focus',
          type: 'text',
          placeholder: 'e.g. Biology, Constitutional Law, Algorithms',
          value: form.subject,
          oninput: (e: Event) => { form.subject = (e.target as HTMLInputElement).value; },
          onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') go(2); },
        }),
        h('div', { class: 'mt-3' },
          h('label', { class: 'label' }, 'Already have notes? Paste them (optional)', h('span', { class: 'hint' }, ' · “Term: definition” lines work best')),
          h('textarea', { class: 'textarea', id: 'ob-paste', rows: 3, placeholder: 'Photosynthesis: process plants use to turn light into chemical energy\u2026' }),
        ),
      );
    } else if (state.step === 2) {
      stepNodes.push(
        h('div', { class: 'page-kicker' }, 'Step 3 of 4'),
        h('h2', { class: 'page-title', style: { fontSize: '26px', marginBottom: '8px' } as Partial<CSSStyleDeclaration> }, 'What are you working toward?'),
        h('p', { class: 'page-sub', style: { marginBottom: '20px' } as Partial<CSSStyleDeclaration> },
          'A goal gives the plan something to aim at. Both fields are optional.'),
        h('label', { class: 'label' }, 'Your goal'),
        h('input', {
          class: 'input ob-focus',
          type: 'text',
          placeholder: 'e.g. Pass the midterm, ace the interview',
          value: form.goal,
          oninput: (e: Event) => { form.goal = (e.target as HTMLInputElement).value; },
        }),
        h('div', { class: 'mt-3' },
          h('label', { class: 'label' }, 'When do you need to be ready?'),
          h('input', { class: 'input', type: 'date', min: new Date().toISOString().slice(0, 10), oninput: (e: Event) => { form.examDate = (e.target as HTMLInputElement).value; } }),
        ),
      );
    } else {
      stepNodes.push(
        h('div', { class: 'page-kicker' }, 'Step 4 of 4'),
        h('h2', { class: 'page-title', style: { fontSize: '26px', marginBottom: '8px' } as Partial<CSSStyleDeclaration> }, 'How much time do you usually have?'),
        h('p', { class: 'page-sub', style: { marginBottom: '20px' } as Partial<CSSStyleDeclaration> },
          'Used to size your study sessions. You can always change it.'),
        h('div', { class: 'btn-row', style: { gap: '8px' } as Partial<CSSStyleDeclaration> },
          ...[10, 15, 25, 40].map((m) =>
            h('button', {
              class: `btn ${form.minutes === m ? 'btn-primary' : ''}`,
              type: 'button',
              onclick: () => { form.minutes = m; renderStep(); },
            }, `${m} min`),
          ),
        ),
        h('div', { class: 'inline-field mt-4' },
          h('span', { class: 'label' }, 'Add the sample library', h('span', { class: 'hint' }, ' · Biology, CS, Economics with real content')),
          h('button', {
            class: 'switch',
            type: 'button',
            role: 'switch',
            aria: { checked: form.withSamples },
            onclick: () => { form.withSamples = !form.withSamples; renderStep(); },
          }),
        ),
      );
    }

    if (state.err) {
      stepNodes.push(h('p', { class: 'tiny mt-2', style: { color: 'var(--berry)' } as Partial<CSSStyleDeclaration> }, state.err));
    }

    const nextLabel = state.step === STEPS.length - 1 ? 'Start studying' : 'Continue';
    actions.replaceChildren(
      state.step > 0
        ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go(state.step - 1) }, icon('arrow-left', 15), 'Back')
        : h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => navigate('home') }, 'Skip for now'),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          if (state.step === 0 && !form.name.trim()) {
            state.err = 'A name helps StudyBuddy feel personal — but anything works.';
            renderStep();
            return;
          }
          if (state.step === STEPS.length - 1) finish();
          else go(state.step + 1);
        },
      }, nextLabel, icon('arrow-right', 15)),
    );

    card.append(progress, h('div', { class: 'mt-4' }, stepNodes), h('div', { class: 'mt-3' }, actions));
    requestAnimationFrame(() => {
      card.querySelector<HTMLInputElement>('.ob-focus')?.focus();
    });
  };

  const go = (n: number) => {
    state.step = Math.max(0, Math.min(STEPS.length - 1, n));
    state.err = '';
    renderStep();
  };

  renderStep();
  wrap.appendChild(brand);
  wrap.appendChild(card);
  return [wrap];
}
