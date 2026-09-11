/**
 * Command palette — global search plus actions. Keyboard-first:
 * Ctrl/Cmd+K opens, ↑↓ moves, Enter runs, Esc closes.
 */

import { h, mount } from '../lib/h';
import { icon } from '../lib/icons';
import { store } from '../app/state';
import { navigate } from '../app/router';
import { search, type SearchResult } from '../engine/search';
import { quickActions } from '../app/quickActions';
import { normalize } from '../lib/util';

const KIND_LABEL: Record<SearchResult['kind'], string> = {
  subject: 'Subject',
  topic: 'Topic',
  concept: 'Concept',
  deck: 'Deck',
  question: 'Question',
  note: 'Note',
};

let open = false;
let overlay: HTMLElement | null = null;

export function openPalette(prefill = ''): void {
  if (open) return;
  open = true;
  overlay = h('div', { class: 'dialog-backdrop', role: 'presentation', style: { alignItems: 'flex-start', paddingTop: '12vh', background: 'rgba(30,26,18,0.3)' } as Partial<CSSStyleDeclaration> });
  const card = h('div', {
    class: 'dialog',
    role: 'dialog',
    aria: { label: 'Search and commands' },
    style: { maxWidth: '560px' } as Partial<CSSStyleDeclaration>,
  });
  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Search concepts, subjects, notes… or type a command',
    value: prefill,
    style: { border: 'none', boxShadow: 'none', fontSize: '16px', padding: '14px 16px' } as Partial<CSSStyleDeclaration>,
    aria: { label: 'Search' },
  });
  const list = h('div', { class: 'dialog-body', style: { padding: '0 6px 6px', minHeight: '120px', maxHeight: '50dvh', overflowY: 'auto' } as Partial<CSSStyleDeclaration> });
  card.append(
    h('div', { style: { padding: '12px 12px 0' } as Partial<CSSStyleDeclaration> }, input),
    list,
  );
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
  });

  let selected = 0;
  const render = (query: string) => {
    const rows = buildRows(query);
    selected = Math.min(selected, Math.max(0, rows.length - 1));
    mount(
      list,
      rows.length
        ? rows.map((r, i) =>
            h('button', {
              class: `row ${i === selected ? 'palette-selected' : ''}`,
              style: i === selected ? { background: 'var(--pine-soft)' } as Partial<CSSStyleDeclaration> : undefined,
              type: 'button',
              onmouseenter: () => { selected = i; render(query); },
              onclick: () => { closePalette(); r.run(); },
            },
            icon(r.iconName, 16),
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, r.label),
              r.sub ? h('div', { class: 'row-sub' }, r.sub) : null),
            r.kind ? h('span', { class: 'chip tiny' }, r.kind) : null,
          ),
        )
        : [h('div', { class: 'empty', style: { padding: '24px' } as Partial<CSSStyleDeclaration> },
            h('div', { class: 'empty-title', style: { fontSize: '15px' } as Partial<CSSStyleDeclaration> }, 'Nothing found'),
            h('p', { class: 'empty-body' }, 'Try a different word, or create it from the Library.'),
          )],
    );
  };

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => {
    const rows = buildRows(input.value);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = (selected + 1) % Math.max(1, rows.length);
      render(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = (selected - 1 + Math.max(1, rows.length)) % Math.max(1, rows.length);
      render(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = buildRows(input.value)[selected];
      if (row) {
        closePalette();
        row.run();
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closePalette();
    }
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePalette();
    }
  };
  document.addEventListener('keydown', onKey, true);
  (overlay as HTMLElement & { _cleanup?: () => void })._cleanup = () => document.removeEventListener('keydown', onKey, true);

  render(prefill);
  setTimeout(() => input.focus(), 20);
}

export function closePalette(): void {
  if (!overlay) return;
  const el = overlay;
  overlay = null;
  open = false;
  (el as HTMLElement & { _cleanup?: () => void })._cleanup?.();
  el.remove();
}

interface Row {
  label: string;
  sub?: string;
  kind?: string;
  iconName: string;
  run: () => void;
}

const KIND_ICON: Record<SearchResult['kind'], string> = {
  subject: 'book-open',
  topic: 'layers',
  concept: 'bulb',
  deck: 'grid',
  question: 'target',
  note: 'text',
};

function buildRows(query: string): Row[] {
  const db = store.get();
  const q = normalize(query);
  const rows: Row[] = [];

  if (q) {
    const results = search(db, query, 8);
    for (const r of results) {
      rows.push({
        label: r.title,
        sub: r.snippet,
        kind: KIND_LABEL[r.kind],
        iconName: KIND_ICON[r.kind],
        run: () => {
          if (r.kind === 'concept') navigate('concept', { id: r.id });
          else if (r.kind === 'subject') navigate('subject', { id: r.id });
          else if (r.kind === 'deck' || r.kind === 'note' || r.kind === 'question') {
            navigate(r.subjectId ? 'subject' : 'library', r.subjectId ? { id: r.subjectId } : {});
          } else navigate('learn');
        },
      });
    }
  }

  for (const a of quickActions()) {
    const labelMatch = !q || normalize(a.label).includes(q);
    const hintMatch = a.hint && !q ? false : q ? normalize(a.hint ?? '').includes(q) : false;
    if (!q || labelMatch || hintMatch) {
      rows.push({
        label: a.label,
        sub: a.hint,
        iconName: a.icon,
        run: a.run,
      });
    }
  }
  return rows.slice(0, 14);
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (open) closePalette();
    else openPalette();
  }
});
