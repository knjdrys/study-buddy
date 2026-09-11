/**
 * Settings — profile, study defaults, optional AI, sync, data management.
 * Everything local-first: keys never leave this device except to the
 * provider you chose.
 */

import { h } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { store } from '../app/state';
import { setProfileName, patchSettings, patchAISettings, clearAllData, exportBackup } from '../app/actions';
import { syncNow, status as syncStatus } from '../app/sync';
import { callLLM } from '../ai/provider';
import { pageHead, sectionLabel, field, input, inlineSwitch } from './kit';
import { toast, confirmDialog } from '../app/ui';
import { fmtClock } from '../lib/util';
import type { ThemeMode } from '../domain/types';

export function viewSettings(c: Ctx): Node[] {
  const db = store.get();
  const s = db.settings;
  const nodes: Node[] = [
    pageHead({
      kicker: 'Settings',
      title: 'Make it yours',
      sub: 'Local-first: your data lives on this device. Sync and AI are optional extras you opt into.',
    }),
  ];

  // ---- profile ----
  const nameInput = input({ value: db.profile?.name ?? '', placeholder: 'Your name' }) as HTMLInputElement;
  nodes.push(
    sectionLabel('Profile'),
    h('div', { class: 'panel' },
      h('div', { class: 'field-row' },
        field({ label: 'Name', control: nameInput }),
        h('div', { class: 'field' },
          h('label', { class: 'label' }, 'Member since'),
          h('p', { class: 'small muted', style: { padding: '10px 0' } as Partial<CSSStyleDeclaration> },
            db.profile?.joinedAt ? new Date(db.profile.joinedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—'),
        ),
      ),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => {
        setProfileName(nameInput.value.trim() || 'Learner');
        toast('Saved.');
      } }, 'Save profile'),
    ),
  );

  // ---- study defaults ----
  const dailyGoal = h('input', { class: 'input', type: 'number', min: '5', max: '240', value: String(s.dailyGoalMinutes), style: { maxWidth: '120px' } as Partial<CSSStyleDeclaration> }) as HTMLInputElement;
  const sessionMin = h('input', { class: 'input', type: 'number', min: '5', max: '120', value: String(s.preferredSessionMinutes), style: { maxWidth: '120px' } as Partial<CSSStyleDeclaration> }) as HTMLInputElement;
  nodes.push(
    sectionLabel('Studying'),
    h('div', { class: 'panel' },
      h('div', { class: 'field-row' },
        field({ label: 'Daily goal', hint: 'minutes', control: dailyGoal }),
        field({ label: 'Usual session', hint: 'minutes', control: sessionMin }),
      ),
      h('div', { class: 'inline-field' },
        h('span', { class: 'label' }, 'Read answers aloud', h('span', { class: 'hint' }, ' · uses speech synthesis')),
        inlineSwitch(s.speech, (v) => patchSettings({ speech: v })),
      ),
      h('div', { class: 'inline-field' },
        h('span', { class: 'label' }, 'Review reminders', h('span', { class: 'hint' }, ' · browser notification when reviews are due')),
        inlineSwitch(s.notifications, (v) => {
          patchSettings({ notifications: v });
          if (v && 'Notification' in window && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
        }),
      ),
      h('button', { class: 'btn btn-primary btn-sm mt-2', type: 'button', onclick: () => {
        patchSettings({
          dailyGoalMinutes: Math.max(5, Number(dailyGoal.value) || 20),
          preferredSessionMinutes: Math.max(5, Number(sessionMin.value) || 15),
        });
        toast('Study defaults saved.');
      } }, 'Save defaults'),
    ),
  );

  // ---- appearance ----
  const themeBtns: { id: ThemeMode; label: string }[] = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'auto', label: 'Follow system' },
  ];
  nodes.push(
    sectionLabel('Appearance'),
    h('div', { class: 'panel' },
      h('div', { class: 'btn-row' },
        ...themeBtns.map((t) =>
          h('button', { class: `btn btn-sm ${s.theme === t.id ? 'btn-primary' : ''}`, type: 'button', onclick: () => {
            patchSettings({ theme: t.id });
            import('./shell').then((m) => {
              m.applyTheme(t.id);
              m.refreshThemeIcons();
            });
          } }, t.label),
        ),
      ),
      h('p', { class: 'tiny subtle mt-2' }, 'The interface respects reduced-motion preferences from your system.'),
    ),
  );

  // ---- AI (optional) ----
  const provider = h('select', { class: 'select', value: s.ai.provider },
    h('option', { value: 'none' }, 'No AI — local only'),
    h('option', { value: 'openai' }, 'OpenAI (bring your own key)'),
    h('option', { value: 'gemini' }, 'Google Gemini (bring your own key)'),
  ) as HTMLSelectElement;
  const apiKey = h('input', { class: 'input', type: 'password', placeholder: 'sk-… or AIza…', value: s.ai.apiKey, autocomplete: 'off' }) as HTMLInputElement;
  const model = h('input', { class: 'input', placeholder: 'gpt-4o-mini / gemini-1.5-flash (blank = sensible default)', value: s.ai.model }) as HTMLInputElement;
  nodes.push(
    sectionLabel('AI (optional)'),
    h('div', { class: 'panel' },
      h('p', { class: 'small muted', style: { marginBottom: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
        'StudyBuddy works completely without AI. If you bring your own key, the tutor feedback and content drafting get richer. The key is stored only on this device and is sent only to the provider you pick.'),
      h('div', { class: 'field-row' },
        field({ label: 'Provider', control: provider }),
        field({ label: 'API key', control: apiKey }),
      ),
      field({ label: 'Model', hint: 'optional', control: model }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => {
          patchAISettings({
            provider: provider.value as 'openai' | 'gemini' | 'none',
            apiKey: apiKey.value.trim(),
            model: model.value.trim(),
          });
          toast('AI settings saved.');
        } }, 'Save'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
          const testBtn = document.activeElement as HTMLButtonElement;
          testBtn.disabled = true;
          patchAISettings({ provider: provider.value as 'openai' | 'gemini' | 'none', apiKey: apiKey.value.trim(), model: model.value.trim() });
          callLLM(store.get().settings, 'You are a test.', 'Reply with the single word: ready')
            .then(() => toast('Connection works.'))
            .catch((e: Error) => toast(`Couldn't reach the provider: ${e.message}`, { duration: 5000 }))
            .finally(() => { testBtn.disabled = false; });
        } }, 'Test connection'),
      ),
    ),
  );

  // ---- sync ----
  const sync = syncStatus();
  const endpoint = h('input', { class: 'input', placeholder: 'https://your-server.example/studybuddy', value: s.sync?.endpoint ?? '' }) as HTMLInputElement;
  const token = h('input', { class: 'input', type: 'password', placeholder: 'Bearer token (optional)', value: s.sync?.token ?? '', autocomplete: 'off' }) as HTMLInputElement;
  nodes.push(
    sectionLabel('Sync across devices'),
    h('div', { class: 'panel' },
      h('p', { class: 'small muted', style: { marginBottom: 'var(--space-3)' } as Partial<CSSStyleDeclaration> },
        'Optional: point StudyBuddy at a tiny server you control (GET/PUT one JSON document, bearer token). Conflicts merge per item by latest edit — your progress is never silently overwritten.'),
      h('div', { class: 'field-row' },
        field({ label: 'Endpoint', control: endpoint }),
        field({ label: 'Token', hint: 'optional', control: token }),
      ),
      h('div', { class: 'split', style: { alignItems: 'center' } as Partial<CSSStyleDeclaration> },
        h('div', { class: 'chip-btns' },
          h('span', { class: `chip ${sync.online ? 'moss' : 'berry'}` }, sync.online ? 'online' : 'offline'),
          sync.pending > 0 ? h('span', { class: 'chip amber' }, `${sync.pending} changes waiting`) : null,
          sync.lastPushedAt ? h('span', { class: 'chip' }, `pushed ${fmtClock(sync.lastPushedAt)}`) : null,
          sync.error ? h('span', { class: 'chip berry' }, 'last attempt failed') : null,
        ),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => {
            patchSettings({ sync: { endpoint: endpoint.value.trim(), token: token.value.trim() || undefined } });
            toast('Sync config saved.');
          } }, 'Save'),
          h('button', { class: 'btn btn-sm', type: 'button', disabled: !endpoint.value.trim(), onclick: () => {
            void syncNow().then(() => {
              const st = syncStatus();
              toast(st.error ? `Sync failed: ${st.error}` : 'Synced.');
            });
          } }, 'Sync now'),
        ),
      ),
    ),
  );

  // ---- data ----
  nodes.push(
    sectionLabel('Your data'),
    h('div', { class: 'panel' },
      h('div', { class: 'stack' },
        h('div', { class: 'inline-field' },
          h('span', { class: 'label' }, 'Export everything', h('span', { class: 'hint' }, ' · JSON backup, no API keys')),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([exportBackup()], { type: 'application/json' }));
            a.download = 'studybuddy-backup.json';
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Backup downloaded.');
          } }, icon('download', 14), 'Download'),
        ),
        h('div', { class: 'inline-field' },
          h('span', { class: 'label' }, 'Import a backup', h('span', { class: 'hint' }, ' · merges with what you have')),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
            const file = document.createElement('input');
            file.type = 'file';
            file.accept = '.json,application/json';
            file.onchange = () => {
              const f = file.files?.[0];
              if (!f) return;
              void f.text().then((raw) => {
                try {
                  const parsed = JSON.parse(raw) as { subjects?: unknown };
                  if (typeof parsed.subjects !== 'undefined' && Array.isArray(parsed.subjects)) {
                    c.nav('library');
                    toast('Backup ready — use Library → Import to merge it.', { duration: 5000 });
                  } else {
                    toast('That file doesn\u2019t look like a StudyBuddy backup.');
                  }
                } catch {
                  toast('Couldn\u2019t read that file.');
                }
              });
            };
            file.click();
          } }, icon('upload', 14), 'Choose file'),
        ),
        h('div', { class: 'inline-field' },
          h('span', { class: 'label' }, 'Clear everything', h('span', { class: 'hint' }, ' · irreversible')),
          h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => {
            confirmDialog({
              title: 'Clear all data?',
              body: 'Every subject, concept, attempt and setting on this device will be deleted. Export a backup first if there\u2019s any chance you\u2019ll want it back.',
              confirmLabel: 'Delete everything',
              danger: true,
              onConfirm: () => {
                clearAllData();
                toast('Cleared. Fresh start.');
              },
            });
          } }, icon('trash', 14), 'Clear'),
        ),
      ),
    ),
  );

  nodes.push(
    h('p', { class: 'tiny subtle mt-4 center' },
      `StudyBuddy 2.0 · everything is stored on this device and works offline · no accounts required.`,
    ),
  );

  return nodes;
}
