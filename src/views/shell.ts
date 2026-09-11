/**
 * App shell: restrained sidebar (desktop), minimal topbar, thumb-friendly
 * bottom nav (mobile). Navigation is organized around learner goals —
 * Home · Learn · Practice · Review · Progress — with Plan, Library, Tutor
 * and Settings as secondary, contextual entries.
 */

import { h } from '../lib/h';
import { icon, logoMark } from '../lib/icons';
import type { RouteName } from '../app/router';
import { navigate } from '../app/router';
import { openDialog, closeDialog } from '../app/ui';
import { store } from '../app/state';
import { dueCount } from '../app/selectors';
import { streakInfo } from '../engine/motivation';
import { openPalette } from './palette';

interface NavEntry {
  name: RouteName;
  label: string;
  icon: string;
  badge?: () => string | null;
}

const PRIMARY: NavEntry[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'learn', label: 'Learn', icon: 'book-open' },
  { name: 'practice', label: 'Practice', icon: 'target' },
  { name: 'review', label: 'Review', icon: 'refresh', badge: () => {
    const n = dueCount(store.get());
    return n > 0 ? String(n) : null;
  } },
  { name: 'progress', label: 'Progress', icon: 'chart' },
];

const SECONDARY: NavEntry[] = [
  { name: 'plan', label: 'Plan', icon: 'calendar' },
  { name: 'library', label: 'Library', icon: 'layers' },
  { name: 'tutor', label: 'Tutor', icon: 'chat' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export function activeRouteName(): RouteName {
  const { name } = parse();
  return name;
}

function parse(): { name: RouteName } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const name = raw.split('/')[0] as RouteName;
  return { name: name || 'home' };
}

export function renderShell(): { content: HTMLElement } {
  const searchInput = h('input', {
    type: 'text',
    placeholder: 'Search everything…',
    aria: { label: 'Search your library' },
  });
  const searchBox = h(
    'div',
    { class: 'topbar-search', onclick: () => openPalette() },
    icon('search', 15),
    searchInput,
    h('kbd', { class: 'search-kbd', aria: { hidden: true } }, '⌘K'),
  );
  searchInput.addEventListener('focus', () => openPalette());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openPalette(searchInput.value);
  });

  const streakPill = h('button', {
    class: 'pill warm hide-mobile',
    type: 'button',
    title: 'Current streak — see your progress',
    aria: { label: 'Open progress' },
    onclick: () => { window.location.hash = '#/progress'; },
  }, icon('flame', 14), h('span', { id: 'shell-streak' }));
  const duePill = h('button', {
    class: 'pill due',
    type: 'button',
    style: { display: 'none' } as Partial<CSSStyleDeclaration>,
    title: 'Reviews due — open the review queue',
    aria: { label: 'Open review' },
    onclick: () => { window.location.hash = '#/review'; },
  }, icon('refresh', 14), h('span', { id: 'shell-due' }));
  const themeBtn = h('button', {
    class: 'btn btn-ghost btn-icon',
    type: 'button',
    aria: { label: 'Toggle theme' },
    title: 'Toggle theme',
    onclick: toggleTheme,
  }, icon('moon', 17));
  const moreBtn = h('button', {
    class: 'btn btn-ghost btn-icon hide-desktop',
    type: 'button',
    aria: { label: 'More' },
    onclick: openMoreMenu,
  }, icon('more', 18));

  // ---- sidebar ----
  const sidebar = h('aside', { class: 'shell-sidebar' });
  sidebar.appendChild(
    h('a', { class: 'wordmark', href: '#/home', aria: { label: 'StudyBuddy home' } },
      h('span', { class: 'wordmark-mark' }, logoMark(18)),
      h('span', {},
        h('div', { class: 'wordmark-name' }, 'Study', h('em', {}, 'Buddy')),
        h('div', { class: 'wordmark-tag' }, 'Know what to study next'),
      ),
    ),
  );
  sidebar.appendChild(navGroup('Study', PRIMARY));
  sidebar.appendChild(navGroup('Plan', SECONDARY.slice(0, 2)));
  sidebar.appendChild(
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'nav-group' },
        h('div', { class: 'nav-group-label' }, 'More'),
        ...SECONDARY.slice(2).map((e) => navItem(e)),
      ),
      h('p', { class: 'sidebar-note mt-2' }, 'Everything is saved on this device and works offline.'),
    ),
  );

  // ---- topbar ----
  const topbar = h('header', { class: 'topbar' },
    h('a', { class: 'wordmark-mini hide-desktop', href: '#/home', style: { display: 'none', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--ink)' } as Partial<CSSStyleDeclaration>, aria: { label: 'StudyBuddy home' } },
      h('span', { class: 'wordmark-mark', style: { width: '28px', height: '28px' } as Partial<CSSStyleDeclaration> }, logoMark(17)),
      h('span', { class: 'wordmark-name', style: { fontSize: '16px' } as Partial<CSSStyleDeclaration> }, 'Study', h('em', {}, 'Buddy')),
    ),
    searchBox,
    h('div', { class: 'topbar-right' }, streakPill, duePill, themeBtn, moreBtn),
  );

  // ---- bottom nav ----
  const bottomnav = h('nav', { class: 'bottomnav', aria: { label: 'Primary' } },
    ...PRIMARY.map((e) => bottomNavItem(e)),
  );

  const content = h('main', { class: 'shell-content', id: 'shell-content' });
  const main = h('div', { class: 'shell-main' }, topbar, content);

  const shell = h('div', { class: 'shell' }, sidebar, main, bottomnav);
  document.getElementById('app')!.appendChild(shell);

  // ---- reactive badges ----
  const updateBadges = () => {
    const db = store.get();
    const due = dueCount(db);
    const streak = streakInfo(db).current;
    const sEl = document.getElementById('shell-streak');
    const dEl = document.getElementById('shell-due');
    if (sEl) sEl.textContent = streak > 0 ? String(streak) : '—';
    if (dEl) dEl.textContent = due > 0 ? `${due} due` : '';
    duePill.style.display = due > 0 ? '' : 'none';
    streakPill.style.display = streak > 0 ? '' : 'none';
    // update nav badges + active state
    for (const item of document.querySelectorAll<HTMLElement>('[data-nav]')) {
      const name = item.dataset.nav as RouteName;
      item.classList.toggle('active', name === activeRouteName());
      const badge = item.querySelector<HTMLElement>('.nav-badge');
      const entry = [...PRIMARY, ...SECONDARY].find((x) => x.name === name);
      const val = entry?.badge?.() ?? null;
      if (badge) {
        if (val) {
          badge.textContent = val;
          badge.style.display = '';
        } else badge.style.display = 'none';
      }
    }
  };

  updateBadges();
  store.subscribe(updateBadges);
  window.addEventListener('hashchange', updateBadges);

  return { content };
}

