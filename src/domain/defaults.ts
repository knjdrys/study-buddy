import type { DB, Settings } from './types';

export const SCHEMA_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    theme: 'auto',
    dailyGoalMinutes: 20,
    preferredSessionMinutes: 15,
    notifications: false,
    speech: true,
    ai: {
      provider: 'none',
      apiKey: '',
      model: '',
    },
  };
}

export function emptyDB(): DB {
  return {
    version: SCHEMA_VERSION,
    profile: null,
    settings: defaultSettings(),
    subjects: [],
    topics: [],
    concepts: [],
    decks: [],
    review: {},
    attempts: [],
    sessions: [],
    plans: [],
    goals: [],
    insights: [],
    xp: [],
    sync: { pendingPush: 0, tombstoned: {} },
  };
}
