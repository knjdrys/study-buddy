/**
 * View kit — small shared components built on the design system.
 * Components exist where containment helps comprehension; most layouts stay
 * open with dividers and type hierarchy.
 */

import { h, type Child } from '../lib/h';
import { icon } from '../lib/icons';
import { STAGE_LABEL, stageChipClass, type MasteryInfo } from '../engine/mastery';
import type { Concept } from '../domain/types';

export function pageHead(opts: {
  kicker?: string;
  title: string;
  sub?: string;
  actions?: Child[];
}): HTMLElement {
  return h(
    'div',
    { class: 'page-head' },
    h(
      'div',
      { class: 'grow' },
      opts.kicker ? h('div', { class: 'page-kicker' }, opts.kicker) : null,
      h('h1', { class: 'page-title' }, opts.title),
      opts.sub ? h('p', { class: 'page-sub' }, opts.sub) : null,
    ),
    opts.actions?.length ? h('div', { class: 'btn-row' }, opts.actions) : null,
  );
}

export function sectionLabel(title: string, more?: { label: string; run: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'section-label' },
    h('h3', {}, title),
    more
      ? h(
          'button',
          { class: 'more', type: 'button', onclick: more.run },
          more.label,
          icon('arrow-right', 13),
        )
      : null,
  );
}

