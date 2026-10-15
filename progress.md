# Progress

Current development status and engineering handoff. User-facing version history lives in [CHANGELOG.md](CHANGELOG.md);
product documentation in [README.md](README.md) / [README.tr.md](README.tr.md); permanent rules in [CLAUDE.md](CLAUDE.md).

## Status
- Latest milestone: **v0.6D — cinematic sequence overview** (derived read-only view; export schema stays version 4, records `v: 4`; v1–v3/bare files and stored `v: 1`–`v: 3` records are still read; `package.json` version unchanged).
- Implemented and in use: scene graph with Auto Arrange and edge routing, timeline, characters, analysis, multi-project library with
  safe migration, undo/redo, strict import, TR/EN i18n, story path simulator, pacing analysis, A/B route comparison, per-scene cinematic shot planner, per-transition psychological direction designer, per-scene audio planner, derived cinematic sequence overview (Timeline → Sequence).
- Latest verified run (v0.6D, Cloud Session): `npm run typecheck` clean; `npm test` 25 files / 399 tests passing; `npm run build` passes;
  `npm run test:e2e` (Chromium, `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`) 72 tests, all passing, also with `--repeat-each=2` (144/144).

## Module map
- `src/lib/schema.ts`, `io.ts`, `validate.ts` — schema (version 4: `scene.shots` since 2, optional `transition.direction` since 3, `scene.audioCues` since 4; older files and bare projects import with empty shots/audioCues and no directions; shot-link integrity and duplicate-cue-id errors in `validateProject`), export/import, strict validation (structured diagnostics in `diagnostics.ts`).
- `src/lib/shots.ts` — pure shot helpers (`analyzeShots` overlap/overrun/order warnings, `sortedByTime`, `nextStart`); `src/components/ShotPlannerDialog.tsx` — planner UI opened from the scene Inspector (incl. the delete-with-links confirmation); `src/components/TransitionDesignerDialog.tsx` — transition direction UI opened from the transition Inspector; shot and direction actions live in `src/store/useStore.ts` (`shotReferences` in `shots.ts`).
- `src/lib/sequence.ts` — pure `buildSequence(scene)` (stable `kind:id` keys, deterministic order, extended range, warnings); `src/components/SequenceView.tsx` — read-only tracks/cursor/details/list rendered by `TimelineView` in Sequence mode (session-only `mode`); it opens `ShotPlannerDialog`/`AudioPlannerDialog` (`focusId`) or the trigger editor and never calls a mutating store action.
- `src/lib/audio.ts` — pure audio cue helpers (`analyzeAudioCues` overrun/fade warnings, `assignLanes` display layers, `nextCueStart`); `src/components/AudioPlannerDialog.tsx` — planner UI opened from the scene Inspector; cue actions in `src/store/useStore.ts` (`addAudioCue`, `updateAudioCue` refuses invalid values, `duplicate/move/deleteAudioCue`).
- `src/lib/library.ts`, `persist.ts`, `src/store/library.ts` — multi-project storage, migration, safe storage with verified writes.
- `src/store/useStore.ts` — project editing store, undo/redo history, `arrangeScenes`.
- `src/lib/layout.ts`, `edgePath.ts` — Auto Arrange and edge routing (pure).
- `src/lib/simulate.ts` — `simulateRoute` (pure replay of chosen transition ids; limits: step cap, loop safety limit).
- `src/lib/pacing.ts` — `analyzePacing` over a `SimResult` (inclusive thresholds, deduplicated windows).
- `src/lib/compare.ts` — `compareRoutes(project, choicesA, choicesB, simOptions, pacingOptions)`: calls `simulateRoute` and `analyzePacing` for both
  routes with identical limits/thresholds; event identity = scene id + trigger id + visit occurrence; deltas are `B − A`, `null` when undefined.
- `src/store/simulator.ts` — session-only simulator state (route choices, limits, pacing thresholds, finding selection, pinned Route A).
- `src/components/SimulatorView.tsx`, `PacingPanel.tsx`, `ComparePanel.tsx` — simulator UI; `src/i18n/{en,tr}.ts` — typed dictionaries.
- Tests: `src/**/*.test.ts(x)` (vitest), `e2e/*.spec.ts` (Playwright against the production build).

