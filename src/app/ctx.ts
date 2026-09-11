/** View context: what every view gets to render itself. */

import type { DB } from '../domain/types';
import type { RouteName } from './router';

export interface Ctx {
  db: DB;
  nav: (name: RouteName, params?: Record<string, string>) => void;
}

export function ctx(db: DB, nav: Ctx['nav']): Ctx {
  return { db, nav };
}
