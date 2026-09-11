/**
 * Quick-action registry for the command palette. Views register contextual
 * actions (start session, create concept…) without importing the palette.
 */

export interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

const registry = new Map<string, QuickAction>();

export function registerQuickAction(qa: QuickAction): void {
  registry.set(qa.id, qa);
}

export function quickActions(): QuickAction[] {
  return [...registry.values()];
}
