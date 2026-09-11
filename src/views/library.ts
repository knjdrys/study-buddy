/**
 * Library — the organized knowledge space: subjects, decks, questions,
 * notes, materials; plus import/export and the sample library.
 */

import { h, mount } from '../lib/h';
import { icon } from '../lib/icons';
import type { Ctx } from '../app/ctx';
import { store } from '../app/state';
import {
  createDeck,
  createSubject,
  deleteDeck,
  updateSubject,
} from '../app/actions';
import {
  parsePairs,
  parseCSV,
  looksLikeCSV,
  looksLikeJSON,
  parseLegacyDeckJSON,
  buildConceptsFromPairs,
  isBackupJSON,
  validateBackup,
} from '../engine/import';
import { exportBackup } from '../app/actions';
import { buildSeedDB } from '../data/seed';
import { pageHead, sectionLabel, emptyState, btn, field } from './kit';
import { openDialog, closeDialog, toast, confirmDialog } from '../app/ui';
import { openSubjectEditor } from './learn';
import { openReviewCards } from './runners/cards';
import type { Concept } from '../domain/types';

export function viewLibrary(c: Ctx): Node[] {
  const db = store.get();
  const subjects = db.subjects;
  const archived = subjects.filter((s) => s.archivedAt);
  const questionCount = db.concepts.reduce((n, x) => n + x.questions.length, 0);
  const noteCount = db.concepts.reduce((n, x) => n + x.resources.length + (x.notes ? 1 : 0), 0);

  const nodes: Node[] = [
    pageHead({
      kicker: 'Library',
      title: 'Your knowledge, organized',
      sub: 'Subjects, topics, concepts, decks, questions and notes — everything lives here, and everything is portable.',
      actions: [
        btn('Import', { kind: 'primary', iconName: 'upload', run: () => openImportDialog() }),
        btn('Export', { iconName: 'download', run: () => openExportDialog() }),
      ],
    }),
  ];

  if (!db.concepts.length) {
    nodes.push(
      emptyState({
        glyph: '☰',
        title: 'The library is empty',
        body: 'Three ways in: paste your notes, import a file, or start from the sample library.',
        actions: [
          btn('Import notes', { kind: 'primary', run: () => openImportDialog() }),
          btn('Add the sample library', { run: () => {
            store.update((d) => {
              const seed = buildSeedDB();
              d.subjects.push(...seed.subjects);
              d.topics.push(...seed.topics);
              d.concepts.push(...seed.concepts);
            });
            toast('Sample library added — three subjects, ready to study.');
          } }),
        ],
      }),
    );
    return nodes;
  }

  nodes.push(
    h('div', { class: 'chip-btns mb-4' },
      h('span', { class: 'chip' }, `${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'}`),
      h('span', { class: 'chip' }, `${db.topics.length} topics`),
      h('span', { class: 'chip' }, `${db.concepts.length} concepts`),
      h('span', { class: 'chip' }, `${questionCount} questions`),
      h('span', { class: 'chip' }, `${db.decks.length} decks`),
      h('span', { class: 'chip' }, `${noteCount} notes & resources`),
    ),
  );

  // subjects
  nodes.push(
    sectionLabel('Subjects', { label: 'New subject', run: () => openSubjectEditor() }),
    h('div', {},
      ...subjects.filter((s) => !s.archivedAt).map((s) => {
        const conceptCount = db.concepts.filter((x) => x.subjectId === s.id).length;
        return h('button', { class: 'row', type: 'button', onclick: () => c.nav('subject', { id: s.id }) },
          icon('book-open', 17),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title' }, s.name),
            h('div', { class: 'row-sub' }, `${conceptCount} concepts${s.exam ? ` · exam ${s.exam.date}` : ''}`),
          ),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: (e: Event) => { e.stopPropagation(); openSubjectEditor(s.id); } }, icon('edit', 14)),
          icon('chevron-right', 14),
        );
      }),
    ),
  );

  // decks
  nodes.push(
    sectionLabel('Decks', { label: 'New deck', run: () => openDeckEditor() }),
  );
  if (db.decks.length) {
    nodes.push(
      h('div', {},
        ...db.decks.map((deck) =>
          h('div', { class: 'row', style: { cursor: 'default' } as Partial<CSSStyleDeclaration> },
            icon('grid', 17),
            h('div', { class: 'row-main' },
              h('div', { class: 'row-title' }, deck.name),
              h('div', { class: 'row-sub' }, `${deck.cards.length} cards`),
            ),
            h('button', { class: 'btn btn-sm', type: 'button', onclick: () => studyDeck(deck.id) }, 'Study'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => confirmDialog({
              title: `Delete “${deck.name}”?`,
              body: 'Concepts themselves are untouched — only this deck list goes away.',
              confirmLabel: 'Delete deck',
              danger: true,
              onConfirm: () => { deleteDeck(deck.id); toast('Deck deleted.'); },
            }) }, icon('trash', 14)),
          ),
        ),
      ),
    );
  } else {
    nodes.push(
      h('p', { class: 'small muted', style: { padding: 'var(--space-2)' } as Partial<CSSStyleDeclaration> },
        'Decks are hand-picked subsets of cards — useful for a topic you want to focus. None yet.'),
    );
  }

  // archived
  if (archived.length) {
    nodes.push(
      sectionLabel('Archived'),
      h('div', {},
        ...archived.map((s) =>
          h('div', { class: 'row', style: { cursor: 'default', opacity: '0.7' } as Partial<CSSStyleDeclaration> },
            icon('book-open', 17),
            h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, s.name), h('div', { class: 'row-sub' }, 'archived')),
            h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
              updateSubject(s.id, { archivedAt: undefined });
              toast(`“${s.name}” restored.`);
            } }, 'Restore'),
          ),
        ),
      ),
    );
  }

  return nodes;
}

