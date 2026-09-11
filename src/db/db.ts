/**
 * Storage layer.
 * Primary: IndexedDB (structured, durable, offline). Fallback: localStorage.
 * The whole state document is versioned and run through a migration chain on
 * load, so schema evolution is explicit and testable. Writes are atomic
 * (single key replace) — learner data is never partially overwritten.
 */

import type { DB } from '../domain/types';
import { emptyDB, SCHEMA_VERSION } from '../domain/defaults';

export interface Store {
  load(): Promise<DB>;
  save(db: DB): Promise<void>;
  clear(): Promise<void>;
  readonly kind: 'idb' | 'local' | 'memory';
}

/* ---------------- IndexedDB ---------------- */

const DB_NAME = 'studybuddy';
const DB_STORE = 'state';
const DB_KEY = 'root';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbGet(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
  });
}

function idbPut(db: IDBDatabase, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
  });
}

class IdbStore implements Store {
  readonly kind = 'idb' as const;
  async load(): Promise<DB> {
    const db = await openIdb();
    try {
      const raw = await idbGet(db);
      if (raw && typeof raw === 'object') return (raw as DB) ?? emptyDB();
      return emptyDB();
    } finally {
      db.close();
    }
  }
  async save(state: DB): Promise<void> {
    const db = await openIdb();
    try {
      await idbPut(db, state);
    } finally {
      db.close();
    }
  }
  async clear(): Promise<void> {
    const db = await openIdb();
    try {
      await idbPut(db, emptyDB());
    } finally {
      db.close();
    }
  }
}

/* ---------------- localStorage fallback ---------------- */

const LS_KEY = 'studybuddy.state.v1';

class LocalStore implements Store {
  readonly kind = 'local' as const;
  async load(): Promise<DB> {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return emptyDB();
      const parsed = JSON.parse(raw) as DB;
      return parsed ?? emptyDB();
    } catch {
      return emptyDB();
    }
  }
  async save(state: DB): Promise<void> {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded etc. — never throw from the app's hot path.
      console.warn('StudyBuddy: could not persist state (localStorage)');
    }
  }
  async clear(): Promise<void> {
    localStorage.removeItem(LS_KEY);
  }
}

/* ---------------- memory (tests) ---------------- */

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  state: DB | null = null;
  async load(): Promise<DB> {
    return this.state ? structuredClone(this.state) : emptyDB();
  }
  async save(state: DB): Promise<void> {
    this.state = structuredClone(state);
  }
  async clear(): Promise<void> {
    this.state = null;
  }
}

/* ---------------- migrations ---------------- */

/**
 * Migrations: index i transforms a document at version i into version i+1.
 * Every future schema change MUST land here — no ad-hoc patching in views.
 */
export const migrations: ((db: DB) => DB)[] = [
  // v1 -> v2 example (future):
  // (db) => { ...db, version: 2 },
];

export function migrate(raw: DB): DB {
  let db = raw;
  let guard = 0;
  while ((db.version ?? 0) < SCHEMA_VERSION && guard++ < 50) {
    const step = migrations[db.version ?? 0];
    if (!step) break;
    db = step(db);
    db.version = (db.version ?? 0) + 1;
  }
  db.version = SCHEMA_VERSION;
  return db;
}

/* ---------------- selection ---------------- */

let chosen: Store | null = null;

export function getStore(): Store {
  if (chosen) return chosen;
  try {
    if (typeof indexedDB !== 'undefined') {
      chosen = new IdbStore();
    } else {
      chosen = new LocalStore();
    }
  } catch {
    chosen = new LocalStore();
  }
  return chosen;
}

/** Override the store (tests / bootstrap). */
export function setStore(s: Store): void {
  chosen = s;
}

export async function loadDB(): Promise<DB> {
  try {
    const raw = await getStore().load();
    return migrate(raw);
  } catch {
    return emptyDB();
  }
}

export async function saveDB(db: DB): Promise<void> {
  await getStore().save(db);
}
