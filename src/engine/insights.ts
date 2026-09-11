/**
 * Insights — derived ONLY from real data (attempts, review state, exams).
 * No fabricated intelligence: every insight names the evidence behind it.
 */

import type { Attempt, Concept, Insight, ReviewState } from '../domain/types';
import { computeMastery } from './mastery';
import { newId, nowISO, plural } from '../lib/util';

export interface InsightContext {
  concepts: Concept[];
  review: Record<string, ReviewState>;
  attempts: Attempt[];
  existing: Insight[];
  /** Subject the upcoming exam belongs to (for readiness insights). */
  examSubjectId?: string;
  examDate?: string;
}

export function generateInsights(ctx: InsightContext, now: Date = new Date()): Insight[] {
  const out: Insight[] = [];
  const seen = new Set(ctx.existing.map((i) => `${i.kind}:${[...i.conceptIds].sort().join(',')}`));
  const push = (ins: Omit<Insight, 'id' | 'at'>): void => {
    const key = `${ins.kind}:${[...ins.conceptIds].sort().join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...ins, id: newId('ins'), at: nowISO() });
  };

  const recentAttempts = ctx.attempts.filter(
    (a) => Date.now() - new Date(a.at).getTime() < 21 * 86_400_000,
  );
  const forConcept = (id: string) => recentAttempts.filter((a) => a.conceptId === id);

  // 1 · mistake patterns — missed 3+ times total, or 2 of last 4
  const mistakeConcepts: Concept[] = [];
  for (const c of ctx.concepts) {
    const own = forConcept(c.id);
    if (!own.length) continue;
    const totalMiss = own.filter((a) => a.outcome === 'incorrect').length;
    const last4 = own.slice(-4);
    const recentMiss = last4.filter((a) => a.outcome === 'incorrect').length;
    if (totalMiss >= 3 || (last4.length >= 3 && recentMiss >= 2)) mistakeConcepts.push(c);
  }
  if (mistakeConcepts.length) {
    const top = mistakeConcepts
      .sort(
        (a, b) =>
          forConcept(b.id).filter((x) => x.outcome === 'incorrect').length -
          forConcept(a.id).filter((x) => x.outcome === 'incorrect').length,
      )
      .slice(0, 2);
    const top0 = top[0]!;
    push({
      kind: 'mistake-pattern',
      conceptIds: top.map((c) => c.id),
      title:
        top.length === 1
          ? `${top0.name} keeps tripping you up`
          : `${top.map((c) => c.name).join(' and ')} keep tripping you up`,
      body: `You've missed ${top0.name.toLowerCase()} ${forConcept(top0.id).filter((a) => a.outcome === 'incorrect').length} times${
        top.length > 1 ? ` (and ${top[1]!.name.toLowerCase()} too)` : ''
      }. Re-read the explanation, then try its questions again — one clean correct answer is worth three shaky ones.`,
    });
  }

  // 2 · confidence mismatch — certain-but-wrong, or unsure-but-right
  const mismatchConcepts: Concept[] = [];
  for (const c of ctx.concepts) {
    const own = forConcept(c.id).slice(-8);
    if (own.length < 3) continue;
    const overconfident = own.filter((a) => a.confidence >= 2 && a.outcome === 'incorrect').length;
    const underconfident = own.filter((a) => a.confidence <= 1 && a.outcome === 'correct').length;
    if (overconfident >= 2 || underconfident >= 3) mismatchConcepts.push(c);
  }
  if (mismatchConcepts.length) {
    const c = mismatchConcepts[0]!;
    const overconfident =
      forConcept(c.id).filter((a) => a.confidence >= 2 && a.outcome === 'incorrect').length >= 2;
    push({
      kind: 'confidence-mismatch',
      conceptIds: [c.id],
      title: overconfident
        ? `You feel sure about ${c.name} — but the answers disagree`
        : `You know ${c.name} better than you think`,
      body: overconfident
        ? `On recent attempts you rated your confidence high while missing the answer. Slow down one beat before answering, and check yourself against the explanation.`
        : `You've been answering ${c.name.toLowerCase()} correctly while rating yourself unsure. Trust yourself a little more — it also helps the scheduling space your reviews out.`,
    });
  }

  // 3 · neglect — reviews very overdue
  const neglected = ctx.concepts
    .filter((c) => {
      const r = ctx.review[c.id];
      if (!r?.lastReviewedAt) return false;
      return Date.now() - new Date(r.dueAt).getTime() > 7 * 86_400_000;
    })
    .slice(0, 3);
  if (neglected.length) {
    push({
      kind: 'neglect',
      conceptIds: neglected.map((c) => c.id),
      title: `${plural(neglected.length, 'concept')} ${neglected.length === 1 ? 'has' : 'have'} been waiting over a week`,
      body: `${neglected.map((c) => c.name).join(', ')} — the review is overdue. Even a short session today will bring ${neglected.length === 1 ? 'it' : 'them'} back into shape.`,
    });
  }

  // 4 · exam readiness (within 9 days)
  if (ctx.examDate && ctx.examSubjectId) {
    const days = Math.ceil(
      (new Date(ctx.examDate + 'T23:59:59').getTime() - now.getTime()) / 86_400_000,
    );
    if (days >= 0 && days <= 9) {
      const subjectConcepts = ctx.concepts.filter((c) => c.subjectId === ctx.examSubjectId);
      const mastered = subjectConcepts.filter((c) => {
        const m = computeMastery(c, ctx.attempts, ctx.review[c.id]);
        return m.stage === 'mastered' || (m.stage === 'proficient' && m.score >= 0.8);
      }).length;
      const total = subjectConcepts.length;
      if (total > 0) {
        const ratio = mastered / total;
        push({
          kind: ratio >= 0.75 ? 'ready' : 'due-buildup',
          conceptIds: subjectConcepts.map((c) => c.id),
          title:
            days === 0
              ? 'Your exam is today'
              : days === 1
                ? 'Your exam is tomorrow'
                : `Your exam is in ${days} days`,
          body:
            ratio >= 0.75
              ? `${Math.round(ratio * 100)}% of the concepts are in good shape. Spend the remaining time on a full practice exam — it calibrates confidence better than more review.`
              : `${mastered} of ${total} concepts are exam-ready. Focus sessions on the rest — the plan page shows exactly which.`,
        });
      }
    }
  }

  return out;
}
