# Progress

## Completed (MVP)

- Project scaffold: Vite + React + TypeScript (strict), Vitest.
- Data model and zod schema (`src/lib/schema.ts`), versioned JSON export/import with validation and defaults.
- Node-based scene editor: add/move/delete scenes, connect/delete transitions, self-loops, start scene, minimap, controls.
- Dream/reality crossing detection and visual encoding; unreachable scenes dimmed.
- Scene inspector (type, duration, Unreal level path, ambience, loop settings, character states) and transition inspector.
- Horror trigger timeline: SVG track, draggable markers, intensity curve, event list and editor.
- Character module: characters, behaviour states, scene × character state matrix.
- Analysis tab: structural validation, Tarjan SCC loop detection, statistics.
- Local persistence (debounced `localStorage`, validated on load), New / Sample / Import / Export.
- Responsive layout (bottom-sheet inspector on narrow screens).
- Tests: 15 unit tests (graph analysis, import/export round-trip and rejection, store actions). `npm run build` passes.
- Manual browser smoke test (Chromium via Playwright): load, add scene, persistence across reload, all tabs, desktop and mobile widths, no console errors.

## Known limitations

- Single project at a time in storage (use Export for multiple projects/backups).
- Opposing edges between the same two scenes overlap visually; edge labels may collide in dense graphs (no auto-layout).
- Transitions between the same ordered pair of scenes are limited to one.
- Timeline is per-scene; there is no cross-scene "run-through" intensity view yet.
- Touch support for graph editing relies on React Flow defaults; timeline drag is pointer-based but only lightly tested on touch.
- No Unreal-side importer yet; the JSON format is documented in the README and is versioned (`schemaVersion`).
- No component/E2E test suite in the repo (browser checks were manual).
- Production bundle is ~540 kB (no code-splitting).

## Ideas for next steps

Undo/redo, auto-layout (dagre/elk), multi-project library, path simulator with sanity/intensity curve across a route,
Unreal importer plugin / DataTable CSV export, audio cue library, scene thumbnails.

## V0.2 — Editor Reliability Pass

### Delivered
- **Undo/redo**: bounded history (50 steps) for all project edits, including destructive ones (delete scene/transition/character/state/trigger, New, Sample, Import). Toolbar buttons plus Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y. Shortcuts are ignored inside inputs/textareas/selects so native text undo is untouched. Rapid edits to the same field (typing, node drag, timeline marker drag) coalesce into one step; React Flow's burst of delete events is one step. Selection/timeline references are reconciled after undo/redo.
- **Strict import validation** (`src/lib/validate.ts`, `src/lib/io.ts`): duplicate IDs (scenes, transitions, characters, states, triggers), dangling transition/start/character-state references, unrecognised fields that would be dropped, newer schema versions, and foreign formats are all **blocking errors**. Nothing is repaired or dropped any more (v0.1 silently dropped dangling transitions). Non-blocking warnings (late triggers, duplicate scene pairs, uncapped loops, no start scene) are shown. Errors are shown in an accessible dialog *before* anything is replaced; a valid file shows a current-vs-import summary, an option to download a backup of the current project, and Replace/Cancel.
- **Data safety**: save-status badge (Saving… / Saved HH:MM / Not saved), error banner with a backup button when storage fails (quota/unavailable), pending data retried on the next flush, flush on `pagehide`, `beforeunload` and tab hide. Unreadable stored data (invalid JSON or schema mismatch) is preserved under `horror-director:unreadable:<timestamp>` and offered for download instead of being overwritten by the sample project. "Export" is now **Backup** (aria-labelled, Ctrl/Cmd+S) and still works when the project has integrity problems (warns).
- **Compatibility**: schema v1 and the persisted storage shape/key are unchanged; a test loads the exact v0.1 persisted shape. The export file gained no new fields (`derived` is now explicitly declared in the schema and ignored on import).

