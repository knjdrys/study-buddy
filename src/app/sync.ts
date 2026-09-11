/**
 * Sync — optional, user-hosted remote. Protocol is deliberately tiny:
 *   GET  {endpoint}            → { db }        (pull)
 *   PUT  {endpoint}  { db }    → { ok: true }   (push)
 * Conflict policy: per-entity latest-wins by id + updatedAt; attempts and
 * XP merge as append-only sets by id; deletions use tombstones. Learner
 * progress is never silently overwritten — merge is a pure, tested function.
 */

import type { DB, ReviewState } from '../domain/types';
import { store } from './state';
import { nowISO } from '../lib/util';

export interface SyncStatus {
  configured: boolean;
  pending: number;
  lastPushedAt?: string;
  lastPulledAt?: string;
  error?: string;
  online: boolean;
}

/* ---------------- merge ---------------- */

type WithId = { id: string };
type Timestamped = WithId & { updatedAt?: string; at?: string; endedAt?: string };

const ts = (x: Timestamped): string => x.updatedAt ?? x.at ?? x.endedAt ?? '';

export function mergeRecords<T extends Timestamped>(local: T[], remote: T[], tombstones: Record<string, string>): T[] {
  const out = new Map<string, T>();
  for (const item of local) if (!tombstones[item.id]) out.set(item.id, item);
  for (const item of remote) {
    if (tombstones[item.id]) continue;
    const existing = out.get(item.id);
    if (!existing || ts(item) > ts(existing)) out.set(item.id, item);
  }
  return [...out.values()];
}

export function mergeReview(local: Record<string, ReviewState>, remote: Record<string, ReviewState>): Record<string, ReviewState> {
  const out: Record<string, ReviewState> = { ...local };
  for (const [id, r] of Object.entries(remote)) {
    const existing = out[id];
    if (!existing || (r.lastReviewedAt ?? '') > (existing.lastReviewedAt ?? '')) out[id] = r;
  }
  return out;
}

export function mergeDBs(local: DB, remote: DB): DB {
  const t = { ...local.sync.tombstoned, ...remote.sync.tombstoned };
  return {
    ...local,
    version: Math.max(local.version, remote.version),
    profile: local.profile ?? remote.profile,
    // Settings stay device-local (theme, keys, sync endpoint) — never merge remote ones in.
    subjects: mergeRecords(local.subjects, remote.subjects, t),
    topics: mergeRecords(local.topics, remote.topics, t),
    concepts: mergeRecords(local.concepts, remote.concepts, t),
    decks: mergeRecords(local.decks, remote.decks, t),
    attempts: mergeRecords(local.attempts, remote.attempts, {}),
    sessions: mergeRecords(local.sessions, remote.sessions, t),
    plans: mergeRecords(local.plans, remote.plans, t),
    goals: mergeRecords(local.goals, remote.goals, t),
    insights: mergeRecords(local.insights, remote.insights, t),
    xp: mergeRecords(local.xp, remote.xp, {}),
    review: mergeReview(local.review, remote.review),
    sync: {
      lastPushedAt: local.sync.lastPushedAt,
      lastPulledAt: local.sync.lastPulledAt,
      pendingPush: local.sync.pendingPush,
      tombstoned: t,
    },
  };
}

/* ---------------- transport ---------------- */

let inFlight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | undefined;

export function status(): SyncStatus {
  const db = store.get();
  const cfg = db.settings.sync;
  return {
    configured: !!(cfg?.endpoint?.trim()),
    pending: db.sync.pendingPush,
    lastPushedAt: db.sync.lastPushedAt,
    lastPulledAt: db.sync.lastPulledAt,
    error: lastError,
    online: navigator.onLine,
  };
}

export function markDirty(): void {
  const db = store.get();
  if (!db.settings.sync?.endpoint?.trim()) return;
  store.update((d) => {
    d.sync.pendingPush = (d.sync.pendingPush ?? 0) + 1;
  });
  schedulePush();
}

function schedulePush(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void push(), 4000);
}

async function fetchJSON(url: string, init?: RequestInit): Promise<unknown> {
  const cfg = store.get().settings.sync!;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Sync endpoint answered ${res.status}`);
  return res.json();
}

export async function push(): Promise<void> {
  if (inFlight) return inFlight;
  const db = store.get();
  const cfg = db.settings.sync;
  if (!cfg?.endpoint?.trim() || !navigator.onLine) return;
  inFlight = (async () => {
    try {
      await fetchJSON(cfg.endpoint, {
        method: 'PUT',
        body: JSON.stringify({ db, at: nowISO() }),
      });
      store.update((d) => {
        d.sync.lastPushedAt = nowISO();
        d.sync.pendingPush = 0;
      });
      lastError = undefined;
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Sync failed';
      schedulePush();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function pull(): Promise<void> {
  const cfg = store.get().settings.sync;
  if (!cfg?.endpoint?.trim() || !navigator.onLine) return;
  try {
    const data = (await fetchJSON(cfg.endpoint)) as { db?: DB };
    if (!data?.db) throw new Error('Endpoint did not return StudyBuddy data');
    const merged = mergeDBs(store.get(), data.db);
    await store.replace(merged);
    store.update((d) => {
      d.sync.lastPulledAt = nowISO();
    });
    lastError = undefined;
  } catch (e) {
    lastError = e instanceof Error ? e.message : 'Pull failed';
  }
}

export async function syncNow(): Promise<void> {
  await pull();
  await push();
}

window.addEventListener('online', () => {
  void push();
});
