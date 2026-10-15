# Changelog

Version history of Horror Director, newest first. This file is the canonical user-facing history; the READMEs describe
the current product only and `progress.md` tracks engineering status.

The labels below (MVP/v0.1 through v0.6B) are **development milestones**, not published releases: the project has no
tagged releases and `package.json` stays at `0.1.0`. Each milestone after the MVP was developed on its own branch and
merged through a pull request into the integration branch (`claude/optimistic-tesla-r2v8g6`). The JSON schema was
`schemaVersion: 1` until v0.6A introduced `schemaVersion: 2` (scene shots) and v0.6B introduced `schemaVersion: 3`
(transition direction); files of every earlier version, and bare project files, are still imported.

Every future feature or fix milestone must add an entry here (see `CLAUDE.md`).

## v0.6B — Psychological transition designer

Pull request: [#9](https://github.com/gofQ/horror-director/pull/9)

### Added
- **Transition direction**: an optional, structured design per transition — psychological technique (the shot techniques plus *reality reveal*), what the player believes is happening, what is actually happening, the reveal/contradiction, visual (match-cut) continuity, audio continuity, Unreal implementation notes and optional links to a shot of the source scene and a shot of the destination scene. It is director-authored planning data: never evaluated or executed, and independent of the transition's style, condition and duration.
- **Design transition** dialog (TR/EN) from the selected transition's Inspector: edit every field, choose source/destination shots, see a compact *before → transition → after* preview built from existing shot metadata with the illusion, reality and reveal called out, start/clear a design, Undo/Redo inside the dialog. Works for self-loops (both links choose from the same scene), keyboard-operable and responsive.
- **Reference integrity**: shot links must belong to the transition's source/destination scene. Deleting a linked shot is blocked until you explicitly confirm; the confirmation lists the affected transitions, and the deletion plus the cleared links are one undo step. A stored link that no longer resolves is flagged and can be cleared.
- Sample project demonstrates directions on two transitions.

### Changed
- **JSON schema 3**: exports are written as `schemaVersion: 3`; transitions without a direction export without a `direction` key. Schema 1, schema 2 and bare project files are still imported (missing `shots` become empty, directions stay absent; schema-1/bare files get an informational notice). Dangling or mismatched shot links, invalid values and unknown fields (also inside a direction) are blocking import errors.
- Library project records are now written as `{ v: 3, project }`. Records with `v: 1` or `v: 2` are still read, normalized in memory only and not rewritten until the project is edited; the legacy single-project key is never modified. An older build reading a `v: 3` record treats it as damaged and preserves it.
- Transition endpoints (`source`/`target`) can no longer be changed through the store update API, so shot links cannot be orphaned.
- `package.json` version metadata is unchanged.

## v0.6A — Cinematic shot planner

Pull request: [#8](https://github.com/gofQ/horror-director/pull/8)

### Added
- **Cinematic shots** per scene: ordered planning notes with a stable id, title, start and duration (seconds relative to the scene), framing (wide, medium, close-up, extreme close-up, POV), camera movement (static, pan, tilt, tracking, handheld), psychological technique (none, match cut, impossible space, identity discontinuity, false awakening), sound cue notes and visual/action notes. They are independent of triggers and transitions and are not engine commands.
- **Shot planner** (TR/EN) opened from the scene Inspector: add, edit, duplicate, move up/down, delete and "Sort by time"; timing relative to the scene duration with a position bar; warnings for overlapping shots, shots ending after the scene and shots out of time order. Authored timing is never changed automatically. Keyboard-operable, Undo/Redo inside the dialog, mobile layout.
- Sample project demonstrates shots in the first scene.

### Changed
- **JSON schema 2**: exports are written as `schemaVersion: 2` and include `scene.shots`. Schema-1 exports and bare legacy project files are still imported (missing `shots` become empty lists, with an informational notice). Duplicate shot ids, invalid values and unknown fields (also inside shots) remain blocking import errors; overlapping or late shots are warnings only.
- Library project records are now written as `{ v: 2, project }`. Records written by earlier builds (`v: 1`) are still read, normalized in memory only and never rewritten until the project is edited; the legacy single-project key is never modified. An older build reading a `v: 2` record treats it as damaged and preserves it instead of dropping shots.
- `package.json` version metadata is unchanged.

## v0.5C — Route comparison and documentation cleanup

Pull request: [#7](https://github.com/gofQ/horror-director/pull/7)

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