### Changed files
- New: `src/lib/validate.ts`, `src/lib/persist.ts`, `src/lib/download.ts`, `src/components/ImportDialog.tsx`, tests `src/store/history.test.ts`, `src/lib/import.test.ts`, `src/lib/persist.test.ts`.
- Modified: `src/store/useStore.ts` (history, `deleteScenes`, safe storage, recovery), `src/lib/io.ts` (strict `parseProject`, `exportFileName`), `src/lib/schema.ts` (`derived` declared), `src/App.tsx` (undo/redo, save badge, banners, import dialog, shortcuts), `src/styles.css`, `src/lib/lib.test.ts` (dangling-drop test replaced by rejection tests).

### Test results
- `npm run typecheck`: clean. `npm test`: 5 files, 56 tests passing (undo/redo incl. 50-step bound and coalescing, destructive-op undo, import rejection cases, round-trips/unicode, storage failure/retry, v0.1 hydration, unreadable-data preservation). `npm run build`: passes.
- Manual Chromium check: undo/redo via buttons and shortcuts, native input undo untouched, rejected import leaves project unchanged, backup download, corrupt-storage recovery banner, save badge, no console errors.

### Known limitations
- History is session-only (not persisted) and snapshots whole projects (fine at editor scale).
- Imports with unrecognised fields are rejected rather than preserved; there is no "repair" or "import anyway" mode.
- Edits to the same field within 800 ms (and drags) merge into one undo step by design.
- Two browser tabs on the same project can overwrite each other (last write wins); no cross-tab detection.
- Save status reflects the browser write succeeding, not durability against the user clearing site data — keep using Backup.
- Dialog focus is moved in but not fully trapped; New/Sample still use `window.confirm`.
- Remaining v0.1 limitations (auto-layout, single stored project, bundle size) are unchanged.

## V0.3 — Turkish / English localization

### Delivered
- **Lightweight, type-safe i18n** (`src/i18n/`, no new dependencies): `en.ts` is the source of truth; `tr.ts` is typed `Record<MessageKey, string>` so missing/extra keys fail `tsc`; `t(key, params)` checks `{placeholder}` names at compile time; numbers are formatted per locale (`1.200`, `5,8` in Turkish).
- **Language switcher** (compact TR | EN group in the top bar, `aria-pressed`). Switching re-renders immediately; it does not touch project state, history, autosave or undo stack (tested).
- **Detection & persistence**: first visit uses the browser language (`tr*` → Turkish, otherwise English); an explicit choice is stored under `horror-director:lang`, separate from project data and never part of exports. `<html lang>` follows the language (so CSS uppercase uses Turkish casing: `ANALİZ`; brand name pinned to `lang="en"`); times use the locale.
- **Everything app-controlled is localized**: navigation, buttons, tooltips, aria-labels, Scene Graph, Inspector, Timeline (incl. `sn` units), Characters (roles, states), Analysis stats, save status/banners/toasts, confirmations, import dialog, scene/transition/trigger/role display labels, and default names for newly created items (existing items are never renamed).
- **Structured diagnostics instead of English sentences**: `analyze`, `validateProject` and `parseProject` now return `Diagnostic { code, params }` (`src/lib/diagnostics.ts`); the UI renders them through the dictionary. Zod issues are mapped by issue code (`required`, `invalidType`, `tooSmall/Big`, exclusive/string/array variants, `invalidValue`, generic fallback) — raw Zod text is never shown. Paths and ids stay untranslated. Storage failure reasons and recovery notices are codes/flags too.
- **Unicode-safe backup file names**: `exportFileName` now keeps Turkish letters (`Kâbus_Üçgeni.horror.json`).
- Docs: `README.md` (language section, translation guide), new `README.tr.md`.
- Mobile fix found during smoke test: top-bar actions now wrap on narrow screens (page previously overflowed horizontally since v0.2).

