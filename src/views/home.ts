/**
 * Home — not a dashboard. One strong next action, one honest "today",
 * the actual learning context, one insight, one picture of progress.
 */

import { h } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { nextBestAction, subjectSummaries, todayView, masteryFor, dueConcepts } from '../app/selectors';
import { computeMastery } from '../engine/mastery';
import { fmtDateLong, fmtMinutes, todayKey } from '../lib/util';
import { ring, heatStrip, stageChip, emptyState } from './kit';
import { registerQuickAction } from '../app/quickActions';
import { openSessionSetup } from './runners/session';

export function viewHome(c: Ctx): Node[] {
  const { db } = c;
  const profile = db.profile;
  const name = profile?.name;
  const hour = new Date().getHours();
  const greeting = name
    ? hour < 5 ? `Up late, ${name}` : hour < 12 ? `Good morning, ${name}` : hour < 18 ? `Good afternoon, ${name}` : `Good evening, ${name}`
    : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const today = todayView(db);
  const action = nextBestAction(db);

  // hero
  const hero = h('section', { class: 'hero' });
  const heroLeft = h('div', { class: 'hero-main' });
  heroLeft.appendChild(h('div', { class: 'page-kicker' }, 'Next best action'));
  heroLeft.appendChild(h('h2', {}, action.title));
  heroLeft.appendChild(h('p', { class: 'muted', style: { marginBottom: '12px' } as Partial<CSSStyleDeclaration> }, action.subtitle));
  heroLeft.appendChild(
    h('div', { class: 'chip-btns' },
      h('span', { class: 'chip' }, icon('clock', 13), `~${action.minutes} minutes`),
      action.kind === 'review'
        ? h('span', { class: 'chip amber' }, icon('refresh', 13), 'Reviews are due')
        : action.kind === 'setup'
          ? h('span', { class: 'chip' }, 'Set up')
          : h('span', { class: 'chip pine' }, icon('sparkle', 13), action.kind === 'practice' ? 'Sharpen it' : 'Build it'),
    ),
  );
  hero.appendChild(
    h('div', { class: 'hero-side' },
      h('button', {
        class: 'btn btn-primary btn-lg',
        type: 'button',
        onclick: () => {
          if (action.kind === 'setup') c.nav('onboarding');
          else if (action.kind === 'review' || action.kind === 'practice' || action.kind === 'learn' || action.kind === 'resume') {
            openSessionSetup({ subjectId: action.subjectId });
          }
        },
      },
      icon('play', 16), `Start · ~${action.minutes} min`, icon('arrow-right', 15),
      ),
      h('button', {
        class: 'btn btn-ghost btn-sm',
        type: 'button',
        onclick: () => {
          if (action.kind === 'setup') c.nav('learn');
          else if (action.subjectId) c.nav('subject', { id: action.subjectId });
          else c.nav('learn');
        },
      }, 'Open the subject'),
    ),
  );

  // today column
  const todayItems: Node[] = [];
  todayItems.push(
    h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
      icon('refresh', 17),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, today.due > 0 ? `${today.due} ${today.due === 1 ? 'concept' : 'concepts'} due for review` : 'Nothing due today')),
      today.due > 0
        ? h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => c.nav('review') }, 'Review')
        : null,
    ),
  );
  if (today.exam) {
    todayItems.push(
      h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
        icon('flag', 17),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-title' }, today.exam.subjectName),
          h('div', { class: 'row-sub' }, today.exam.days === 0 ? 'Exam today — breathe, you\'ve got this.' : today.exam.days === 1 ? 'Exam tomorrow' : `Exam in ${today.exam.days} days`),
        ),
      ),
    );
  }
  todayItems.push(
    h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
      icon('target', 17),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, today.goalMet ? 'Daily goal met' : `${fmtMinutes(today.goalMinutes)} a day is the goal`),
        h('div', { class: 'row-sub' }, today.goalMet ? `Nice — ${fmtMinutes(today.minutesToday)} of focused study today.` : `${fmtMinutes(today.minutesToday)} studied today.`),
      ),
      ring(today.goalMinutes ? Math.min(1, today.minutesToday / today.goalMinutes) : 0, 34, { stroke: 5, label: undefined }),
    ),
  );

  const todayPanel = h('div', {},
    h('div', { class: 'section-label', style: { marginTop: '0' } as Partial<CSSStyleDeclaration> }, h('h3', {}, 'Today')),
    ...todayItems,
  );

  // continue learning
  const continueNodes: Node[] = [];
  const lastAttempt = [...db.attempts].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const lastSession = [...db.sessions].filter((s) => s.status === 'done').sort((a, b) => (a.endedAt! < b.endedAt! ? 1 : -1))[0];
  const currentSubjectId = lastAttempt?.subjectId ?? lastSession?.subjectId;
  const currentSubject = db.subjects.find((s) => s.id === currentSubjectId && !s.archivedAt);
  const summaries = subjectSummaries(db);

  if (currentSubject) {
    const concepts = db.concepts.filter((x) => x.subjectId === currentSubject.id);
    const recent = [...concepts]
      .map((x) => ({ concept: x, lastAt: db.attempts.filter((a) => a.conceptId === x.id).sort((a, b) => (a.at < b.at ? 1 : -1))[0]?.at ?? '' }))
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
      .slice(0, 3);
    continueNodes.push(
      h('button', {
        class: 'row',
        type: 'button',
        onclick: () => c.nav('subject', { id: currentSubject.id }),
      },
        icon('book-open', 17),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, currentSubject.name), h('div', { class: 'row-sub' }, `${concepts.length} concepts`)),
        icon('chevron-right', 15),
      ),
    );
    for (const { concept } of recent) {
      const info = computeMastery(concept, db.attempts, db.review[concept.id]);
      continueNodes.push(
        h('button', {
          class: 'row',
          type: 'button',
          style: { paddingLeft: 'var(--space-6)' } as Partial<CSSStyleDeclaration>,
          onclick: () => c.nav('concept', { id: concept.id }),
        },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title', style: { fontSize: '13.5px' } as Partial<CSSStyleDeclaration> }, concept.name)),
          stageChip(concept, info),
        ),
      );
    }
    continueNodes.push(
      h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
        h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => openSessionSetup({ subjectId: currentSubject.id }) }, 'Continue with a session →'),
      ),
    );
  } else if (summaries.length) {
    for (const s of summaries.slice(0, 3)) {
      continueNodes.push(
        h('button', {
          class: 'row',
          type: 'button',
          onclick: () => c.nav('subject', { id: s.subject.id }),
        },
          icon('book-open', 17),
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, s.subject.name), h('div', { class: 'row-sub' }, `${s.mastered}/${s.conceptCount} mastered`)),
          icon('chevron-right', 15),
        ),
      );
    }
  } else {
    continueNodes.push(
      h('p', { class: 'muted small', style: { padding: 'var(--space-3) var(--space-2)' } as Partial<CSSStyleDeclaration> },
        'Nothing here yet — create a subject and your learning context will show up here.'),
    );
  }

  const continuePanel = h('div', {},
    h('div', { class: 'section-label', style: { marginTop: '0' } as Partial<CSSStyleDeclaration> },
      h('h3', {}, 'Continue learning'),
      h('button', { class: 'more', type: 'button', onclick: () => c.nav('learn') }, 'All subjects'),
    ),
    ...continueNodes,
  );

  // insight + this week
  const insightPanel = h('section', { class: 'insight' });
  if (today.insight) {
    insightPanel.append(
      h('span', { class: 'bulb' }, icon('bulb', 19)),
      h('div', { class: 'grow' },
        h('div', { class: 'page-kicker', style: { color: 'var(--amber-strong)' } as Partial<CSSStyleDeclaration> }, 'From your recent studying'),
        h('h3', {}, today.insight.title),
        h('p', { class: 'small', style: { color: 'var(--ink-2)' } as Partial<CSSStyleDeclaration> }, today.insight.body),
      ),
    );
  } else {
    insightPanel.append(
      h('span', { class: 'bulb' }, icon('bulb', 19)),
      h('div', { class: 'grow' },
        h('div', { class: 'page-kicker', style: { color: 'var(--amber-strong)' } as Partial<CSSStyleDeclaration> }, 'From your recent studying'),
        h('h3', {}, 'Insights appear as you study'),
        h('p', { class: 'small', style: { color: 'var(--ink-2)' } as Partial<CSSStyleDeclaration> },
          'Answer honestly and StudyBuddy will point out what\u2019s working and what\u2019s slipping.'),
      ),
    );
  }

  const weekPanel = h('section', { class: 'weekstrip' });
  const weekLeft = h('div', {},
    h('div', { class: 'page-kicker' }, 'This week'),
    h('div', { class: 'weekstat' },
      h('div', {},
        h('div', { class: 'num' }, `${today.streak.current}`),
        h('div', { class: 'tiny subtle' }, 'day streak'),
      ),
      h('div', {},
        h('div', { class: 'num plain' }, `${today.xpToday}`),
        h('div', { class: 'tiny subtle' }, 'XP today'),
      ),
      h('div', {},
        h('div', { class: 'num plain' }, `${today.xpTotal}`),
        h('div', { class: 'tiny subtle' }, 'XP all-time'),
      ),
    ),
  );
  weekPanel.append(weekLeft, heatStrip(today.streak.last7));

  // assemble
  const grid = h('div', {
    class: 'grid-2',
    style: { marginTop: 'var(--space-6)', alignItems: 'start' } as Partial<CSSStyleDeclaration>,
  }, todayPanel, continuePanel);

  const bottom = h('div', {
    class: 'grid-2',
    style: { marginTop: 'var(--space-6)', alignItems: 'start' } as Partial<CSSStyleDeclaration>,
  }, insightPanel, weekPanel);

  const nodes: Node[] = [
    h('div', { class: 'page-kicker' }, fmtDateLong(todayKey())),
    h('h1', { class: 'page-title', style: { fontSize: '32px', marginBottom: 'var(--space-6)' } as Partial<CSSStyleDeclaration> },
      name
        ? h('span', {}, h('span', { style: { fontStyle: 'italic', color: 'var(--pine-strong)' } as Partial<CSSStyleDeclaration> }, greeting), '. What are we working on today?')
        : `${greeting}. What are we working on today?`,
    ),
    hero,
    grid,
    bottom,
  ];

  if (!db.subjects.length) {
    return [
      h('div', { class: 'page-kicker' }, fmtDateLong(todayKey())),
      h('h1', { class: 'page-title', style: { fontSize: '30px', marginBottom: 'var(--space-6)' } as Partial<CSSStyleDeclaration> }, `${greeting}.`),
      emptyState({
        glyph: '◫',
        title: 'Your study space is empty',
        body: 'Create a subject, import notes, or start with the sample library — within a couple of minutes you\u2019ll be studying with a plan.',
        actions: [
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => c.nav('onboarding') }, 'Set up your first subject'),
          h('button', { class: 'btn', type: 'button', onclick: () => c.nav('library') }, 'Import or browse samples'),
        ],
      }),
    ];
  }

  void masteryFor;
  void dueConcepts;
  return nodes;
}

// Register global quick actions once.
registerQuickAction({
  id: 'session',
  label: 'Start a study session',
  hint: 'Best use of your time, sized to your day',
  icon: 'play',
  run: () => openSessionSetup({}),
});
registerQuickAction({
  id: 'review',
  label: 'Review due concepts',
  hint: 'Clear the review queue',
  icon: 'refresh',
  run: () => { window.location.hash = '#/review'; },
});
