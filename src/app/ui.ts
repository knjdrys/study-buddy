/**
 * UI primitives: toasts, dialogs, overlays, confirmations.
 * Dialogs trap focus, close on Esc/backdrop, and honor reduced motion.
 */

import { h, mount, type Child } from '../lib/h';
import { icon } from '../lib/icons';

/* ---------------- toast ---------------- */

let toastWrap: HTMLElement | null = null;

export interface ToastOptions {
  duration?: number;
  action?: { label: string; run: () => void };
  keep?: boolean;
}

export function toast(message: string, opts: ToastOptions = {}): void {
  if (!toastWrap) {
    toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastWrap);
  }
  const el = h('div', { class: `toast${opts.keep ? ' keep' : ''}` });
  mount(el, [message]);
  if (opts.action) {
    const b = h('button', { class: 'toast-action', type: 'button' }, opts.action.label);
    b.addEventListener('click', () => {
      remove();
      opts.action!.run();
    });
    el.appendChild(b);
  }
  toastWrap.appendChild(el);
  const remove = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };
  if (!opts.keep) setTimeout(remove, opts.duration ?? 3200);
}

/* ---------------- dialog ---------------- */

let dialogEl: HTMLElement | null = null;
let lastFocus: HTMLElement | null = null;

export interface DialogSpec {
  title: string;
  body?: Child[];
  actions?: Child[];
  wide?: boolean;
  onClose?: () => void;
}

export function openDialog(spec: DialogSpec): HTMLElement {
  closeDialog();
  lastFocus = document.activeElement as HTMLElement | null;

  const backdrop = h('div', {
    class: 'dialog-backdrop',
    role: 'presentation',
  });
  const card = h('div', {
    class: `dialog${spec.wide ? ' wide' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    aria: { label: spec.title },
  });
  card.appendChild(
    h(
      'div',
      { class: 'dialog-head' },
      h('h2', { class: 'dialog-title' }, spec.title),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-icon',
          type: 'button',
          aria: { label: 'Close dialog' },
          onclick: closeDialog,
        },
        icon('x', 18),
      ),
    ),
  );
  if (spec.body?.length) card.appendChild(h('div', { class: 'dialog-body' }, spec.body));
  if (spec.actions?.length) {
    card.appendChild(h('div', { class: 'dialog-actions' }, spec.actions));
  }
  backdrop.appendChild(card);
  dialogEl = backdrop;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDialog();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDialog();
    }
    if (e.key === 'Tab') {
      const focusables = card.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!focusables.length) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  (backdrop as HTMLElement & { _cleanup?: () => void })._cleanup = () =>
    document.removeEventListener('keydown', onKey, true);

  const initial = card.querySelector<HTMLElement>('input, textarea, select, button');
  setTimeout(() => initial?.focus(), 30);
  return card;
}

export function closeDialog(): void {
  if (!dialogEl) return;
  const el = dialogEl;
  dialogEl = null;
  (el as HTMLElement & { _cleanup?: () => void })._cleanup?.();
  el.remove();
  lastFocus?.focus?.();
  lastFocus = null;
}

export function dialogActions(...children: Child[]): Child[] {
  return children;
}

/* ---------------- confirm ---------------- */

export function confirmDialog(opts: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}): void {
  openDialog({
    title: opts.title,
    body: [h('p', { class: 'muted' }, opts.body)],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h(
        'button',
        {
          class: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`,
          type: 'button',
          onclick: () => {
            closeDialog();
            opts.onConfirm();
          },
        },
        opts.confirmLabel,
      ),
    ],
  });
}

/* ---------------- fullscreen overlay (runners) ---------------- */

let overlayEl: HTMLElement | null = null;

export function openOverlay(content: HTMLElement, onClose?: () => void): HTMLElement {
  closeOverlay();
  const wrap = h('div', {
    class: 'runner-overlay',
    style: {
      position: 'fixed',
      inset: '0',
      zIndex: '90',
      background: 'var(--paper)',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      padding: 'calc(var(--space-6) + env(safe-area-inset-top, 0px)) var(--space-4) calc(var(--space-10) + env(safe-area-inset-bottom, 0px))',
      animation: 'viewIn 260ms var(--ease)',
    } as Partial<CSSStyleDeclaration>,
  });
  wrap.appendChild(content);
  overlayEl = wrap;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (onClose) onClose();
      else closeOverlay();
    }
  };
  document.addEventListener('keydown', onKey, true);
  (wrap as HTMLElement & { _cleanup?: () => void })._cleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = '';
  };
  return wrap;
}

export function closeOverlay(): void {
  if (!overlayEl) return;
  const el = overlayEl;
  overlayEl = null;
  (el as HTMLElement & { _cleanup?: () => void })._cleanup?.();
  el.remove();
}
