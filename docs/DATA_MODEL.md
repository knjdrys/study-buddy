# StudyBuddy — Data model

All entities carry `id` (short typed prefix, e.g. `sub_`, `con_`) and ISO `createdAt` /
`updatedAt` timestamps. Storage is append-friendly and migration-friendly (IndexedDB
versioned migrations).

## Entities

| Entity        | id prefix | Key fields |
|---------------|-----------|------------|
| Profile       | `user`    | name, joinedAt, preferences |
| Settings      | — (kv)    | theme, dailyGoalMinutes, preferredMinutes, notifications, aiProvider/key/model, syncEndpoint |
| Subject       | `sub`     | name, code, description, accent, goal, exam {date,label}, archivedAt |
| Topic         | `top`     | subjectId, name, description, position |
| Concept       | `con`     | subjectId, topicId, name, summary, explanation, example, misconception, notes, relatedIds, resources[], flashcards[], questions[], difficulty, ai {origin, verified}, review state ref |
| Resource      | `res`     | kind (note/link/book), title, body/url |
| Flashcard     | `fc`      | front, back, hint |
| Question      | `q`       | kind (mc/tf/typed/scenario/problem), prompt, options, answer, explanation |
| Deck          | `deck`    | name, subjectId, conceptIds[] (a curated subset of flashcards) |
| Attempt       | `att`     | conceptId, mode, outcome (correct/partial/incorrect), confidence (0–3), elapsedMs, at |
| ReviewState   | (per concept) | stage, ease, intervalDays, dueAt, lapses, lastReviewedAt, reviewCount |
| StudySession  | `sess`    | subjectId, minutesPlanned/actual, segments[{kind, conceptIds, minutes}], status, started/endedAt |
| StudyPlan     | `plan`    | subjectId, examDate, minutesPerDay, daysPerWeek, startDate, reviewedAt |
| Goal          | `goal`    | kind (daily-minutes / exam-ready / mastery-count), subjectId, target, window |
| Insight       | `ins`     | kind, subjectId, conceptIds, title, body, at (derived from attempts; deduped) |
| XP event      | `xp`      | amount, reason, at (derived from real learning acts only) |

## Mastery model

Stage: `new → introduced → learning → familiar → developing → proficient → mastered`,
with a transient `needs-review` flag when a mastered concept starts failing.

Mastery score (0–1) blends: accuracy (EMA), lapses, recency, response-time ratio,
difficulty, application accuracy, explanation coverage. Stages are thresholds over the
score plus evidence counts — deterministic, tested, and recomputable from attempts.

## Scheduling model

SM-2-family intervals with per-concept ease and lapses; confidence ratings map to
interval multipliers; "again" reschedules within the session window. All scheduling is a
pure function of (reviewState, confidence, now) so it is trivially testable and
time-travelable.

## Sync model

- Local writes are always durable first.
- Optional remote: `GET /state?since=…` → pull; `POST /changes` → push (batched, retry +
  backoff, offline queue).
- Conflict policy: per-entity `updatedAt` latest-wins; attempts are append-only and merge
  by id; deletions use tombstones. Learner progress is never silently overwritten.
- Full backup: versioned JSON export; import validates schema version and runs migrations.

## Smart Question Engine (src/engine/questionbrain.ts)

The brain generates every practice/exam question. Rules:

1. **Understanding first.** Each concept gets a semantic profile (`understand()`):
   category ("a unique hardware address"), function ("identify a device across
   networks"), facts, keywords, example, misconception. Definition-shaped
   statements only — card backs like "O(log n)" or verb-led fragments fall
   back to the summary.
2. **Distractors are definitions, never term names.** MC options are parallel
   "A …" statements built from *similar* concepts' definitions
   (`distractorDefinitions`, `asDefinition`). If meaningful distractors can't
   be built, the engine switches question kind — it never falls back to a
   name list. Name options exist only in identify/fill (where the term *is*
   the answer type).
3. **Four cognitive levels.** L1 recall ("What is X?") → L2 distinguish
   ("Which statement describes X?", feature-swapped true/false) → L3 apply
   (examples, "you need to … which do you use?") → L4 judge ("which situation
   calls for X?").
4. **Seven modes.** mc, identify (definition → term), tf, fill (real sentence
   cloze), match (term↔definition pairs), short (explain & compare, checked
   against content), scenario.
5. **Adaptive.** `levelFor()` reads the last attempts (accuracy, misses,
   answer speed). `planQuestions()` allocates more questions to struggling
   concepts, varies their kind, and prioritizes comparisons against
   `confusions()` — wrong picks are tracked via `Attempt.distractorConceptId`
   (which concept's definition fooled the learner), so the next paper targets
   exactly that mix-up. Mastered concepts rise to scenario/judgment levels
   with fewer repeats.
6. **No back-to-back repeats** — the interleaver places the largest remaining
   pile first while keeping ≥1 question between repeats of a concept.
