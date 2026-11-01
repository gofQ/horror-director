# Cloud session audit

Repository audit of Horror Director (React 19 + TypeScript 7 + Vite 8 + @xyflow/react 12 + zustand 5, browser-only,
no backend), with the highest-impact issues fixed in the same branch. Base: `claude/optimistic-tesla-r2v8g6` at
`2c9a5ce` (after the Turkish showcase sample, PR #22).

## 1. Method

1. Read `CLAUDE.md`, `progress.md`, `CHANGELOG.md` and both READMEs. Read the module map and invariants.
2. Ran three read-only audits in parallel:
   - **Graph editing:** connections, paste and delete, context menus, validation.
   - **Localization, persistence and sample workflows.**
   - **Performance, tooling and the engine-adapter seam.**
3. Re-checked every finding below in the code before changing anything.
4. Each fix comes with a test. For the keyboard and focus fixes, the new e2e tests were run against the unfixed code and failed. They pass with the fixes.

Scoring:
- **Severity:** S1 means data loss or a project that no longer validates, S2 a broken feature, S3 a UX problem.
- **Impact:** how often a normal user hits it.
- **Complexity:** the size of the fix.

## 2. Findings and status

| # | Finding | Sev. | Impact | Fix size | Status |
|---|---------|------|--------|----------|--------|
| 1 | At boot, a failed record write still queued the library index on its own. With a nearly full quota, the small index write succeeded and the next boot listed a project with no data. Legacy v0.1–v0.3 data became unreachable. | S1 | low (needs a full quota) | small | **Fixed** |
| 2 | A *missing* (not unreadable) index re-ran the legacy migration, overwriting the newer `legacy` record with stale data. | S1 | low | small | **Fixed** |
| 3 | Connecting a Sequence "Then" pin to an Event/Delay/Set Flag that already led somewhere pulled that chain into the stage. The project then failed validation and was flagged "inconsistent" on the next load. | S1 | medium | small | **Fixed** |
| 4 | "Insert IF" on a link inside a Sequence stage put an IF inside the stage, which is also invalid. | S1 | medium | small | **Fixed** |
| 5 | Paste kept `characterStates` for characters or states deleted since the copy, and kept a scene type whose base kind had changed. Both are invalid. | S1 | low | small | **Fixed** |
| 6 | Delete/Backspace deleted the graph selection while focus was in a context menu, a dialog (Shot planner, Transition designer) or a side panel. React Flow's delete key listens on the whole document. | S2 | high | small | **Fixed** |
| 7 | The Paste/Cut fallback in the text context menu set `el.value` directly. React ignored the change and reverted the text on the next render. | S2 | low (fallback path only) | small | **Fixed** |
| 8 | Context-menu keyboard focus was out of sync when the first item was disabled, which is always true for the global menu. The first ArrowDown did nothing and the disabled row stayed in the tab order. | S3 | high | small | **Fixed** |
| 9 | Shift+F10 or the Menu key pressed inside an open graph menu reached the canvas handler and reopened the menu with a stale submenu. | S3 | low | small | **Fixed** |
| 10 | A second toast within 5 s was closed early by the first toast's timer. | S3 | medium | trivial | **Fixed** |
| 11 | "Copy of {name}" for a long name failed name validation, so the duplicate silently kept the original name. | S3 | low | small | **Fixed** |
| 12 | `makeT` crashed if a key was missing (a risk for runtime-built keys). Task history dates ignored the UI language. Progress errors always reported the "unavailable" save reason. | S2/S3 | low | small | **Fixed** |
| 13 | The whole app shipped as one 1.2 MB JavaScript chunk. Every view and dialog was loaded up front and there was no vendor split. | S3 | all users | small | **Fixed** (see §4) |
| 14 | The app shell re-rendered on every project edit, because it subscribed to the whole project just to show its name. The task explorer computed readiness twice. | S3 | medium | trivial | **Fixed** |
| 15 | Engine names were hard-coded in the report schema, the progress key parser and the restore engine detection. | S3 | future work | small | **Fixed** (one `ENGINES` list) |
| 16 | No linter. The `eslint-disable` comments in the code did nothing. | — | — | small | **Added** `oxlint` (§5) |
| 17 | No CI. | — | — | small | **Added** `.github/workflows/ci.yml` (could not run here) |

Checked and found correct, so not changed:
- **Undo history:** `past` is capped at 50.
- **Deletion cleanup:** deleting a character, state, flag, scene type, start scene, Sequence owner or shot link cleans up every reference.
- **Import validation:** every dangling id reference is rejected.
- **Dynamic i18n keys:** every key family is complete in both languages.
- **Autosave:** the record is written before the index, and pending writes flush on page exit.
- **Build artefacts:** none are committed.

## 3. Fixes and acceptance criteria

1. **Boot never commits an index without its record.**
   - **Where:** `src/store/library.ts`, `queueBootIndex`.
   - **Change:** when boot queues the index and the active record is not stored, the record is queued first. The safe storage writes in order and stops at the first failure, so the index can no longer be stored while the record is missing.
   - **Accepted when** (`src/store/library.test.ts`):
     - With record writes failing on quota, no index is stored and the legacy key is untouched.
     - A reload retries the migration.
     - Once space is freed, the record and then the index are written, and the next boot opens the migrated project with nothing marked damaged.
     - The same holds for a failed first-run write.
2. **Missing index is rebuilt from records.**
   - **Where:** `src/lib/library.ts`, `loadLibrary`.
   - **Change:** the index is rebuilt from the records before the legacy key is considered. A crash between the migration's record write and its index write is still detected and resumed (`isUnfinishedMigration`).
   - **Accepted when:** after migrate → edit → remove the index → load, the edit is kept and the result is "index rebuilt", not "migrated".
3. **Stage chains.**
   - **Where:** `src/lib/graphRules.ts`, `stageChainRule`.
   - **Change:** pulling a wired node into a stage now walks its outgoing chain. The connection is refused unless every node is a single-input Event, Delay or Set Flag and the chain ends open or at the matching Return.
   - **Accepted when** (`graphRules.sequence.test.ts`): chains leading to a scene, IF or Random, chains with a shortcut, and chains ending at the wrong or an unowned Return are all refused. Valid chains are accepted and the joined project has no Sequence errors.
4. **Insert IF.**
   - **Where:** `insertBranchBlock` in `graphRules.ts`, shared by the store action and the menu item.
   - **Change:** Insert IF is blocked on a Then pin, inside a stage, or into a Return. The menu item is disabled and shows "Not inside a Sequence stage" / "Sıra aşamasının içinde olmaz".
   - **Accepted when:** on the showcase, links e17–e22 are refused and the project is unchanged. Inserting on the Completed pin is allowed and the project stays valid (store test). In e2e the menu item is disabled.
5. **Paste references.**
   - **Where:** `src/lib/graphClipboard.ts`.
   - **Change:** paste now receives the characters. It drops character states whose character or state is missing, and drops a scene type whose base kind no longer matches.
   - **Accepted when:** the pasted scene alone passes the character and scene-type checks, and the same check fails on the unrepaired copy.
6. **Delete key.**
   - **Where:** `GraphView.tsx`.
   - **Change:** `deleteKeyCode={null}`. Delete and Backspace are now handled by the existing guarded shortcut handler, which already ignores menus, dialogs and other panels, through `rf.deleteElements`. This is the same path React Flow uses, so the store and undo behaviour are unchanged.
   - **Accepted when** (`e2e/audit-fixes.spec.ts`): Backspace or Delete in a node's context menu and inside the Shot planner deletes nothing. Delete on the canvas still deletes, and Undo restores the node. Delete also still works right after a top-bar button (Undo/Redo, tabs) took focus, as it did before the audit (found by the first CI run and fixed in the follow-up PR, see §9).
7. **Clipboard fallback.**
   - **Change:** `setNativeValue` writes through the prototype `value` setter, and `insertIntoField` / `deleteFromField` use it.
   - **Accepted when:** a unit test with a React-like tracker shows the write goes through the prototype setter and an `input` event follows.
8. **Context-menu focus.**
   - **Change:** the roving index starts on the first enabled row. A newly opened menu starts at its root level.
   - **Accepted when** (e2e, global menu): focus starts on the first enabled item, ArrowDown moves to the second and ArrowUp moves back, and the disabled row has `tabindex=-1`.
9. **Menu key inside a menu:** keys typed inside `.ctx-menu` no longer reach the canvas handler.
10. **Toast:** the timer is cleared before it is re-armed.
11. **`fitName`:** derived names are shortened with "…" so they fit 120 characters. Covered by a unit test.
12. **`makeT`:** a missing key falls back to English, then to the key itself (unit test). History dates use the UI locale, and the real save-failure reason is shown.
13. **Code splitting:** see §4.
14. **Re-render work:** the app shell subscribes only to `project.name`, and the task explorer reuses one `assessPlan` result.
15. **`ENGINES`:** `ENGINES` is now the single `as const` tuple. `Engine` is derived from it, and `isEngine`, the report schema, `splitKey` and restore engine detection all use it. Behaviour is unchanged.

## 4. Bundle (from `npm run build`)

The initial load is the set of scripts referenced by `dist/index.html`.

| | Before | After |
|---|---|---|
| JS chunks | 1 (`index`, 1,198.03 kB raw, 346.30 kB gzip) | 16 |
| Initial load (raw) | 1,198 kB | 1,045 kB (−13 %) |
| Initial load (gzip, `gzip -c`) | ≈346 kB | ≈308 kB (−11 %) |
| Largest chunk | 1,198 kB (over the 500 kB warning) | 266 kB (no warning) |
| Loaded on first use | — | Production 86 kB, Simulator 47 kB, Timeline 20 kB, Library 9 kB, Characters 4 kB, Import 3 kB, Analysis 2 kB |

The vendor code (`vendor-react`, `vendor-flow`, `vendor-zod`) is now in separate chunks that stay cached across app releases.

The remaining large shared chunk (`diagnostics-*`, 266 kB) is mostly the two i18n dictionaries together with the plan and brief text. A next step would be to load the inactive language on demand (§7).

## 5. Tooling

- **Linter: `oxlint` 1.90 (`npm run lint`, config in `.oxlintrc.json`).**
  - `typescript-eslint` cannot be used here. The project uses TypeScript 7, whose npm package no longer exposes the classic compiler API: `require('typescript').createSourceFile` is `undefined`, and the peer range of `typescript-eslint` 8.72 stops below 6.1. `oxlint` parses TypeScript and JSX itself.
  - **Enabled:**
    - every `correctness` rule;
    - `react-hooks/rules-of-hooks` (error) and `react-hooks/exhaustive-deps` (warn);
    - `no-unused-vars` (rest siblings and `_` names allowed);
    - `no-unused-expressions`.
    - Both hooks rules fire on a probe file.
  - **Result:** 0 errors and 0 warnings after fixing four real findings. Three were comma-expression statements; the fourth was a test that used a control-character regex.
  - **Disabled for now:** the React Compiler purity rules (`set-state-in-effect`, `purity`, `refs`, `immutability`, `globals`, `hooks`). Together they report about 15 sites, mostly intentional patterns such as resetting local form state on selection change or module-level session state. Reviewing them is listed in §7.
- **CI: `.github/workflows/ci.yml`.** On pull requests and pushes to the integration branch it runs `npm ci`, typecheck, lint, unit tests, build, Playwright Chromium install and e2e. It uploads `test-results` when a step fails. It could not be run in this session.

## 6. Engine adapters (Unreal / Unity): seam analysis

**How it works today:**
- `src/lib/production/engines.ts` holds `ADAPTERS: Record<Engine, EngineAdapter>`. Each adapter has an id, an i18n key prefix (`u` or `y`), a file base, `proposals(task)` (name templates per task kind) and `vocab` (11 engine nouns used in brief templates).
- Plans and briefs are pure and language-neutral. Engine wording lives in the `plan.<prefix>.<kind>.{what,how,done}` i18n families.
- After this audit, `ENGINES` is the one list that validators and parsers derive from.

**Places that still name an engine (needed only to add a third one):**
1. `readiness.ts` `tbdFor`: Unreal-only `levelPath` and Unity-only `scenePath`. This could become an adapter field such as `pathCriterion`.
2. `engines.ts` `proposedScenePath` (a ternary) and `render.ts` `scenePathText` / the level column key. Both could become an adapter `scenePath(id)` method plus a column key.
3. i18n: `plan.engine.<id>`, about 57 `plan.<prefix>.*` keys per language, and the `plan.path.*` and `plan.col.level*` keys.
4. Data model: `Scene.unrealLevel` and `Transition.direction.unrealNotes` are Unreal-specific. Other engines get proposals only, as Unity does today. No schema change is recommended until a real engine integration exists.

**Recommended next step (not implemented, to avoid complexity without a consumer):**
- Turn each adapter into plain data: `{ id, prefix, fileBase, vocab, scenePathTemplate, pathCriterion, proposals: Partial<Record<TaskKind, string[]>> }` with `{n}` placeholders, plus one generic `proposals(task)`.
- Then a JSON manifest per engine (`downloadText(JSON.stringify(adapter))`) can be handed to an engine-side importer or plugin.
- A future Unreal or Unity importer should read the existing exports: the task CSV, the per-task briefs, and the completion-report JSON v1, which already carries project, engine, task id and source fingerprint. It should not import the editor's internal types.

## 7. Remaining risks and recommended next tasks

**Not fixed in this session (by priority):**
1. **Two tabs editing the same project:** last write wins for project records. It is detected and documented, but edits are still overwritten silently. Next step: a revision field and compare-and-set, as production progress already does.
2. **Validation rules added later:** stored projects that were valid before can become "inconsistent" when a new rule is added. Next step: run validation during migration and show a repair or explain view instead of only "open anyway".
3. **React Compiler lint rules:** review the ~15 sites (§5) and either refactor (derive state, use `key` to reset) or document each exception, then enable the rules.
4. **Inactive language on demand:** load the second dictionary only when needed (about 100+ kB less on first load) and lazy-load the Shot, Audio and Transition planner dialogs (`Inspector.tsx`, `GraphView.tsx`).
5. **Broad `project` subscriptions:** `Inspector`, `TimelineView` and `GraphView` (the signature strings are rebuilt on every render; the long-press handlers depend on `[project, t]`).
6. **Turkish production output:** engine vocabulary such as "Blueprint" and "Data Table" (arguably product names), the `TBD` prefix and severities stay English. Percentages are not locale-formatted (`33.33%` instead of `%33,33`).
7. **Sample guide:** the "hide" flag is global and permanent, with no way to show the guide again. The first-run sample is the legacy English "Hollow Apartment", whatever the browser language.
8. **Stricter TypeScript:** `noUncheckedIndexedAccess`, for example `engines.ts` `w[0].toUpperCase()`.
9. **Cross-browser:** Firefox and WebKit are not in the Playwright matrix; all e2e runs are Chromium.

## 8. Verification (this session, Cloud container)

- `npm run typecheck`: clean.
- `npm run lint` (new): 0 errors, 0 warnings.
- `npm test`: 58 files, 865 tests passing.
- `npm run build`: passes with no chunk-size warning. Sizes are in §4.
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`: 222 tests, all passing. That is 217 earlier tests plus 5 new ones in `e2e/audit-fixes.spec.ts`.
- **Regression check:** with the delete-key and menu-focus fixes temporarily reverted, the three matching new e2e tests failed. They pass with the fixes.
- **Could not be verified here:**
  - the GitHub Actions workflow itself;
  - Firefox and WebKit;
  - real-browser quota behaviour (it is simulated with the in-memory backend's `failWhen`).

## 9. First CI run and follow-up fixes (follow-up PR [#24](https://github.com/gofQ/horror-director/pull/24))

The workflow's first run on GitHub Actions (Ubuntu, Playwright's own Chromium) passed typecheck, lint, unit tests and build, and failed 7 of 222 e2e tests. Causes and fixes:

| Failing tests | Cause | Fix |
|---|---|---|
| `navbar.spec` 1280px single row (height 93px); 3 drag-to-create tests in `blueprint.spec`; drag-to-create Set Flag in `narrative-state.spec` | The runner has no Inter font. The fallback (DejaVu Sans) is wider, so the navbar wrapped to two rows, the canvas got shorter and the drag targets fell outside it. The same layout affected real users without Inter. | Inter is bundled (`@fontsource-variable/inter`, imported in `src/main.tsx`; `'Inter Variable'` first in the body font stack). |
| `productivity.spec` batch Delete after Redo | Audit regression: the new guarded Delete handler only accepted focus on `<body>` or the canvas, so Delete after clicking Redo in the top bar did nothing. | The shortcut guard also accepts focus inside `.topbar`; menus, dialogs, inputs and side panels are still excluded. New e2e case in `audit-fixes.spec`. |
| `productivity.spec` copy/paste edge count (1 instead of 2) | Racy assertion: the edge count was read once, before React Flow rendered the edges of the freshly measured pasted nodes. | Polling `toHaveCount(2)` assertion; behaviour unchanged. |

**Reproduction in the Cloud container:** with a fontconfig file that rejects Inter (`FONTCONFIG_FILE=…`, falls back to DejaVu Sans like the runner), the 5 font-related tests failed on the previous head and pass after the fix. The Delete and edge-count failures depend on the runner's newer Chromium and did not reproduce locally; they were fixed from the CI logs.

**Verified after the fix (Cloud container):**
- typecheck clean;
- lint 0 errors / 0 warnings;
- unit tests: 58 files, 865 tests passing;
- build passes; the font adds 7 woff2 files (Latin 48 kB, Latin Extended 85 kB, others loaded only for their scripts);
- e2e: 223 / 223 passing, both with Inter installed and with Inter rejected.

PR #23 was merged before this fix landed; the fix landed in the follow-up PR #24, whose CI run is green.