## Invariants to keep
- Simulator, pacing and comparison never write to project data, autosave, library storage, undo history or exports (covered by store tests).
- Pinned Route A is a copy of choices bound to a project id; it is never pruned silently — invalidation (graph edits, lowered step cap) is shown as an
  explicit warning and marks the comparison incomplete. All simulator state resets on active-project change.
- Shots are planning notes only: independent of triggers/transitions, authored timing is never changed implicitly (warnings only); reordering changes sequence, not timing.
- Stored records are `{ v: 4, project }`; `v: 1`–`v: 3` records stay readable; old records/legacy key are normalized in memory only and never rewritten at boot. Do not write older record versions again.
- Transition direction is planning data only (never evaluated); shot links must belong to the transition's source/target scene (validated on import; store refuses invalid links; `deleteShot` refuses while linked unless `clearReferences`, which removes shot and links in one undo step). `updateTransition` cannot change endpoints.
- Audio cues are planning notes only: never played or evaluated, independent of triggers/ambience/shot sound notes/transition audio continuity, excluded from pacing and simulation. Overlaps are normal layers (display lanes are derived, never stored); silence mutes nothing; authored order and timing are never changed implicitly (warnings only).
- The Sequence overview is a derived view: no persisted fields, no store writes, no history entries, no storage writes (covered by an E2E storage-snapshot test); selection is derived from the current scene each render, so deleted items/scene or project switches cannot leave a stale selection; authored timing is never clamped (axis extends instead).
- Library metadata never enters project JSON; the legacy storage key is never modified or deleted.
- Intensity is authored design intent: no fear score, no tension curve, no "best route" ranking anywhere.

## Known limitations and remaining risks
- Simulation is manual and assumes the full duration of every scene; conditions are never evaluated; per-project routes are not remembered.
- Pacing thresholds are untuned heuristics (only repeated-type window and trigger-free minimum adjustable); hypothetical events are included in counts (flagged).
- Comparison supports exactly one pinned route against the live route (no multi-route matrix); time shifts of shared events are shown, not explained.
- The aligned comparison timeline hides nothing but gets dense for very long routes (no zoom); scene bands are not drawn in it.
- Shots: simple list only (no storyboard images, camera timeline editor or Unreal import). The list shows authored (array) order; "out of time order" is a warning and "Sort by time" an explicit action. Duplicate/new shots start where the previous one ends.
- Sequence view: authored planning timing only (no simulation of runtime conditions); "conditional" means a non-empty free-text condition; dense scenes rely on zoom + horizontal scroll (no zoom-to-selection, no drag editing); track labels are truncated; selection/zoom/cursor/mode are session-only.
- Audio planner: no playback/waveform/spatial rendering, no asset browser or generation; the timeline axis stretches to include cues that overrun the scene; the planner is a list plus timeline (no drag-to-resize). Cue lanes are derived for display only.
- Records are schema-validated, not integrity-validated, on load: a stored link to a missing shot is flagged in the designer and can be cleared, but loads (imports reject it).
- Downgrade: a build older than v0.6C shows `v: 4` records as damaged (data preserved, never overwritten); exported schema-2 files cannot be imported by older builds ("newer schema").
- A schema-level error (e.g. invalid shot value) stops validation before integrity checks, so duplicate-id errors only appear once schema errors are fixed.
- Multiple browser tabs are not merged (detection and blocking only); localStorage quota is shared by all projects and backups.
- Undo history is session-only and cleared on project switch; deleted projects have no trash.
- E2E covers Chromium only (mobile is checked via a 390 px viewport test and manually); no visual-regression tests.
- Production bundle is ~540 kB (no code-splitting). Turkish copy has not had a native game-industry review.

## Ideas for next steps
Multi-route comparison or route enumeration, saved routes per project (opt-in, would need a storage decision), zoom for long timelines,
Unreal DataTable/CSV export or importer plugin, audio cue library / asset browser, audio playback preview, ElevenLabs-style generation (would need a network/API decision), scene thumbnails.
