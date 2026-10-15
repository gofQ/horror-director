# Changelog

Version history of Horror Director, newest first. This file is the canonical user-facing history; the READMEs describe
the current product only and `progress.md` tracks engineering status.

The labels below (v0.1 … v0.5C) are **development milestones**, not published releases: the project has no tagged
releases and `package.json` stays at `0.1.0`. Each milestone was developed on its own branch and merged through a pull
request into the integration branch (`claude/optimistic-tesla-r2v8g6`). The JSON schema stays at `schemaVersion: 1`
throughout.

Every future feature or fix milestone must add an entry here (see `CLAUDE.md`).

## v0.5C — Route comparison and documentation cleanup

Pull request: _link added when the pull request is opened_ (see the repository's pull requests).

### Added
- **Route comparison** inside the Simulator: pin the current route as **Route A**, build **Route B** with Back/Restart and compare them side by side. Pinned Route A can be replaced or cleared.
- Comparison metrics with explicit `B − A` deltas where meaningful: route duration and status, scene visits, unique scenes, loop repetitions, planned trigger occurrences, hypothetical events, assumed (conditional) transitions, events per minute, average/peak authored intensity, trigger-kind distribution, pacing findings by category and severity.
- First divergence point, shared / route-exclusive scenes, transitions and events. Events use a stable identity (scene id, trigger id, visit occurrence), so repeated visits are handled correctly and each route keeps its own timing.
- Aligned A/B event timelines with authored-intensity markers (shared events as circles, exclusive events as diamonds, hypothetical events hollow), keyboard-operable, TR/EN, usable on narrow screens. No ranking, score or tension curve.
- `CHANGELOG.md` and `CLAUDE.md` (permanent repository rules).

### Changed
- `README.md` and `README.tr.md` rewritten as evergreen product documentation (no version headings or test counts).
- `progress.md` reduced to current status and engineering handoff.
- Both routes are re-simulated against the current project with the same simulator limits and pacing thresholds; if graph edits or limits invalidate Route A, the comparison shows an explicit warning and is marked incomplete.
- Comparison state is session-only, resets on project switch, and never touches project data, autosave, undo history or exports.

## v0.5B — Horror pacing analyzer

Pull request: [#6](https://github.com/gofQ/horror-director/pull/6)

### Added
- Deterministic, read-only **pacing analysis** of the simulated route (`src/lib/pacing.ts`), reusing the simulator's planned events: trigger clusters, repeated high-intensity events, repeated trigger type, trigger-free intervals (neutral) and escalation sequences, with documented inclusive thresholds and deduplicated overlapping windows.
- Overview (planned events, events per minute, per-kind distribution, high-intensity and hypothetical counts, longest trigger-free interval) and findings with exact time ranges, supporting values and flags for hypothetical triggers and assumed transitions.
- Localized (TR/EN) pacing panel in the Simulator; selecting a finding highlights its events and time range on the chart; adjustable repeated-type window and trigger-free minimum.

### Changed
- Simulator store gained session-only pacing options and finding selection. No tension curve and no quality score by design.

## v0.5A — Story path simulator

Pull request: [#5](https://github.com/gofQ/horror-director/pull/5)

### Added
- **Simulator** tab: manual, read-only walk through the scene graph with Back/Restart and a clear route status (ending, dead end, incomplete, stopped by a limit).
- Pure engine `simulateRoute` that replays chosen transitions against the live project; conditions are never evaluated and are shown as assumptions.
- Safe loop handling (`maxIterations` counts repeat visits; separate safety limit for unlimited loops; hard step cap) with explicit warnings.
- Absolute-time trigger timeline across scenes (once-only triggers, hypothetical conditional triggers, beyond-duration triggers flagged and excluded from statistics), route statistics and an intensity marker chart without any fear score.

### Fixed
- Event/trigger lists in the timeline area could overflow on narrow screens.

## v0.4B — Graph usability and E2E tests

Pull request: [#4](https://github.com/gofQ/horror-director/pull/4)

### Added
- **Auto Arrange**: deterministic left-to-right layered layout, never automatic, positions only, one undo/redo step.
- Edge routing for reciprocal edges, backward edges and self-loops with non-colliding, clickable labels.
- **Playwright E2E suite** (`npm run test:e2e`).

### Fixed
- Fit-to-view ignored edge arcs, which could leave self-loop labels outside the viewport after arranging.

## v0.4A — Multi-project library

Pull request: [#3](https://github.com/gofQ/horror-director/pull/3)

### Added
- **Project library**: create, open, rename, duplicate, delete (with confirmation), import as new, replace the active project, damaged-entry handling; the active project is remembered.
- Storage as an index plus one record per project; no library metadata in project JSON or exports.
- Safe, idempotent migration of the single-project storage from earlier versions (the original data is never modified or deleted).
- Recovery for unreadable index/records, protected project switching (pending saves flushed first), multi-tab change detection (detection only, no merging).

### Changed
- Undo/redo history is scoped to the active project and cleared on every switch; the editor store no longer uses zustand `persist`.

## v0.3 — Turkish / English localization

Pull request: [#2](https://github.com/gofQ/horror-director/pull/2)

### Added
- Complete TR/EN interface through a lightweight, type-safe in-house i18n system, language switcher, browser-language detection and a separately persisted choice (never part of exports).
- Structured diagnostics (code + params) for analysis, validation and import problems, rendered through the dictionary, including mapped Zod issues.
- Unicode-safe backup file names.

### Fixed
- Top-bar actions overflowed the page on narrow screens.

## v0.2 — Editor reliability pass

Pull request: [#1](https://github.com/gofQ/horror-director/pull/1)

### Added
- Undo/redo (50 steps, toolbar and keyboard shortcuts that leave native text undo alone).
- Strict import validation (duplicate ids, dangling references, unrecognised fields, newer schema versions) with errors shown before anything is replaced, and a backup option.
- Save-status badge, storage-failure banner with backup, flush on page hide/unload, preservation of unreadable stored data.

### Changed
- Dangling transitions are no longer silently dropped on import; they are reported as errors. "Export" became "Backup".

## MVP / v0.1

Commit `4781358` (initial commit, no pull request).

### Added
- Node-based scene graph (scene kinds, typed transitions with conditions and durations, self-loops, start scene), dream/reality crossing detection, loop settings and cycle detection.
- Per-scene horror trigger timeline with intensity, trigger types, conditions and fire-once flag.
- Characters with behaviour states and a scene × character matrix.
- Analysis tab (structural checks and statistics), schema-v1 JSON export/import with zod validation, local auto-save, sample project and responsive dark UI.
