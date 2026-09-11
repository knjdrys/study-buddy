# StudyBuddy — Product Reconstruction

## Phase 1 · Repository archaeology

The previous StudyBuddy was a single 3,399-line `index.html` (plus `manifest.json`, `sw.js`) —
a "Study OS" with ~14 sidebar features, a Leitner box system, multi-mode quizzes, blurting,
Feynman teach-back, a template-based chatbot ("PareBot"), an auto mind map, Pomodoro/Zen
focus with WebAudio ambience, a bare calendar, 4-counter analytics, a mascot/XP/quest system,
dark mode, and PWA offline caching.

### What was good (product ideas worth keeping)
- Leitner/spaced review intent (boxes, confidence ratings)
- Blurting with a timed sprint and missed-item breakdown
- Feynman teach-back as a distinct mode
- Practice exams in multiple formats (MC / true-false / typed recall)
- Bulk import from bullet text, Anki CSV export, share/import links
- Command palette (Ctrl+K), keyboard shortcuts on flashcards
- Offline-first PWA ambitions, sample content for zero-to-value
- A "pathway" idea: guide the learner through a sequence of activities

### What was weak
- **Fake intelligence**: "AI" tutor answered with canned templates; Feynman/blurt "scores"
  were keyword overlap presented as evaluation; the "demystifier" generated templated analogies.
- **Fake mastery**: a Leitner box number (1–3) was the entire model of knowledge.
- **No scheduling**: rating buttons showed "1d / 3d / 7d" but nothing was ever scheduled.
- **Fake analytics**: 4 static counters; the calendar grid held no data.
- **Insecure sync/auth**: plaintext passwords in localStorage, a user-hosted Supabase table
  with public read/write policy, the entire vault base64-encoded into a shareable URL hash.
- **Deck-only organization**: no subject/topic/concept hierarchy; "active deck" was global state.
- **Interface clutter**: 14 sidebar entries, emoji as iconography, feature cards everywhere,
  decorative mascot/quest widgets with manual "claim" buttons, XP for feeding a pet.
- **Architecture**: one giant file, string-concatenated HTML, no types, no tests, no migrations,
  no error states, prompts (`prompt()`) as the form system.

## Phase 2 · Product strategy

**The product question**: *"What should this learner do next to actually learn?"*

StudyBuddy is a personal learning system built around one loop:

```
UNDERSTAND → RETRIEVE → PRACTICE → FEEDBACK → CORRECT → REVIEW → APPLY → MASTER
```

Every feature must serve a step of this loop and improve a real learning outcome:
recall, understanding, application, retention, confidence calibration, problem solving,
explanation, consistency.

### Information architecture
Primary (learner goals): **Home · Learn · Practice · Review · Progress**
Secondary: **Plan · Library · Tutor · Settings** (Tutor lives contextually inside Learn,
and in the command palette). Progressive disclosure: runners (sessions, exams, blurting,
Feynman) open from the goal screens, not from a feature menu.

### The center of gravity: the Study Session
Instead of asking the learner to pick a tool, StudyBuddy says:
*"You have 15 minutes. Here's the best way to use them."*
The session engine composes segments (retrieval warm-up → due review → weak-concept review
→ application → explanation → reflection) from real learner data: due schedule, mastery,
recent mistakes, confidence mismatches, upcoming exams, and available time.

### Concept-centered data model
The fundamental unit is the **Concept**, not the flashcard. A concept carries an
explanation, example, misconception, notes, resources, flashcards, questions (MC/TF/typed/
scenario), related concepts, review state, and mastery signals. All modes — flashcards,
practice, blurting, Feynman, tutor — operate on the same concepts and write into the same
history, which is what makes the session engine and insights possible.

### Honest AI
- AI is **optional**. The product is fully usable without any key.
- Local, deterministic engines (Socratic tutor, blurt/Feynman analysis, question templates)
  do real work with concept content and are labeled as such.
- With a user-provided key, LLM calls upgrade the tutor feedback, explanation review, and
  content drafting. AI-generated content is flagged (`AI-generated · unverified`) until the
  learner edits/verifies it.
- No "AI-powered" branding anywhere in the interface.

### Motivation philosophy
XP and streaks reward *learning acts* (retrieval, correction, mastery gains, sessions
completed, day goals met) — never idle time, never "feed the mascot". A missed day costs a
streak but not progress: best streak and weekly consistency are shown alongside.

## Phase 3 · Architecture

- **Build**: Vite + strict TypeScript, zero runtime UI dependencies, small custom render core.
- **Domain**: pure, deterministic engines in `src/engine` (scheduling, mastery, session
  planner, insights, readiness, analyses) — fully unit-tested.
- **Storage**: IndexedDB with versioned migrations and an in-memory + localStorage fallback;
  explicit entity tables and `updatedAt` timestamps on everything.
- **Sync**: offline-first. Local writes are always durable; an optional remote endpoint
  (user-hosted) syncs with a change queue, retry/backoff, and per-entity latest-wins merge.
  Full JSON backup export/import covers devices without a server.
- **UI**: hash-based router, state store with subscriptions, views as pure render functions,
  a shared design system (tokens → primitives → components), one inline-SVG icon set.
- **PWA**: vite-plugin-pwa precaches the app shell; fonts self-hosted; offline shell;
  update/reconnect handling.
- **Tests**: Vitest — engine unit tests, storage/migration tests, import/merge integration,
  DOM integration with happy-dom. 

## Phase 4 · Domain model (see docs/DATA_MODEL.md)

User · Subject · Topic · Concept · Resource · Flashcard · Question · Deck · Attempt ·
ReviewState · StudySession · StudyPlan · Goal · Exam · Mastery · Insight — all with IDs and
timestamps, all migration-friendly.

## Phase 5 · Design system

- **Typography**: Fraunces (editorial serif) for display and wordmark; Inter for UI.
  Type does most of the structural work; headings are restrained.
- **Color**: warm paper background, ink text, deep pine-green primary, amber for caution/
  highlights, muted red/green for outcomes. Color communicates state, never decorates.
- **Surfaces**: open layouts with dividers and whitespace; cards only where containment
  aids comprehension (session steps, exam results). No glass, no gradients, no glow.
- **Motion**: 120–200ms, purposeful (what changed?), respects `prefers-reduced-motion`.
- **Copy**: human. "Let's pick up where you left off." — never corporate AI-speak.
