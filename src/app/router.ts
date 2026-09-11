/**
 * Hash router. Routes map to learner goals, not features:
 * home / learn / practice / review / progress / plan / library / tutor / settings.
 * Runners (sessions, exams, blurting, feynman) open as overlays on top.
 */

export interface Route {
  name: string;
  params: Record<string, string>;
}

export type RouteName =
  | 'onboarding'
  | 'home'
  | 'learn'
  | 'subject'
  | 'concept'
  | 'practice'
  | 'review'
  | 'progress'
  | 'plan'
  | 'library'
  | 'tutor'
  | 'settings';

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [name = 'home', ...rest] = raw.split('/');
  const params: Record<string, string> = {};
  const parts = rest.filter(Boolean);
  if (parts.length >= 2) {
    for (let i = 0; i + 1 < parts.length; i += 2) params[parts[i]!] = decodeURIComponent(parts[i + 1]!);
  } else if (parts.length === 1) {
    params.id = decodeURIComponent(parts[0]!);
  }
  return { name: name as RouteName, params };
}

export function routePath(name: RouteName, params: Record<string, string> = {}): string {
  const parts = Object.entries(params).map(([k, v]) => `${k}/${encodeURIComponent(v)}`);
  return `#/${name}${parts.length ? '/' + parts.join('/') : ''}`;
}

export function navigate(name: RouteName, params: Record<string, string> = {}): void {
  window.location.hash = routePath(name, params);
}

export function currentRoute(): Route {
  return parseHash(window.location.hash);
}

let listener: ((r: Route) => void) | null = null;

export function onRoute(fn: (r: Route) => void): void {
  listener = fn;
}

window.addEventListener('hashchange', () => {
  listener?.(currentRoute());
});