function navGroup(label: string, entries: NavEntry[]): HTMLElement {
  return h(
    'div',
    { class: 'nav-group' },
    h('div', { class: 'nav-group-label' }, label),
    ...entries.map((e) => navItem(e)),
  );
}

function navItem(e: NavEntry): HTMLElement {
  return h(
    'button',
    {
      class: 'nav-item',
      type: 'button',
      dataset: { nav: e.name },
      onclick: () => navigate(e.name),
    },
    icon(e.icon, 17),
    h('span', { class: 'label' }, e.label),
    e.badge ? h('span', { class: 'nav-badge', style: { display: 'none' } as Partial<CSSStyleDeclaration> }) : null,
  );
}

function bottomNavItem(e: NavEntry): HTMLElement {
  return h(
    'button',
    {
      class: 'bottomnav-item',
      type: 'button',
      dataset: { nav: e.name },
      onclick: () => navigate(e.name),
    },
    icon(e.icon, 21),
    e.label,
    e.badge ? h('span', { class: 'nav-badge', style: { display: 'none' } as Partial<CSSStyleDeclaration> }) : null,
  );
}

function toggleTheme(): void {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  store.update((d) => {
    d.settings.theme = next;
  });
}

export function applyTheme(mode: string): void {
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = mode;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  const isDark = document.documentElement.dataset.theme === 'dark';
  if (meta) meta.setAttribute('content', isDark ? '#151924' : '#f4f5f9');
  for (const btn of document.querySelectorAll<HTMLElement>('[aria-label="Toggle theme"]')) {
    btn.replaceChildren(icon(isDark ? 'sun' : 'moon', 17));
  }
}

export function refreshThemeIcons(): void {
  const isDark = document.documentElement.dataset.theme === 'dark';
  for (const btn of document.querySelectorAll<HTMLElement>('[aria-label="Toggle theme"]')) {
    btn.replaceChildren(icon(isDark ? 'sun' : 'moon', 17));
  }
}

function openMoreMenu(): void {
  const items = [
    { label: 'Plan', run: () => navigate('plan'), iconName: 'calendar' },
    { label: 'Library', run: () => navigate('library'), iconName: 'layers' },
    { label: 'Tutor', run: () => navigate('tutor'), iconName: 'chat' },
    { label: 'Settings', run: () => navigate('settings'), iconName: 'settings' },
  ];
  openDialog({
    title: 'More',
    body: [
      h('div', { class: 'stack' },
        ...items.map((it) =>
          h('button', {
            class: 'row',
            type: 'button',
            onclick: () => { closeDialog(); it.run(); },
          }, icon(it.iconName, 17), h('span', { class: 'row-title' }, it.label)),
        ),
      ),
    ],
  });
}