/* ---------------- decks ---------------- */

function openDeckEditor(): void {
  const db = store.get();
  const name = h('input', { class: 'input', placeholder: 'e.g. Cell division focus' }) as HTMLInputElement;
  const subjectSelect = h('select', { class: 'select', value: db.subjects[0]?.id ?? '' },
    ...db.subjects.filter((s) => !s.archivedAt).map((s) => h('option', { value: s.id, selected: s.id === db.subjects[0]?.id }, s.name)),
  ) as HTMLSelectElement;
  const list = h('div', { class: 'stack', style: { maxHeight: '240px', overflowY: 'auto' } as Partial<CSSStyleDeclaration> });
  const chosen = new Set<string>();

  const renderList = () => {
    mount(list, []);
    const concepts = db.concepts.filter((x) => x.subjectId === subjectSelect.value);
    for (const concept of concepts) {
      const on = chosen.has(concept.id);
      list.appendChild(
        h('button', { class: 'row', type: 'button', onclick: () => {
          on ? chosen.delete(concept.id) : chosen.add(concept.id);
          renderList();
        } },
          h('span', {
            style: {
              width: '18px', height: '18px', borderRadius: '5px', flex: 'none',
              border: '1px solid var(--line-2)', background: on ? 'var(--pine)' : 'var(--surface)',
              display: 'grid', placeItems: 'center', color: '#fff', fontSize: '11px',
            } as Partial<CSSStyleDeclaration>,
          }, on ? '✓' : ''),
          h('div', { class: 'row-main' },
            h('div', { class: 'row-title', style: { fontSize: '13.5px' } as Partial<CSSStyleDeclaration> }, concept.name),
            h('div', { class: 'row-sub' }, `${concept.flashcards.length} cards`),
          ),
        ),
      );
    }
    if (!concepts.length) list.appendChild(h('p', { class: 'tiny subtle' }, 'No concepts in this subject.'));
  };
  renderList();
  subjectSelect.addEventListener('change', renderList);

  openDialog({
    title: 'New deck',
    body: [
      field({ label: 'Deck name', control: name }),
      field({ label: 'Subject', control: subjectSelect }),
      h('div', { class: 'label' }, 'Pick the concepts to include'),
      list,
    ],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        if (!name.value.trim()) { toast('Name the deck.'); return; }
        const deck = createDeck(name.value, subjectSelect.value);
        store.update((d) => {
          const target = d.decks.find((x) => x.id === deck.id)!;
          target.cards = [];
          for (const id of chosen) {
            const concept = d.concepts.find((x) => x.id === id);
            if (concept?.flashcards[0]) target.cards.push({ conceptId: id, flashcardId: concept.flashcards[0].id });
          }
        });
        closeDialog();
        toast(`Deck “${name.value.trim()}” created.`);
      } }, 'Create deck'),
    ],
  });
}