### API / behavior changes
- `Issue.message` → `Issue.diagnostic`; `ValidationResult` and `ParseResult` carry `Diagnostic[]` (render with `formatDiagnostic`/`formatDiagnostics`). `SaveStatus.error.message` → `reason: 'full' | 'unavailable'`; `loadNotice.message` → `backedUp: boolean`. `theme.ts` exports colors only (`KIND_COLOR`, `TRIGGER_COLOR`); labels moved to the dictionary. `factory` functions take an optional `DefaultNames` (English default, so existing callers/tests are unchanged).
- Schema v1, JSON export format, persisted project shape and all v0.2 behavior (undo/redo, strict import, autosave, backup, recovery) are unchanged; v0.2 tests kept with the same assertions (they now format diagnostics in English before matching).

### Changed files
- New: `src/i18n/{en,tr,index,store}.ts`, `src/lib/diagnostics.ts`, `src/i18n/i18n.test.ts`, `src/i18n/render.test.tsx`, `README.tr.md`.
- Modified: `src/App.tsx`, `src/components/{GraphView,Inspector,TimelineView,CharactersView,AnalysisView,ImportDialog}.tsx`, `src/lib/{graph,validate,io,factory,theme,persist}.ts`, `src/store/useStore.ts`, `src/styles.css`, `vite.config.ts` (test glob includes `.tsx`), `src/lib/{lib,import,persist}.test.ts`, `README.md`.

### Test results
- `npm run typecheck`, `npm test` (7 files, 93 tests: dictionary parity/placeholders, detection, persistence, interpolation incl. Turkish Unicode, diagnostics in both languages, language switch vs project/history, JSON round-trip & language-independent export, server-rendered AnalysisView/ImportDialog in both languages) and `npm run build` all pass.
- Chromium smoke test (Playwright), both languages: first-visit detection (tr-TR → TR, en-US/de-DE → EN), all four views, new-item default names, import rejected/confirm dialogs, backup download + toast, storage-failure banner (simulated quota error), corrupt-storage recovery banner, live switch TR→EN mid-edit (edits kept, no reload), preference persisted across reload, mobile width without horizontal overflow, no console errors.

### Known limitations
- Only `tr` and `en`; no runtime language loading or plural engine (the two languages need none: messages use neutral forms like "trigger(s)").
- User content is intentionally untranslated, including the sample project's narrative and default names already stored in the project (they keep the language they were created in).
- Browser-supplied text (native `confirm()` button labels, file-picker, date-picker chrome) follows the browser/OS language, not the in-app setting.
- Unknown Zod issue kinds fall back to a generic localized "invalid value" message with the field path.
- Turkish strings are professionally phrased but have not been reviewed by a native game-industry editor; "Jumpscare" and "Glitch" are kept as genre terms.
- Desktop top bar wraps to two rows below ~1500px in both languages.
- v0.2 limitations (session-only history, multi-tab last-write-wins, etc.) are unchanged.

## V0.4A — Multi-project library