export function ring(
  percent: number,
  size = 56,
  opts: { label?: string; stroke?: number; color?: string } = {},
): HTMLElement {
  const r = (size - (opts.stroke ?? 6)) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, percent));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${Math.round(pct * 100)}%`);
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('class', 'ring-track');
  track.setAttribute('cx', String(size / 2));
  track.setAttribute('cy', String(size / 2));
  track.setAttribute('r', String(r));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke-width', String(opts.stroke ?? 6));
  const val = track.cloneNode() as SVGCircleElement;
  val.setAttribute('class', 'ring-value');
  val.setAttribute('stroke', opts.color ?? 'var(--pine)');
  val.setAttribute('stroke-linecap', 'round');
  val.setAttribute('stroke-dasharray', String(c));
  val.setAttribute('stroke-dashoffset', String(c * (1 - pct)));
  svg.append(track, val);
  const wrap = h('div', { class: 'ring-wrap', style: { position: 'relative', width: `${size}px`, height: `${size}px` } as Partial<CSSStyleDeclaration> });
  wrap.appendChild(svg);
  if (opts.label) {
    wrap.appendChild(
      h(
        'div',
        {
          class: 'ring-label',
          style: {
            position: 'absolute',
            inset: '0',
            display: 'grid',
            placeItems: 'center',
            fontSize: `${Math.round(size * 0.24)}px`,
            fontWeight: '700',
            fontFamily: 'var(--font-display)',
            color: 'var(--ink)',
          } as Partial<CSSStyleDeclaration>,
        },
        opts.label,
      ),
    );
  }
  return wrap;
}

export function bar(
  percent: number,
  opts: { cls?: string; label?: string } = {},
): HTMLElement {
  const pct = Math.max(0, Math.min(1, percent));
  return h(
    'div',
    { class: `bar ${opts.cls ?? ''}`, role: 'img', aria: { label: opts.label ?? `${Math.round(pct * 100)}%` } },
    h('span', { style: { width: `${pct * 100}%` } as Partial<CSSStyleDeclaration> }),
  );
}

export function miniBars(values: (number | null)[], height = 44): HTMLElement {
  const max = Math.max(...values.filter((v): v is number => v != null), 1);
  const wrap = h('div', {
    class: 'minibars',
    style: { display: 'flex', alignItems: 'flex-end', gap: '4px', height: `${height}px` } as Partial<CSSStyleDeclaration>,
  });
  for (const v of values) {
    const pct = v == null ? 0.06 : Math.max(0.08, v / max);
    wrap.appendChild(
      h('div', {
        class: v == null ? 'minibar empty' : 'minibar',
        style: {
          flex: '1',
          height: `${pct * 100}%`,
          borderRadius: '3px 3px 0 0',
          background: v == null ? 'var(--line)' : 'var(--pine)',
          minHeight: '3px',
        } as Partial<CSSStyleDeclaration>,
        title: v == null ? 'no data' : `${v}%`,
      }),
    );
  }
  return wrap;
}

export function heatStrip(days: { day: string; minutes: number }[]): HTMLElement {
  const wrap = h('div', { class: 'heat', role: 'img', aria: { label: 'Study activity, last 7 days' } });
  for (const d of days) {
    const lvl = d.minutes === 0 ? '' : d.minutes < 10 ? 'l1' : d.minutes < 25 ? 'l2' : 'l3';
    const date = new Date(d.day + 'T00:00:00');
    wrap.appendChild(
      h('div', {
        class: `heat-cell ${lvl}`,
        title: `${date.toLocaleDateString(undefined, { weekday: 'short' })}: ${d.minutes} min`,
      }),
    );
  }
  return wrap;
}

export function emptyState(opts: {
  glyph: string;
  title: string;
  body: string;
  actions?: Child[];
}): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-art', 'aria-hidden': 'true' }, opts.glyph),
    h('div', { class: 'empty-title' }, opts.title),
    h('p', { class: 'empty-body' }, opts.body),
    opts.actions?.length ? h('div', { class: 'btn-row', style: { justifyContent: 'center' } as Partial<CSSStyleDeclaration> }, opts.actions) : null,
  );
}

export function stageChip(_concept: Concept, info: MasteryInfo): HTMLElement {
  return h(
    'span',
    { class: stageChipClass(info.stage, info.needsReview) },
    info.needsReview ? 'Needs review' : STAGE_LABEL[info.stage],
  );
}

export function conceptRow(opts: {
  concept: Concept;
  info: MasteryInfo;
  due?: string;
  onClick: () => void;
  trailing?: Child[];
}): HTMLElement {
  const { concept: c, info } = opts;
  return h(
    'button',
    {
      class: 'row',
      type: 'button',
      onclick: opts.onClick,
    },
    h(
      'div',
      { class: 'row-main' },
      h('div', { class: 'row-title' }, c.name),
      h('div', { class: 'row-sub' }, c.summary),
    ),
    h(
      'div',
      { class: 'row-side' },
      opts.due ? h('span', { class: 'chip berry tiny' }, opts.due) : null,
      stageChip(c, info),
      ...(opts.trailing ?? []),
    ),
  );
}

export function btn(label: string, opts: { kind?: 'primary' | 'amber' | 'danger' | 'ghost' | 'quiet'; size?: 'sm' | 'lg'; run: () => void; iconName?: string; block?: boolean; disabled?: boolean }): HTMLButtonElement {
  return h(
    'button',
    {
      class: `btn ${opts.kind ? `btn-${opts.kind}` : ''} ${opts.size === 'sm' ? 'btn-sm' : opts.size === 'lg' ? 'btn-lg' : ''} ${opts.block ? 'btn-block' : ''}`,
      type: 'button',
      disabled: opts.disabled ?? false,
      onclick: opts.run,
    },
    opts.iconName ? icon(opts.iconName, 16) : null,
    label,
  );
}

export function field(opts: {
  label: string;
  hint?: string;
  control: Child;
}): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'label' }, opts.label, opts.hint ? h('span', { class: 'hint' }, ` · ${opts.hint}`) : null),
    opts.control,
  );
}

export function input(attrs: {
  placeholder?: string;
  value?: string;
  type?: string;
  oninput?: (v: string) => void;
  onchange?: (v: string) => void;
  rows?: number;
  min?: string;
}): HTMLElement {
  if (attrs.rows != null) {
    return h('textarea', {
      class: 'textarea',
      rows: attrs.rows,
      placeholder: attrs.placeholder,
      value: attrs.value ?? '',
      oninput: (e: Event) => attrs.oninput?.((e.target as HTMLTextAreaElement).value),
      onchange: (e: Event) => attrs.onchange?.((e.target as HTMLTextAreaElement).value),
    });
  }
  return h('input', {
    class: 'input',
    type: attrs.type ?? 'text',
    placeholder: attrs.placeholder,
    value: attrs.value ?? '',
    min: attrs.min,
    oninput: (e: Event) => attrs.oninput?.((e.target as HTMLInputElement).value),
    onchange: (e: Event) => attrs.onchange?.((e.target as HTMLInputElement).value),
  });
}

export function segmented<T extends string>(opts: {
  options: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
}): HTMLElement {
  const wrap = h('div', { class: 'seg', role: 'tablist', style: { display: 'inline-flex', gap: '2px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '3px' } as Partial<CSSStyleDeclaration> });
  for (const o of opts.options) {
    wrap.appendChild(
      h(
        'button',
        {
          class: 'seg-btn',
          type: 'button',
          role: 'tab',
          aria: { selected: o.id === opts.selected },
          style: {
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
            fontSize: '13px',
            fontWeight: '600',
            color: o.id === opts.selected ? 'var(--ink)' : 'var(--ink-2)',
            background: o.id === opts.selected ? 'var(--surface)' : 'transparent',
            boxShadow: o.id === opts.selected ? 'var(--shadow-sm)' : 'none',
          } as Partial<CSSStyleDeclaration>,
          onclick: () => opts.onSelect(o.id),
        },
        o.label,
      ),
    );
  }
  return wrap;
}

export function skeletonRows(n = 3): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    ...Array.from({ length: n }, () =>
      h('div', { class: 'skeleton', style: { height: '52px' } as Partial<CSSStyleDeclaration> }),
    ),
  );
}

export function inlineSwitch(checked: boolean, onToggle: (v: boolean) => void, label?: string): HTMLElement {
  const sw = h('button', {
    class: 'switch',
    type: 'button',
    role: 'switch',
    aria: { checked, label: label ?? 'toggle' },
    onclick: () => onToggle(!checked),
  });
  return sw;
}

export function dot(color: string): HTMLElement {
  return h('span', {
    style: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: color,
      display: 'inline-block',
      flex: 'none',
    } as Partial<CSSStyleDeclaration>,
  });
}