function studyDeck(deckId: string): void {
  const db = store.get();
  const deck = db.decks.find((d) => d.id === deckId);
  if (!deck?.cards.length) { toast('This deck has no cards yet.'); return; }
  const concepts = new Map<string, Concept>();
  for (const card of deck.cards) {
    if (!concepts.has(card.conceptId)) {
      const concept = db.concepts.find((x) => x.id === card.conceptId);
      if (concept) concepts.set(card.conceptId, concept);
    }
  }
  openReviewCards([...concepts.values()], `Deck · ${deck.name}`);
}

/* ---------------- import ---------------- */

function openImportDialog(): void {
  const db = store.get();
  const textarea = h('textarea', {
    class: 'textarea',
    rows: 8,
    placeholder: 'Paste your notes here — “Term: definition” lines, Quizlet/Anki CSV, an old StudyBuddy deck, or a full backup file…',
  }) as HTMLTextAreaElement;
  const modeSelect = h('select', { class: 'select', value: 'auto' },
    h('option', { value: 'auto' }, 'Detect automatically'),
    h('option', { value: 'bullets' }, 'Notes (term: definition)'),
    h('option', { value: 'csv' }, 'CSV (Quizlet / Anki export)'),
    h('option', { value: 'backup' }, 'Full StudyBuddy backup'),
  ) as HTMLSelectElement;
  const targetSelect = h('select', { class: 'select', value: 'new' },
    h('option', { value: 'new' }, 'New subject'),
    ...db.subjects.filter((s) => !s.archivedAt).map((s) => h('option', { value: s.id }, s.name)),
  ) as HTMLSelectElement;
  const newSubjectName = h('input', { class: 'input', placeholder: 'Name for the new subject' }) as HTMLInputElement;
  const preview = h('p', { class: 'tiny subtle' });

  const refreshPreview = () => {
    const raw = textarea.value.trim();
    if (!raw) { preview.textContent = ''; return; }
    const mode = modeSelect.value;
    try {
      if (mode === 'backup' || (mode === 'auto' && looksLikeJSON(raw) && isBackupJSON(raw))) {
        const b = validateBackup(raw);
        preview.textContent = `Backup with ${b.subjects.length} subjects and ${b.concepts.length} concepts.`;
      } else if (mode === 'csv' || (mode === 'auto' && looksLikeCSV(raw))) {
        preview.textContent = `${parseCSV(raw).length} rows detected.`;
      } else if (mode === 'auto' && looksLikeJSON(raw)) {
        const legacy = parseLegacyDeckJSON(raw);
        preview.textContent = legacy ? `Shared deck “${legacy.subject}” with ${legacy.pairs.length} terms.` : 'Unrecognized JSON.';
      } else {
        preview.textContent = `${parsePairs(raw).length} term lines detected.`;
      }
    } catch {
      preview.textContent = 'That doesn\u2019t look valid yet.';
    }
  };
  textarea.addEventListener('input', refreshPreview);
  modeSelect.addEventListener('change', refreshPreview);

  openDialog({
    title: 'Import into the library',
    wide: true,
    body: [
      field({ label: 'What are you importing?', control: modeSelect }),
      field({ label: 'Paste it here', control: textarea }),
      h('div', { class: 'field-row' },
        field({ label: 'Put it in', control: targetSelect }),
        field({ label: 'New subject name', hint: 'if creating', control: newSubjectName }),
      ),
      preview,
    ],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        const raw = textarea.value.trim();
        if (!raw) { toast('Paste something first.'); return; }
        const mode = modeSelect.value;
        try {
          if (mode === 'backup' || (mode === 'auto' && looksLikeJSON(raw) && isBackupJSON(raw))) {
            const backup = validateBackup(raw);
            store.update((d) => {
              const take = (local: { id: string }[], remote: { id: string }[]) => {
                const ids = new Set(local.map((x) => x.id));
                for (const r of remote) if (!ids.has(r.id)) local.push(r as never);
              };
              take(d.subjects, backup.subjects);
              take(d.topics, backup.topics);
              take(d.concepts, backup.concepts);
              take(d.decks, backup.decks);
              take(d.sessions, backup.sessions);
              take(d.attempts, backup.attempts);
              take(d.insights, backup.insights);
              take(d.xp, backup.xp);
              for (const [k, v] of Object.entries(backup.review)) {
                if (!d.review[k]) d.review[k] = v;
              }
            });
            closeDialog();
            toast(`Imported ${backup.subjects.length} subjects from backup.`);
            return;
          }
          let pairs;
          if (mode === 'csv' || (mode === 'auto' && looksLikeCSV(raw))) pairs = parseCSV(raw);
          else if (mode === 'auto' && looksLikeJSON(raw)) {
            const legacy = parseLegacyDeckJSON(raw);
            if (!legacy) { toast('That JSON isn\u2019t a deck or backup.'); return; }
            pairs = legacy.pairs;
            newSubjectName.value = legacy.subject || newSubjectName.value;
          } else pairs = parsePairs(raw);
          if (!pairs.length) { toast('Couldn\u2019t find any term lines.'); return; }
          const target = targetSelect.value;
          const subjectId = target === 'new'
            ? createSubject({ name: newSubjectName.value.trim() || 'Imported notes' }).id
            : target;
          const built = buildConceptsFromPairs(subjectId, pairs);
          store.update((d) => d.concepts.push(...built.concepts));
          closeDialog();
          toast(`Imported ${built.concepts.length} concepts${built.skipped ? ` (${built.skipped} skipped)` : ''}.`);
          window.location.hash = `#/subject/id/${encodeURIComponent(subjectId)}`;
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Import failed — check the format.');
        }
      } }, 'Import'),
    ],
  });
}

