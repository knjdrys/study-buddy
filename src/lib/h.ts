/**
 * Tiny, safe hyperscript renderer. No innerHTML with user content —
 * everything is created via document.createElement, so learner content
 * is never interpreted as markup.
 */

export type Child =
  | Node
  | string
  | number
  | null
  | undefined
  | false
  | Child[];

export interface HProps {
  class?: string;
  className?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string | number | undefined>;
  htmlFor?: string;
  value?: string | number;
  checked?: boolean;
  disabled?: boolean;
  selected?: boolean;
  type?: string;
  role?: string;
  rows?: number;
  min?: string;
  max?: string;
  href?: string;
  placeholder?: string;
  title?: string;
  autocomplete?: string;
  tabindex?: number;
  aria?: Record<string, string | number | boolean>;
  onclick?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  onchange?: (e: Event) => void;
  onkeydown?: (e: KeyboardEvent) => void;
  onmouseenter?: (e: MouseEvent) => void;
  onmouseleave?: (e: MouseEvent) => void;
  [key: string]: unknown;
}

function setProp(el: HTMLElement, key: string, val: unknown): void {
  if (val == null || val === false) return;
  if (key === 'class' || key === 'className') {
    el.className = String(val);
  } else if (key === 'style' && typeof val === 'object' && val) {
    Object.assign(el.style, val);
  } else if (key === 'style') {
    (el as HTMLElement).setAttribute('style', String(val));
  } else if (key === 'dataset' && typeof val === 'object' && val) {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v != null) el.dataset[k] = String(v);
    }
  } else if (key === 'aria' && typeof val === 'object' && val) {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v != null) el.setAttribute(`aria-${k}`, String(v));
    }
  } else if (key === 'htmlFor') {
    (el as HTMLLabelElement).htmlFor = String(val);
  } else if (key === 'value') {
    (el as HTMLInputElement).value = String(val);
  } else if (key === 'checked') {
    (el as HTMLInputElement).checked = Boolean(val);
  } else if (key === 'disabled') {
    (el as HTMLButtonElement).disabled = Boolean(val);
  } else if (key === 'selected') {
    (el as HTMLOptionElement).selected = Boolean(val);
  } else if (key.startsWith('on') && typeof val === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
  } else if (key in el && key !== 'list' && !(el instanceof SVGElement)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any)[key] = val;
    } catch {
      el.setAttribute(key, String(val));
    }
  } else {
    el.setAttribute(key, String(val));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: HProps | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) setProp(el, k, v);
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (typeof c === 'string' || typeof c === 'number') {
      parent.appendChild(document.createTextNode(String(c)));
    } else {
      parent.appendChild(c);
    }
  }
}

/** DOM append that tolerates null/undefined/false children. */
export function appendNodes(parent: HTMLElement, ...children: Child[]): void {
  append(parent, children);
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/** Replace all children of `parent` with freshly rendered nodes. */
export function mount(parent: HTMLElement, children: Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}

/** Escape text for the (rare) places we must use innerHTML with constants only. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Query a descendant input/select by id within a rendered subtree. */
export function q<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing element: ${selector}`);
  return el;
}
