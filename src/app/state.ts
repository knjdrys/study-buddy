/**
 * App state — one reactive document (the DB), one store.
 * Views subscribe and re-render on change; persistence is debounced and
 * failure-tolerant. All mutations go through `update` so persistence and
 * notification are never forgotten.
 */

import type { DB } from '../domain/types';
import { emptyDB } from '../domain/defaults';
import { loadDB, saveDB } from '../db/db';

class Store {
  private db: DB = emptyDB();
  private listeners = new Set<() => void>();
  private dirtyHooks = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  loaded = false;

  get(): DB {
    return this.db;
  }

  async init(): Promise<void> {
    this.db = await loadDB();
    this.loaded = true;
    this.emit();
  }

  /** Mutate the document. `fn` may mutate it (and return nothing). */
  update(fn: (db: DB) => void): void {
    fn(this.db);
    this.emit();
    this.scheduleSave();
    for (const hook of this.dirtyHooks) hook();
  }

  /** Replace wholesale (import/merge) then persist immediately. */
  async replace(db: DB): Promise<void> {
    this.db = db;
    this.emit();
    await this.persistNow();
    for (const hook of this.dirtyHooks) hook();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Register a hook fired after every mutation (used by sync). */
  onDirty(fn: () => void): () => void {
    this.dirtyHooks.add(fn);
    return () => this.dirtyHooks.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistNow();
    }, 250);
  }

  async persistNow(): Promise<void> {
    try {
      await saveDB(this.db);
    } catch (e) {
      console.warn('StudyBuddy: persist failed', e);
    }
  }
}

export const store = new Store();