/* ---------------- export ---------------- */

function openExportDialog(): void {
  const db = store.get();
  const subjectSelect = h('select', { class: 'select', value: '' },
    h('option', { value: '' }, 'Full backup (JSON)'),
    ...db.subjects.filter((s) => !s.archivedAt).map((s) => h('option', { value: s.id }, `${s.name} (CSV)`)),
  ) as HTMLSelectElement;

  openDialog({
    title: 'Export',
    body: [
      field({ label: 'What to export', control: subjectSelect }),
      h('p', { class: 'tiny subtle' },
        'The backup contains everything except your API keys. Import it on another device (Library → Import) to continue there.'),
    ],
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        const target = subjectSelect.value;
        if (!target) {
          downloadFile('studybuddy-backup.json', exportBackup(), 'application/json');
          toast('Backup downloaded.');
        } else {
          const subject = db.subjects.find((s) => s.id === target)!;
          const rows = ['term,definition'];
          for (const concept of db.concepts.filter((x) => x.subjectId === target)) {
            for (const f of concept.flashcards) {
              rows.push(`"${f.front.replace(/"/g, '""')}","${f.back.replace(/"/g, '""')}"`);
            }
            if (!concept.flashcards.length) rows.push(`"${concept.name.replace(/"/g, '""')}","${concept.summary.replace(/"/g, '""')}"`);
          }
          downloadFile(`${subject.name.replace(/[^\w]+/g, '-').toLowerCase()}.csv`, rows.join('\n'), 'text/csv');
          toast('CSV exported — importable by Anki and Quizlet.');
        }
        closeDialog();
      } }, 'Download'),
    ],
  });
}

function downloadFile(name: string, content: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