### Delivered
- **Library UI** (`Projects` button → `LibraryDialog`): create, open/switch, rename (inline, validated, ≤120 chars), duplicate, delete (inline confirmation with "download backup first"), add sample, **import JSON as a new project**, explicit confirmed **replace active project**, damaged-entry handling (download raw / remove), save-failure callout with backup + retry. Active project is remembered across reloads. Top bar keeps Undo/Redo, save badge, TR/EN, and **Backup** (active project).
- **Storage** (`src/lib/library.ts`): index `horror-director:library:v1` + one record `horror-director:proj:<id>` per project (random ids independent of names). Records hold the schema-v1 project unchanged; **no library metadata in project JSON or exports** (tested: export key sets, byte-identical exports before/after migration). New records are written, read back and verified before the index (commit point) references them; in-memory state is swapped only after storage succeeded.
- **Migration v0.1–v0.3 → library**: legacy `horror-director:project:v1` is schema-validated, copied under the deterministic id `legacy`, verified, then indexed (`migratedFrom`). Idempotent (valid index ⇒ never re-migrates; crash between record and index ⇒ same record rewritten, no duplicates), never modifies/deletes the legacy key, preserves unreadable legacy data (`horror-director:unreadable:*`), and on quota/verify failure writes no index, removes the partial record, keeps the project open from memory with a banner and retries next boot.
- **Recovery**: unreadable index is preserved then rebuilt from valid records; unreadable/missing records are listed as damaged and never overwritten (raw preserved even when removed from the library); damaged active project falls back to the first healthy one; if nothing is readable a fresh project is added beside damaged entries.
- **Editing-session protection**: switching/creating/importing flushes pending saves first and aborts (state unchanged) if that fails; autosave writes only the active record + index; deleting a non-active project works even while the active one cannot save (frees space); undo/redo history and coalescing are cleared on every switch (isolation tested); selection, trigger selection and timeline reset to the new project's start scene. v0.2 undoable replacement of the active project stays.
- **Multi-tab detection (not resolution)**: a `storage` event on the index or active record shows a banner and blocks library operations until reload.
- **Infrastructure**: `createSafeStorage` now tracks multiple pending keys (record before index), `flush()` returns whether everything was written, plus `hasPending`/`discard`; `Backend` gained `keys()`; zustand `persist` removed from the editor store (autosave subscription in `src/store/library.ts`).
- **i18n**: all new UI, banners, and library errors localized (TR/EN, parity tests cover them); library errors are codes mapped to `lib.err.*`.

### Changed files
- New: `src/lib/library.ts`, `src/store/library.ts`, `src/components/LibraryDialog.tsx`, `src/test/memoryBackend.ts`, `src/lib/library.test.ts`, `src/store/library.test.ts`.
- Modified: `src/lib/persist.ts`, `src/store/useStore.ts`, `src/App.tsx`, `src/components/ImportDialog.tsx`, `src/i18n/{en,tr}.ts`, `src/styles.css`, `src/lib/persist.test.ts`, `src/i18n/render.test.tsx`, `README.md`, `README.tr.md`.
- Deviation from plan: records use the prefix `horror-director:proj:` (not `…:project:`) so they can never collide with the legacy key `horror-director:project:v1`.

### Test results
- `npm run typecheck`, `npm test` (9 files, 149 tests: 20 library/migration/corruption, 35 store-level CRUD/switching/undo-isolation/import-export/failed-write/multi-tab, plus all v0.2/v0.3 suites unchanged in intent) and `npm run build` pass.
- Chromium smoke test (Playwright), en-US and tr-TR: seeded v0.3 legacy data migrated with the legacy key byte-identical after create/rename/duplicate/delete/import/reload; import-as-new accepted and rejected (strict validation); reload restored the active project; undo disabled after switching; simulated quota failure blocked switching with backup/retry and recovered; second-tab banner + disabled actions; library dialog at 390px width without horizontal overflow; no console errors.

