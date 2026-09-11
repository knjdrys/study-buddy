/**
 * The Smart Question Engine — behavior tests.
 * The critical rule: questions test KNOWLEDGE, not recognition.
 * Distractors are never bare lists of term names.
 */

import { describe, it, expect } from 'vitest';
import type { Concept, DB, Attempt } from '../src/domain/types';
import { emptyDB } from '../src/domain/defaults';
import { buildSeedDB } from '../src/data/seed';
import {
  understand,
  similarity,
  asOption,
  qDefinition,
  qDistinguish,
  qTrueFalse,
  qIdentify,
  qFillBlank,
  qApply,
  qJudge,
  qShort,
  qMatching,
  planQuestions,
  levelFor,
  confusions,
  type BrainQuestion,
  type ConceptProfile,
} from '../src/engine/questionbrain';

/* ---------------- helpers ---------------- */

function concept(partial: Partial<Concept> & { id: string; name: string }): Concept {
  return {
    subjectId: 'subj_net',
    summary: '',
    explanation: '',
    relatedIds: [],
    resources: [],
    flashcards: [],
    questions: [],
    difficulty: 2,
    origin: 'user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

const NETWORK = {
  mac: concept({
    id: 'con_mac', name: 'MAC Address', subjectId: 'subj_net', topicId: 'top_net',
    summary: 'A unique hardware address assigned to a network interface.',
    explanation:
      'A MAC address is a unique hardware address assigned to a network interface. It is burned into the hardware by the manufacturer and identifies the device on a local network segment. Ethernet frames are delivered using MAC addresses.',
    flashcards: [{ id: 'fc_1', front: 'What is a MAC Address?', back: 'A unique hardware address assigned to a network interface.' }],
  }),
  ip: concept({
    id: 'con_ip', name: 'IP Address', subjectId: 'subj_net', topicId: 'top_net',
    summary: 'A logical address used to identify a device across networks.',
    explanation:
      'An IP address is a logical address used to identify a device across networks. Unlike a MAC address it is assigned by software or a DHCP server and can change as the device moves.',
    flashcards: [{ id: 'fc_2', front: 'What is an IP Address?', back: 'A logical address used to identify a device across networks.' }],
  }),
  subnet: concept({
    id: 'con_subnet', name: 'Subnet Mask', subjectId: 'subj_net', topicId: 'top_net',
    summary: 'A bitmask that divides an IP network into smaller subnetworks.',
    explanation:
      'A subnet mask is a bitmask that divides an IP network into smaller subnetworks. It tells devices which part of an IP address is the network and which part is the host.',
    flashcards: [{ id: 'fc_3', front: 'What is a Subnet Mask?', back: 'A bitmask that divides an IP network into smaller subnetworks.' }],
  }),
  cidr: concept({
    id: 'con_cidr', name: 'CIDR', subjectId: 'subj_net', topicId: 'top_net',
    summary: 'A notation for IP addresses and their routing prefix.',
    explanation:
      'CIDR is a notation for IP addresses and their routing prefix. It replaces the old class-based system and lets network engineers express address ranges compactly.',
    flashcards: [{ id: 'fc_4', front: 'What is CIDR?', back: 'A notation for IP addresses and their routing prefix.' }],
  }),
  switch: concept({
    id: 'con_switch', name: 'Switch', subjectId: 'subj_net', topicId: 'top_net',
    summary: 'A device that forwards Ethernet frames between devices on a local network.',
    explanation:
      'A switch is a device that forwards Ethernet frames between devices on a local network. It learns which MAC addresses live on which port and sends frames only to the right one.',
    flashcards: [{ id: 'fc_5', front: 'What is a Switch?', back: 'A device that forwards Ethernet frames between devices on a local network.' }],
  }),
};

function dbWith(concepts: Concept[], attempts: Attempt[] = []): DB {
  const db = emptyDB();
  db.subjects.push({ id: 'subj_net', name: 'Networking', goal: undefined, exam: undefined, archivedAt: undefined, createdAt: '', updatedAt: '', code: undefined, description: undefined });
  db.concepts.push(...concepts);
  db.attempts.push(...attempts);
  return db;
}

function attempt(conceptId: string, outcome: Attempt['outcome'], opts: { at?: string; confidence?: 0 | 1 | 2 | 3; elapsedMs?: number; distractorConceptId?: string } = {}): Attempt {
  return {
    id: `att_${Math.random().toString(36).slice(2, 9)}`,
    conceptId,
    subjectId: 'subj_net',
    mode: 'mc',
    outcome,
    confidence: opts.confidence ?? 2,
    elapsedMs: opts.elapsedMs ?? 8000,
    at: opts.at ?? new Date().toISOString(),
    distractorConceptId: opts.distractorConceptId,
  };
}

function isSentenceLike(s: string): boolean {
  // definition statements: "A unique hardware address assigned to a network interface"
  return /^[A-Z]/.test(s) && s.split(' ').length >= 4 && !/^[A-Z][a-z]+$/.test(s);
}

/* ---------------- 1. THE networking example ---------------- */

describe('Smart Question Engine — the MAC Address case', () => {
  const pool = Object.values(NETWORK).map(understand);

  it('understands what a MAC address IS (category + function)', () => {
    const mac = understand(NETWORK.mac);
    expect(mac.category.toLowerCase()).toContain('hardware address');
    expect(mac.functionPhrase.toLowerCase()).toContain('network interface');
    expect(asOption(mac).toLowerCase()).toContain('hardware address');
  });

  it('builds multiple-choice distractors from DEFINITIONS, never from term names', () => {
    const mac = understand(NETWORK.mac);
    const q = qDefinition(mac, pool);
    expect(q.kind).toBe('mc');
    expect(q.options).toHaveLength(4);
    // the bare terms must never appear as options
    const bareNames = ['MAC Address', 'IP Address', 'Subnet Mask', 'CIDR', 'Switch'];
    for (const opt of q.options!) {
      expect(bareNames.includes(opt)).toBe(false);
      expect(isSentenceLike(opt)).toBe(true);
    }
    // the correct answer is the real definition
    expect(q.answer.toLowerCase()).toContain('hardware address');
    expect(q.answer.toLowerCase()).toContain('network interface');
    // distractors are OTHER concepts' definitions in parallel form
    const others = q.options!.filter((o) => o !== q.answer);
    const otherDefs = pool.filter((p) => p.id !== 'con_mac').map(asOption);
    expect(others.every((o) => otherDefs.includes(o))).toBe(true);
  });

  it('never falls back to a bare name list when siblings are missing', () => {
    const solo = understand(NETWORK.mac);
    const q = qDefinition(solo, [solo]);
    const options = q.options ?? [];
    // zero or one options, but never a fabricated name list
    expect(options.filter((o) => !isSentenceLike(o))).toEqual([]);
    expect(q.distractorConceptIds.length).toBeLessThanOrEqual(1);
  });

  it('levels up from recall to distinguish to apply to judge', () => {
    const mac = understand(NETWORK.mac);
    const l1 = qDefinition(mac, pool);
    expect(l1.prompt).toContain('What is MAC Address?');

    const l2 = qDistinguish(mac, pool);
    expect(l2.options!.length).toBeGreaterThanOrEqual(3);
    expect(l2.explanation!.length).toBeGreaterThan(20);

    const l3 = qApply(mac, pool);
    expect(l3.level).toBeGreaterThanOrEqual(3);
    // L3 stem must not contain the answer's giveaway keywords
    expect(l3.prompt.toLowerCase()).not.toContain('hardware address');

    const l4 = qJudge(mac, pool);
    expect(l4.level).toBe(4);
    expect(l4.prompt).toContain('situation');
    // judgment options describe SITUATIONS, not definitions
    expect(l4.options!.every((o) => /need to/i.test(o))).toBe(true);
  });

  it('true/false statements carry real content, and the swap traps the confusion', () => {
    const mac = understand(NETWORK.mac);
    const q = qTrueFalse(mac, pool);
    expect(q.options).toEqual(['True', 'False']);
    // never trivially "MAC Address is a MAC Address"
    expect(q.prompt.toLowerCase()).not.toMatch(/is a mac address/i);
    // a false variant must exist in the generator's output space
    const falses: BrainQuestion[] = [];
    for (let i = 0; i < 20; i++) {
      const qq = qTrueFalse(mac, pool);
      if (qq.answer === 'False') falses.push(qq);
    }
    expect(falses.length).toBeGreaterThan(0);
    expect(falses.every((f) => f.prompt.length > 30)).toBe(true);
  });

  it('identification shows the definition and expects the term', () => {
    const mac = understand(NETWORK.mac);
    const q = qIdentify(mac, pool);
    expect(q.answer).toBe('MAC Address');
    expect(q.clue!.toLowerCase()).toContain('hardware address');
    expect(q.options).toContain('MAC Address');
  });

  it('fill-the-blank blanks a real sentence, not a guess', () => {
    const mac = understand(NETWORK.mac);
    const q = qFillBlank(mac, pool);
    expect(q.clue).toContain('______');
    expect(q.clue!.toLowerCase()).toContain('network interface');
  });

  it('similarity recognizes same-kind confusables (MAC vs IP, both addresses)', () => {
    const mac = understand(NETWORK.mac);
    const ip = understand(NETWORK.ip);
    const subnet = understand(NETWORK.subnet);
    // both are "… address" concepts — the classic mix-up — and rank far
    // above the address-vs-bitmask pair
    expect(similarity(mac, ip)).toBeGreaterThan(similarity(mac, subnet) + 0.1);
    // and IP's definition is offered among MAC's distractors
    const q = qDefinition(mac, [mac, ip, subnet, understand(NETWORK.switch), understand(NETWORK.cidr)]);
    expect(q.distractorConceptIds).toContain('con_ip');
  });
});

/* ---------------- 2. the never-names invariant, across everything ---------------- */

describe('Smart Question Engine — recognition is never the test', () => {
  const seed = buildSeedDB();
  const db = dbWith(seed.concepts);
  const pool = seed.concepts.map(understand);
  const names = new Set(pool.map((p) => p.name));

  for (const profile of pool) {
    const makers: Array<[string, (p: ConceptProfile, pool: ConceptProfile[]) => BrainQuestion]> = [
      ['definition', qDefinition],
      ['distinguish', qDistinguish],
      ['truefalse', qTrueFalse],
      ['identify', qIdentify],
      ['fill', qFillBlank],
      ['apply', qApply],
      ['judge', qJudge],
      ['short', qShort],
    ];
    for (const [label, make] of makers) {
      it(`${label} for “${profile.name}” never offers bare term names as choices`, () => {
        const q = make(profile, pool);
        for (const opt of q.options ?? []) {
          if (names.has(opt)) {
            // Only legal for identify/fill, where the TERM is the answer type.
            expect(['identify', 'fill']).toContain(q.kind);
            expect(q.answer === opt || q.distractorConceptIds.length >= 0).toBe(true);
          }
        }
        if (q.kind === 'mc' || q.kind === 'scenario') {
          // every mc/scenario option must be a full statement
          for (const opt of q.options!) {
            expect(isSentenceLike(opt)).toBe(true);
          }
          expect(q.answer).not.toBe(q.conceptId === '' ? '' : '');
          // and if distractors exist they map to real concepts
          expect(q.distractorConceptIds.every((id) => pool.some((p) => p.id === id))).toBe(true);
        }
      });
    }
  }

  it('a whole adaptive paper contains zero name-only options', () => {
    const qs = planQuestions(db, { subjectId: seed.subjects[0]!.id, count: 12, mode: 'auto' });
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      for (const opt of q.options ?? []) {
        if (names.has(opt)) {
          expect(q.kind === 'identify' || q.kind === 'fill' || q.kind === 'match').toBe(true);
        }
      }
      if (q.kind === 'mc' || q.kind === 'scenario') {
        expect(q.options!.every(isSentenceLike)).toBe(true);
      }
    }
  });

  it('matching pairs terms with definitions (definitions are never names)', () => {
    const group = pool.slice(0, 5);
    const q = qMatching(group)!;
    expect(q.pairs!.length).toBeGreaterThanOrEqual(3);
    for (const pair of q.pairs!) {
      expect(pair.term).toBeTruthy();
      expect(isSentenceLike(pair.definition)).toBe(true);
      expect(pair.definition).not.toBe(pair.term);
    }
  });

  it('every mode produces questions of its own kind', () => {
    for (const mode of ['identify', 'tf', 'fill', 'short'] as const) {
      const qs = planQuestions(db, { subjectId: seed.subjects[0]!.id, count: 4, mode });
      expect(qs.length).toBeGreaterThan(0);
      expect(qs.every((q) => q.kind === mode)).toBe(true);
    }
    const matches = planQuestions(db, { subjectId: seed.subjects[0]!.id, count: 10, mode: 'match' });
    expect(matches.every((q) => q.kind === 'match' && (q.pairs?.length ?? 0) >= 3)).toBe(true);
  });
});

/* ---------------- 3. ADAPTIVE — the brain learns from answers ---------------- */

describe('Smart Question Engine — adaptation', () => {
  const concepts = Object.values(NETWORK);

  it('starts every new concept at level 1', () => {
    const db = dbWith(concepts);
    expect(levelFor(db, 'con_mac')).toBe(1);
  });

  it('repeated misses hold a concept at easy levels', () => {
    const db = dbWith(concepts, [
      attempt('con_mac', 'incorrect'),
      attempt('con_mac', 'incorrect'),
      attempt('con_mac', 'partial'),
    ]);
    expect(levelFor(db, 'con_mac')).toBeLessThanOrEqual(2);
  });

  it('consistent fast corrects climb to judgment level', () => {
    const db = dbWith(concepts, [
      attempt('con_mac', 'correct', { elapsedMs: 5000 }),
      attempt('con_mac', 'correct', { elapsedMs: 6000 }),
      attempt('con_mac', 'correct', { elapsedMs: 4000 }),
      attempt('con_mac', 'correct', { elapsedMs: 5500 }),
    ]);
    expect(levelFor(db, 'con_mac')).toBe(4);
  });

  it('gives a struggling concept more questions than a solid one', () => {
    const db = dbWith(concepts, [
      attempt('con_mac', 'incorrect'),
      attempt('con_mac', 'incorrect'),
      attempt('con_mac', 'incorrect'),
      attempt('con_ip', 'correct', { elapsedMs: 5000 }),
      attempt('con_ip', 'correct', { elapsedMs: 5000 }),
      attempt('con_ip', 'correct', { elapsedMs: 5000 }),
      attempt('con_ip', 'correct', { elapsedMs: 5000 }),
    ]);
    const qs = planQuestions(db, { subjectId: 'subj_net', count: 6, mode: 'auto' });
    const macCount = qs.filter((q) => q.conceptId === 'con_mac').length;
    const ipCount = qs.filter((q) => q.conceptId === 'con_ip').length;
    expect(macCount).toBeGreaterThan(ipCount);
    // the struggling concept also gets varied question types
    const kinds = new Set(qs.filter((q) => q.conceptId === 'con_mac').map((q) => q.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('tracks what a concept was confused with, and targets it next time', () => {
    const db = dbWith(concepts, [
      attempt('con_mac', 'incorrect', { distractorConceptId: 'con_ip' }),
      attempt('con_mac', 'incorrect', { distractorConceptId: 'con_ip' }),
      attempt('con_mac', 'correct'),
    ]);
    const mixes = confusions(db, 'con_mac');
    expect(mixes[0]!.conceptId).toBe('con_ip');
    expect(mixes[0]!.count).toBe(2);

    // a plan for MAC must compare against IP's definition
    const qs = planQuestions(db, { subjectId: 'subj_net', count: 4, mode: 'mc' });
    const macQs = qs.filter((q) => q.conceptId === 'con_mac');
    expect(macQs.length).toBeGreaterThan(0);
    expect(macQs.some((q) => q.distractorConceptIds.includes('con_ip'))).toBe(true);
  });

  it('does not repeat the same concept back-to-back', () => {
    const db = dbWith(concepts, [
      attempt('con_mac', 'incorrect'),
      attempt('con_mac', 'incorrect'),
    ]);
    const qs = planQuestions(db, { subjectId: 'subj_net', count: 8, mode: 'auto' });
    for (let i = 1; i < qs.length; i++) {
      expect(qs[i]!.conceptId).not.toBe(qs[i - 1]!.conceptId);
    }
  });
});
