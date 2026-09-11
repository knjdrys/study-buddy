/**
 * Progress — what improved, what slipped, what needs attention.
 * Every visualization comes with an interpretation; no chart for its own
 * sake.
 */

import { h } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { subjectSummaries, accuracyTrend } from '../app/selectors';
import { computeMastery, STAGE_ORDER, STAGE_LABEL } from '../engine/mastery';
import { minutesToday, streakInfo, totalXP, todayXP } from '../engine/motivation';
import { pageHead, emptyState, sectionLabel, bar, miniBars } from './kit';
import { fmtMinutes, fmtDateMed } from '../lib/util';
import type { Stage } from '../domain/types';

export function viewProgress(c: Ctx): Node[] {
  const { db } = c;
  const summaries = subjectSummaries(db);
  const total = db.concepts.length;

  const nodes: Node[] = [
    pageHead({
      kicker: 'Progress',
      title: 'How your learning is going',
      sub: 'Built from your actual answers — accuracy, consistency, and mastery. No vanity numbers.',
    }),
  ];

  if (!total) {
    nodes.push(
      emptyState({
        glyph: '∿',
        title: 'No learning recorded yet',
        body: 'Study a few cards and this page will start telling you what\u2019s improving and what needs attention.',
        actions: [
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => c.nav('review') }, 'Review due concepts'),
        ],
      }),
    );
    return nodes;
  }

  // ----- top line: consistency -----
  const week = streakInfo(db);
  const weekMinutes = week.last7.reduce((s, d) => s + d.minutes, 0);
  const weekDays = week.last7.filter((d) => d.minutes > 0).length;

  nodes.push(
    h('div', {
      class: 'grid-3',
      style: { marginBottom: 'var(--space-5)' } as Partial<CSSStyleDeclaration>,
    },
      statPanel('Day streak', `${week.current}`, week.current > 0 ? `best ${week.best} · ${weekDays}/7 days active this week` : 'Study today to start one'),
      statPanel('Time studied', fmtMinutes(minutesToday(db)), `today · ${fmtMinutes(weekMinutes)} this week`),
      statPanel('XP', `${todayXP(db)}`, `today · ${totalXP(db)} all-time, earned by real study`),
    ),
  );

  // ----- mastery distribution -----
  const dist = new Map<Stage, number>();
  for (const s of STAGE_ORDER) dist.set(s, 0);
  let needsReviewCount = 0;
  for (const concept of db.concepts) {
    const m = computeMastery(concept, db.attempts, db.review[concept.id]);
    dist.set(m.stage, (dist.get(m.stage) ?? 0) + 1);
    if (m.needsReview) needsReviewCount++;
  }
  const distBars = h('div', { class: 'stack' },
    ...STAGE_ORDER.map((stage) => {
      const count = dist.get(stage) ?? 0;
      if (!count) return null;
      return h('div', { class: 'split', style: { alignItems: 'center', gap: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
        h('span', { class: 'small', style: { width: '110px', flex: 'none' } as Partial<CSSStyleDeclaration> }, STAGE_LABEL[stage]),
        h('div', { class: 'grow' }, bar(count / total)),
        h('span', { class: 'tiny num subtle', style: { width: '28px', textAlign: 'right', flex: 'none' } as Partial<CSSStyleDeclaration> }, String(count)),
      );
    }),
  );

  nodes.push(
    sectionLabel('Mastery'),
    h('div', { class: 'grid-2' },
      h('div', { class: 'panel' },
        h('h3', { class: 'panel-title' }, icon('layers', 16), 'Across everything'),
        distBars,
        needsReviewCount
          ? h('p', { class: 'tiny mt-2', style: { color: 'var(--berry)' } as Partial<CSSStyleDeclaration> },
              `${needsReviewCount} ${needsReviewCount === 1 ? 'concept was' : 'concepts were'} mastered and recently missed — they're flagged for re-review.`)
          : null,
      ),
      h('div', { class: 'panel' },
        h('h3', { class: 'panel-title' }, icon('book-open', 16), 'By subject'),
        h('div', { class: 'stack' },
          ...summaries.map((s) =>
            h('div', { class: 'split', style: { alignItems: 'center', gap: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
              h('span', { class: 'small', style: { width: '140px', flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as Partial<CSSStyleDeclaration> }, s.subject.name),
              h('div', { class: 'grow' }, bar(s.conceptCount ? s.mastered / s.conceptCount : 0, { label: `${s.mastered}/${s.conceptCount} mastered` })),
              h('span', { class: 'tiny num subtle' }, `${s.mastered}/${s.conceptCount}`),
            ),
          ),
        ),
      ),
    ),
  );

  // ----- accuracy trend -----
  const trend = accuracyTrend(db);
  const activeDays = trend.filter((d) => d.accuracy != null).length;
  const improving = trendCompare(trend);

  nodes.push(
    sectionLabel('Accuracy'),
    h('div', { class: 'panel' },
      h('div', { class: 'split', style: { alignItems: 'center' } as Partial<CSSStyleDeclaration> },
        h('p', { class: 'small muted', style: { maxWidth: '52ch' } as Partial<CSSStyleDeclaration> },
          improving === 'up'
            ? 'You\u2019re answering more accurately than last week. Whatever you\u2019re doing — keep doing it.'
            : improving === 'down'
              ? 'Accuracy dipped recently. Check the insights below — there\u2019s probably a specific concept or two behind it.'
              : 'Accuracy is steady. Steady is good; the insights below will tell you where the next gain is.'),
        miniBars(trend.map((d) => d.accuracy)),
      ),
      h('p', { class: 'tiny subtle mt-2' }, `% correct (or partial) per day over the last 14 days${activeDays ? ` · ${activeDays} active days` : ''}`),
    ),
  );

  // ----- insights -----
  const insights = [...db.insights].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  if (insights.length) {
    nodes.push(
      sectionLabel('Insights'),
      h('div', { class: 'stack' },
        ...insights.map((ins) =>
          h('div', {
            style: {
              border: '1px solid var(--line)',
              borderLeft: '3px solid var(--amber)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--space-4)',
              background: 'var(--surface)',
            } as Partial<CSSStyleDeclaration>,
          },
            h('div', { class: 'split' },
              h('h4', { style: { fontSize: '15px' } as Partial<CSSStyleDeclaration> }, ins.title),
              h('span', { class: 'tiny subtle' }, fmtDateMed(ins.at.slice(0, 10))),
            ),
            h('p', { class: 'small muted mt-1' }, ins.body),
          ),
        ),
      ),
    );
  } else {
    nodes.push(
      sectionLabel('Insights'),
      h('p', { class: 'small muted' }, 'Insights appear once there\u2019s enough history to say something true — usually after a few sessions.'),
    );
  }

  // ----- attention needed -----
  const attention = db.concepts
    .map((concept) => ({ concept, m: computeMastery(concept, db.attempts, db.review[concept.id]) }))
    .filter((x) => x.m.needsReview || x.m.stage === 'learning' || x.m.stage === 'introduced')
    .sort((a, b) => a.m.score - b.m.score)
    .slice(0, 5);
  if (attention.length) {
    nodes.push(
      sectionLabel('Needs attention'),
      h('div', {},
        ...attention.map(({ concept, m }) =>
          h('button', { class: 'row', type: 'button', onclick: () => c.nav('concept', { id: concept.id }) },
            icon('alert', 15),
            h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, concept.name), h('div', { class: 'row-sub' }, m.needsReview ? 'mastered before, slipping now' : STAGE_LABEL[m.stage])),
            icon('chevron-right', 14),
          ),
        ),
      ),
    );
  }

  return nodes;
}

function statPanel(valueLabel: string, value: string, sub: string): Node {
  return h('div', { class: 'panel', style: { padding: 'var(--space-4)' } as Partial<CSSStyleDeclaration> },
    h('div', { class: 'page-kicker' }, valueLabel),
    h('div', { style: { fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: '600', margin: '2px 0 2px' } as Partial<CSSStyleDeclaration> }, value),
    h('p', { class: 'tiny subtle' }, sub),
  );
}

function trendCompare(trend: { accuracy: number | null }[]): 'up' | 'down' | 'flat' {
  const first = trend.slice(0, 7).filter((d) => d.accuracy != null);
  const second = trend.slice(7).filter((d) => d.accuracy != null);
  if (!first.length || !second.length) return 'flat';
  const avg = (arr: { accuracy: number | null }[]) =>
    arr.reduce((s, d) => s + (d.accuracy ?? 0), 0) / arr.length;
  const diff = avg(second) - avg(first);
  if (diff > 4) return 'up';
  if (diff < -4) return 'down';
  return 'flat';
}