### Known limitations / risks
- **Multiple tabs are not merged** (last write wins per key); only detection + blocking of library operations is implemented. A stale tab can still overwrite its own active record or index before it notices.
- Undo/redo history is not retained when switching projects (by design) or across reloads.
- The legacy key is kept as a stale copy (never cleaned up in 4A); downgrading to ≤v0.3 would show that old copy.
- No trash/undo for deleted projects (back up first); damaged projects are kept as raw backup under `horror-director:unreadable:*` when removed.
- localStorage quota is shared by all projects and backups; very large libraries can hit it (errors are surfaced, nothing is partially written).
- Migration validates the legacy data against the schema only (not full import-level integrity checks), so a schema-valid project with dangling references migrates as-is.
- Library list shows name and last-updated time only (no scene counts/thumbnails); no per-row export (only the active project's Backup).
- Per-project UI state (selected view, timeline scene) is not remembered per project.

## V0.4B — Graph usability & E2E tests

### Delivered
- **Auto Arrange** (`src/lib/layout.ts`, toolbar button `Auto Arrange` / `Otomatik Düzenle`, localized): deterministic left-to-right layered layout written in-house (no new runtime dependency). Pure function of graph structure + scene order (positions are never an input ⇒ idempotent). Handles branching/merging (longest-path layers, barycenter ordering), cycles (DFS back edges excluded from layering), self-loops and duplicate/dangling transitions (ignored for layout), disconnected components (stacked vertically, start component first) and multiple endings (aligned in the last column). Spacing leaves room for self-loop arcs above and back-edge arcs below.
- **One undoable operation**: `arrangeScenes()` in the store changes only `scene.position`, uses a single `set` without a coalesce key (exactly one history entry, exact undo/redo), and does nothing (no history entry) when positions are already arranged. It is never invoked on load, reload, boot or project switch. Manual drag editing is unchanged and never merges with the arrange step. After arranging, the viewport is fitted with room for edge arcs (viewport only; not stored).
- **Edge routing** (`src/lib/edgePath.ts`, pure and unit-tested): forward curves unchanged; backward edges on the same row arc *below* the nodes; backward edges between different rows use S-curves; reciprocal pairs get separate lanes (rank from ids) so paths and labels never coincide; self-loops arc above. Labels sit at the true curve midpoint, are ellipsized with a tooltip, clickable to select the edge, and raised when selected. Dream/reality colors, dashed crossings, transition styles, selection glow, Delete key and arrow markers are preserved. No schema change; duplicate ordered pairs still rejected.
- **Playwright E2E suite** (`e2e/`, `npm run test:e2e`, `@playwright/test` dev dependency): 8 tests — startup/render, add + connect via real handle drags (duplicate rejected), Auto Arrange (left-to-right, no overlaps, one-step undo/redo exact, idempotent, survives reload, manual drag survives reload and project round trip), reciprocal edges + self-loop (distinct non-overlapping labels, selectable, direction shown, keyboard delete), project switching without data loss + active project after reload, scene persistence, TR/EN switching without reload + persistence, Turkish first-visit detection. Stable selectors (`data-testid`, React Flow `data-id`), DOM-geometry assertions, no screenshot comparisons. `typecheck` also type-checks `e2e/` (`e2e/tsconfig.json`).
- Real UX issue found by the E2E run and fixed: fit-to-view ignored edge arcs, so self-loop labels fell outside the viewport after arranging.

### Changed files
- New: `src/lib/layout.ts`, `src/lib/edgePath.ts`, `src/lib/layout.test.ts`, `src/lib/edgePath.test.ts`, `src/store/arrange.test.ts`, `e2e/{editor.spec.ts,helpers.ts,tsconfig.json}`, `playwright.config.ts`.
- Modified: `src/components/GraphView.tsx`, `src/store/useStore.ts`, `src/App.tsx`, `src/components/LibraryDialog.tsx` (test ids), `src/i18n/{en,tr}.ts`, `src/styles.css`, `package.json`/lockfile, `.gitignore`, `README.md`, `README.tr.md`.

### Test results (all executed in this Cloud Session)
- `npm run typecheck` clean; `npm test`: 12 files, **177 tests** (+28: 15 layout, 6 edge-path, 7 arrange/undo-redo/persistence); `npm run build` passes.
- `npm run test:e2e` (Chromium via `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`): **8/8 passed**, and 24/24 with `--repeat-each=3` (no flakiness observed).
- Manual screenshot review of the sample project before/after Auto Arrange and of reciprocal + self-loop edges.

### Known limitations
- The layout ignores existing manual positions and any user grouping by design (it re-lays out everything); there is no "arrange selection" or incremental mode.
- Layering favors readability, not minimal crossings (barycenter heuristic, 4 sweeps); very dense graphs can still have crossing edges and long edges.
- Edge routing is heuristic (same-row arcs, S-curves, ±lane offsets); labels of unrelated edges can still overlap in dense layouts.
- Fit-to-view after arranging reserves fixed margins for arcs; the viewport is not restored on undo.
- E2E covers Chromium only and runs against the production build; there are no touch-gesture or mobile-viewport E2E tests, and no screenshot/visual-regression tests.
- `@playwright/test` requires a Chromium binary (`npx playwright install chromium` or `PW_CHROMIUM_PATH`).

## V0.5A — Story path simulator

### Delivered
- **Simulator tab** (`tab.simulator`, localized TR/EN): manual, read-only walk through the scene graph from `startSceneId` — current scene, selectable outgoing transitions (label, style, duration, dream/reality crossing, condition), **Back**, **Restart**, and a clear status (ending reached / dead end / incomplete / stopped by limit).
- **Pure engine** (`src/lib/simulate.ts`): `simulateRoute(project, choices, options)` replays the chosen transition ids deterministically, so the route is revalidated against the live graph (invalid suffix dropped, counted and reported). Free-text transition conditions are **never evaluated**; they are shown as assumptions on options and route steps.
- **Safe loops:** `loop.maxIterations` = additional repeat visits after the first (4 ⇒ up to 5 visits), applied to scenes with `loop.enabled`; `0` is bounded by a separate configurable safety limit (default 5, 1–20); other cycles by a hard step cap (default 40, clamped 1–200, = transitions taken). Every limit yields an explicit warning and disabled options with a reason; ending scenes are terminal.
- **Absolute timeline:** scene durations + transition durations; trigger time = scene start + local time per visit; `once` triggers only on the first visit (repeats counted as skipped); conditional triggers marked **hypothetical**; triggers past the scene duration flagged, **not shifted**, warned about, and excluded from statistics.
- **Route statistics:** total duration, visits, unique scenes, planned occurrences (+ hypothetical / beyond-duration / once-skipped counts), average and peak intensity, reality↔dream transitions, repeat visits, status.
- **Chart:** SVG over absolute time with scene bands, hatched transition gaps and trigger markers at their authored 0–10 intensity (hollow = hypothetical, red ring = beyond duration); deliberately **no connecting curve/area** and an on-screen disclaimer that intensity is a planning number, not a measured fear/tension score. Markers/events open a details panel and are keyboard-operable.
- **State isolation** (`src/store/simulator.ts`): separate non-persisted store (choices + limits). Never touches project data, autosave, library storage or undo/redo (tested incl. storage writes); resets on active-project change; the view prunes the route and shows a notice when graph edits invalidate it.
- Side fix: `.timeline-lower` grid items could overflow on narrow screens (long event names); now `minmax(0, 1fr)`.

### Changed files
- New: `src/lib/simulate.ts`, `src/lib/simulate.test.ts`, `src/store/simulator.ts`, `src/store/simulator.test.ts`, `src/components/SimulatorView.tsx`, `e2e/simulator.spec.ts`.
- Modified: `src/App.tsx`, `src/store/useStore.ts` (`View` type), `src/i18n/{en,tr}.ts`, `src/styles.css`, `README.md`, `README.tr.md`.

### Test results (all executed in this Cloud Session)
- `npm run typecheck` clean; `npm test`: 14 files, **211 tests** (+34: 28 engine incl. hand-verified sample routes 11:05 / 10:50, 6 store); `npm run build` passes.
- `npm run test:e2e`: **17/17** passed (8 existing + 9 new simulator tests: both endings, assumptions, loop limit + Back/Restart, step cap, markers/details, TR/EN, project isolation, graph-edit revalidation). Chromium via `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

### Known limitations
- Manual routes only: no automatic route enumeration, probabilities, or "best path"; no AI/psychological scoring.
- Assumes the player spends the **full** scene duration in every scene; real gameplay timing will differ.
- Loop settings apply only to scenes with looping enabled; cycles through other scenes are limited only by the step cap. Lowering the step cap shortens the current route.
- Conditions (transition and trigger) are display-only text; nothing is validated or executed (no Unreal logic).
- Simulation state and limits are session-only (not saved, not exported); per-project routes are not remembered across switches or reloads.
- The chart shows planned trigger markers, not continuous "intensity"; very long routes make scene labels illegible (labels are hidden when bands are narrow).
- E2E covers Chromium desktop; the mobile layout was checked manually (no automated mobile E2E).
