# Changelog

Version history of Horror Director, newest first. This file is the canonical user-facing history; the READMEs describe
the current product only and `progress.md` tracks engineering status.

The labels below (MVP/v0.1 through v0.7E) are **development milestones**, not published releases: the project has no
tagged releases and `package.json` stays at `0.1.0`. Each milestone after the MVP was developed on its own branch and
merged through a pull request into the integration branch (`claude/optimistic-tesla-r2v8g6`). The JSON schema was
`schemaVersion: 1` until v0.6A introduced `schemaVersion: 2` (scene shots) and v0.6B `schemaVersion: 3`
(transition direction) v0.6C `schemaVersion: 4` (scene audio cues) v0.7A `schemaVersion: 5` (IF nodes, comments, custom scene types, branch-port links) v0.7B `schemaVersion: 6` (narrative flags, Set Flag nodes, structured IF conditions) v0.7C `schemaVersion: 7` (reroute points) v0.7D `schemaVersion: 8` (Event, Delay and Random Branch nodes) and v0.7E `schemaVersion: 9` (ordered Sequence and Sequence Return nodes); files of every earlier version, and bare project files, are still imported.

Every future feature or fix milestone must add an entry here (see `CLAUDE.md`).

## v0.7E — Ordered Sequence

Pull request: [#17](https://github.com/gofQ/horror-director/pull/17)

### Added
- **Sequence node**: a Blueprint-style ordered-execution node with one input and three outputs, **Then 0**, **Then 1** and **Completed** (stable id, title, description). Entering it runs the connected Then 0 subflow, returns to the Sequence, runs the Then 1 subflow, returns again and only then follows Completed into the normal narrative graph. The Then outputs are stages that run one after the other — never alternative branches. Exactly two stages (the data model keeps the stage as an index); no dynamic output counts, no nesting, no parallel execution.
- **Sequence Return node**: one input, no execution output; it references its owning Sequence and the Then stage it closes (assigned automatically when created from a Then pin or a stage chain, otherwise in the Inspector). In the simulator it hands control back to its Sequence.
- **Stages** are linear subflows of existing **Event, Delay and Set Flag** nodes that end in the matching Return. Scenes, IF, Random Branch and nested Sequence nodes are not allowed inside a stage, and a stage can only be entered through its own Then output and left through its own Return. Shared pure helpers (`src/lib/seqflow.ts`) drive the connection rules, project validation, analysis and the editor badges; refused connections explain why (wrong stage or owner, forbidden node, shortcut into a stage, Return without output, one connection per pin).
- **Simulator**: the single pure `simulateRoute` gains a bounded Sequence frame. Every connection stays an explicit route choice and no transition id is invented: after the Return the Sequence offers the next stage, after the second Return only Completed. Sequence and Returns take no time, Delay seconds are counted exactly once, Event timestamps and Set Flag assignments keep their order, and the Flow Trace shows *Sequence started*, *stage entered*, *stage returned* and *Sequence completed*. Back, Restart and graph edits rebuild the frame from the chosen transition ids; the step cap and loop limits still apply; visiting the Sequence again starts a fresh invocation. An unconnected or unclosed stage is reported and the route stops there — a stage is never treated as complete, Completed is never offered early and no scene visit is invented.
- **Editor**: right-click menu, searchable picker (a Then pin offers only valid stage nodes), palette buttons, drag-to-create, Inspector for both nodes (outputs overview and the node's authoring problems), copy/paste/duplicate with ownership remapping (a complete selected Sequence subgraph keeps its stages and Returns with fresh ids; a partial copy leaves a Return unassigned instead of dangling), multi-selection, batch delete (deleting a Sequence leaves its Returns unassigned), undo/redo, Auto Arrange, minimap, reroute points, reachability and analysis (valid Sequence paths produce no false dead ends or unreachable scenes), Turkish/English and keyboard operation. Nodes with incomplete outputs or stages show a visible *Incomplete* warning.

### Changed
- **JSON schema 9**: logic nodes may be `sequence` or `seqReturn` (`sequenceId` owner or `null` while unassigned, `stage` 0–1); `sourcePort` additionally accepts `then0`, `then1` and `completed` (only for connections leaving a Sequence). Malformed ownership references, invalid stage ports, fields that belong to another node type, a Return that is not on its own stage, forbidden stage contents, shortcuts into a stage, extra Return inputs/outputs, unknown fields and more than one connection per output are rejected rather than repaired; incomplete authoring (unconnected outputs, a stage without its Return, an unassigned Return) imports with warnings. Schema 1–8 and bare project files are still imported unchanged; library records are written as `{ v: 9, project }`; `v: 1`–`v: 8` are still read and never rewritten at boot; an older build treats `v: 9` records as damaged and preserves them.
- Connection and validation messages now name Sequence pins; the v0.7D PR link above points to #16. `CLAUDE.md` compatibility rules now state schema 9 and records `{ v: 9 }`. `package.json` version metadata is unchanged.
- E2E: the batch-drag test waits for the drag handler before releasing the pointer (removes a timing race under load).

### Not included
Parallel execution, nested Sequences, dynamic output counts, gameplay execution, new variable types, Unreal integration.

## v0.7D — Event & flow control

Pull request: [#16](https://github.com/gofQ/horror-director/pull/16)

### Added
- **Event node**: an authored narrative milestone (stable id, title, description, category: story beat / reveal / threat / relief / decision / custom; one input, one output). When the simulated route passes it, an entry with the absolute route time is appended to the chronological flow trace. Events are planning milestones, not gameplay callbacks: they are separate from scene triggers and audio cues and never change trigger counts, pacing intensity, scene timelines or authored scene data.
- **Delay node**: one input, one output, a finite duration from 0 to 3600 seconds and planning notes, with the duration shown on the node. A traversed Delay adds its seconds to the route clock exactly once, in traversal order; scene durations and connection durations are unchanged, later scenes start later and their scene-local triggers shift with them. The flow trace shows when a delay starts and ends. Delay is time *between* scene visits, not an in-scene timeline editor.
- **Random Branch node**: one input, two typed outputs **A** and **B** with editable outcome labels and a probability of A from 0 to 100 % (B is 100 − A). In the Simulator you either pick A or B by hand (marked as a *what-if*) or press **Roll outcome**: a deterministic, seeded draw (pure `mulberry32` helper; the seed is a session-only field) that only previews its result until you commit it. The same seed and decision context always give the same draw, nothing is rerolled by Back, replay, project edits or reload, a missing output connection is reported, and 0 % / 100 % are handled explicitly. The chosen connection is stored as a normal route choice; the roll provenance stays session-only (never in project JSON, autosave, undo history or exports). The UI states that one simulated route does not verify the probabilities.
- **Flow trace** in the Simulator: a compact chronological list of events, delay start/end, IF choices (with assumption/override), Set Flag assignments and Random decisions (hand-picked what-if versus rolled with its seed, or source unknown). Route comparison gains rows for delay seconds, Event nodes and Random decisions with the correct duration shifts and a note counting hand-picked versus rolled outcomes.
- All three nodes work like the existing logic nodes: right-click menu and searchable picker, palette buttons, drag-to-create from an output pin (including Random A/B), typed validated connections, Inspector editing, copy/paste/duplicate, multi-selection, batch delete, undo/redo, Auto Arrange, reroute points, reachability analysis, minimap, Turkish/English and keyboard operation.

### Changed
- **JSON schema 8**: logic nodes may be `event` (`eventCategory`), `delay` (`seconds`, 0–3600) or `random` (`probabilityA` 0–100, `labelA`, `labelB` ≤ 40 characters); `sourcePort` additionally accepts `a`/`b` (only for connections leaving a Random Branch). Malformed values, fields that belong to another node type, wrong pin types, more than one connection per output, extra outputs on Event/Delay and logic-only cycles are rejected rather than repaired. Schema 1–7 and bare project files are still imported unchanged; library records are written as `{ v: 8, project }`; `v: 1`–`v: 7` are still read and never rewritten at boot; an older build treats `v: 8` records as damaged and preserves them.
- `graphRules.ts` stays the single source of connection semantics (pin types per node kind, single-output nodes, logic-only cycle check); the simulator keeps one pure traversal (`simulateRoute`) for Scene, IF, Set Flag, Event, Delay and Random Branch with the same link-count step cap, loop protections and deterministic replay; invalidated tails (including a pin that no longer fits) are reported, never repaired.
- The connection and validation messages mention Random Branch pins; `CLAUDE.md` compatibility rules now state schema 8 and records `{ v: 8 }`. `package.json` version metadata is unchanged.

### Not included
Sequence or parallel nodes, automatic traversal, runtime randomness, new variable types, Unreal integration.

## v0.7C — Graph productivity & reliability

Pull request: [#14](https://github.com/gofQ/horror-director/pull/14)

### Added
- **Reroute points**: movable waypoints on existing connections (scene, IF and Set Flag links). Right-click a connection → *Add Reroute Point* at the cursor (inserted into the nearest part of the wire), drag points to reshape it (one undo step per drag), right-click a point → *Remove Point*, *Clear Reroute Points*, arrow keys nudge and Delete removes a focused point; the connection inspector lists the points (move earlier/later, remove, add on the wire) as the keyboard/touch alternative. Several points per connection (max 16). The route is a smooth curve through the points with horizontal tangents at the pins, so arrowheads and labels stay readable; connections without points are drawn exactly as before.
- **Multi-selection and batch editing**: Ctrl/Cmd-click, Shift+drag box selection and a Select/Pan toggle (plain-drag box selection, touch-friendly); a "N selected" badge and a batch panel in the Inspector. Selected nodes move together as one undo step (a drag is one step, and links whose two ends move together carry their reroute points along), and Delete removes the batch with its connections as one step. A tiny drag threshold, no store writes while panning or while a connection is being dragged.
- **Copy / Paste / Duplicate** (Ctrl/Cmd+C, V, D and context menus; paste at the cursor or offset from the original, repeated pastes cascade): scenes, IF nodes, Set Flag nodes and comments; connections only when both ends are copied; fresh ids for nodes, triggers, shots, audio cues and connections; shot-linked transition directions are remapped; branch ports, structured conditions, character states and custom scene types are kept; a deleted flag detaches a pasted Set Flag / drops its checks, a deleted scene type is dropped, the start scene never changes. Atomic and undoable; the clipboard is session-only and cleared when the project changes.
- **Large-graph UX**: Fit Selection and Center on Selection (menus, toolbar, `F`), Select All, stronger selected-node and selected-wire emphasis, viewport culling for graphs over 60 nodes, and no full analysis or edge rebuild while dragging (reachability is recomputed from the structure only). Shortcuts are active on the canvas (or with nothing focused) and never inside inputs, menus, dialogs or other panels.
- **Library integrity check**: stored records are now integrity-checked on load with the same rules as import errors (dangling scene/logic-node/flag/shot/character/scene-type references, invalid pins, duplicate ids, …). An inconsistent record is listed with its first problems, is never opened, repaired, overwritten or deleted automatically, can be downloaded byte-exact, and can be opened with an explicit, confirmed *Open anyway* (the raw record is saved under `horror-director:unreadable:<time>` first; nothing is repaired until you edit).

### Changed
- **JSON schema 7**: optional `transition.waypoints` (≤ 16 `{x, y}` points, finite coordinates within ±100000, unknown keys rejected). Schema 1–6 and bare project files are still imported unchanged; points are presentation only and are never read by simulation, analysis, pacing or comparison (covered by equality tests). Library records are written as `{ v: 7, project }`; `v: 1`–`v: 6` are still read and never rewritten at boot; an older build treats `v: 7` records as damaged and preserves them.
- **Auto Arrange** also clears reroute points in its single undo step (stale points would bend wires around the old layout) and says so.
- The legacy-migration check is unaffected by the integrity check (the migrated record is verified for equality only).
- `CLAUDE.md` compatibility rules now state schema 7 and records `{ v: 7 }`. `package.json` version metadata is unchanged.

### Not included
Event, Delay, Random Branch, new variable types, cross-project paste, Unreal integration.

## v0.7B — Narrative state & logic

Pull request: [#13](https://github.com/gofQ/horror-director/pull/13)

### Added
- **Narrative flags**: per-project Boolean flags (stable id, name, optional description, default TRUE/FALSE) with a localized **Flag manager** in the project inspector (add, rename, edit, delete). Everything references flags by id, so renaming never breaks a node; empty and duplicate names (compared ignoring case) are refused with an explanation.
- **Safe flag deletion**: deleting a used flag lists the affected Set Flag nodes and IF conditions and needs an explicit "clear references and delete" confirmation; the clean-up (Set Flag nodes become unassigned, checks are removed from conditions) and the deletion are one undo step. No dangling references are left behind.
- **Set Flag node** (one execution input, one output, flag, TRUE/FALSE value, editable title; compact teal Blueprint node): graph context menu and node menu, searchable picker, drag-to-create from any output pin (one undo step), duplicate, delete, undo/redo, Auto Arrange, connection validation (single output, no pin id, no self-link, no logic-only cycle) and structural analysis (unreachable, unassigned, no output, flags tested but never set). A zero-time planning node: no scene visit, no trigger occurrence, no scene time.
- **Structured IF conditions** (optional, additive to the unchanged free-text condition): Check Flag (is TRUE / is FALSE), AND, OR, NOT, nested (depth ≤ 6, ≤ 32 nodes), edited in the Branch inspector with a keyboard-accessible builder and a readable preview. No scripting, no `eval`, no raw JSON editing.
- **State-aware simulator**: flags start from their defaults and change in route order when a Set Flag node is passed; only structured conditions are evaluated; free text is never parsed. A **State inspector** shows current values, changes versus defaults and the last setter; the pending banner and the TRUE/FALSE options show the evaluated result — the matching output is *valid*, the contradicting one stays selectable as an explicit *override (what-if)*. The route is never changed silently; state is recomputed from the start on every replay, Back, Restart and graph edit, and is never persisted. Set Flag and IF links still count toward the step cap.
- **Compare / pacing**: overrides are counted per route (`overrides` in the comparison summary), a row and a note mark a comparison that contains what-if choices as not validated logic; event timing and pacing statistics are unchanged by flag nodes.

### Changed
- **JSON schema 6**: exports are written as `schemaVersion: 6` with `project.flags`, `logicNodes` of type `setFlag` (`flagId`, `value`) and an optional `expression` on `branch` nodes. Schema 1–5 and bare project files are still imported (flags start empty; existing scenes, shots, audio cues, transition designs, scene types, comments, IF nodes and all links are untouched). Unknown fields, unknown flag references, duplicate flag ids/names, malformed or oversized expressions, fields that do not belong to the node type, a pin id on a Set Flag link, more than one Set Flag output and logic-only cycles through Set Flag nodes are blocking import errors; unassigned Set Flag nodes and IF nodes without any condition only warn.
- Library project records are now written as `{ v: 6, project }`. Records with `v: 1`–`v: 5` are still read, normalized in memory only and not rewritten until the project is edited; the legacy single-project key is never modified. An older build reading a `v: 6` record treats it as damaged and preserves it.
- `LogicNode` is one schema with a `type` of `branch` or `setFlag`; `canConnect` gains the `outputTaken` reason. Free-text wording in the simulator and README now says that only *free-text* conditions are never evaluated.
- `CLAUDE.md` compatibility rules now state schema 6 and records `{ v: 6 }`. `package.json` version metadata is unchanged.

### Not included
Event and Delay nodes, Random Branch, Reroute, separate AND/OR/NOT nodes, numeric/string variables, clipboard paste, gameplay execution and Unreal integration.

## v0.7A — Blueprint-inspired narrative graph editor

Pull request: [#12](https://github.com/gofQ/horror-director/pull/12)

### Added
- **Blueprint-style Scene Graph**: category headers (reality/dream/nightmare/memory/ending stay recognizable), compact metadata, typed In/Out execution pins, directional wires with hover/selection feedback, a **connection preview coloured by validity** (checked before you drop) and rejected-drop explanations. Pan, zoom, minimap, selection, drag, Delete and Undo/Redo keep working.
- **IF / Branch node** with one input and TRUE / FALSE outputs (distinct colours and pin ids), an editable condition and optional title/description. It is a real node of the narrative graph: connections follow pin direction and cardinality (one connection per output, no duplicates, no self-link, no IF-only cycle without a scene), cycles through scenes stay allowed within the existing safety limits. Conditions are preproduction descriptions and are **never evaluated**.
- **Simulator integration**: choosing the link into an IF node leaves the route *pending* at it; the user explicitly picks TRUE or FALSE, the condition is shown as an assumption, the IF node takes zero scene time and creates no extra visit or trigger occurrence. Loop limits, the step cap (counts links), route revalidation, A/B route comparison and pacing analysis work for branch paths (hops through an IF node count as assumed transitions).
- **Analysis and Auto Arrange** understand IF nodes: reachability and loops run over scenes and IF nodes (no false "unreachable" scenes), crossings are counted per effective scene-to-scene hop, unconnected TRUE/FALSE outputs and unreachable IF nodes are reported, and layout places scenes and IF nodes together without overlaps.
- **Custom scene types** per project (name, curated colour and icon, base kind, default description/duration): create and edit them in the project inspector, add scenes from them via the node picker/menus, apply them in the scene inspector. A custom scene keeps its base kind for crossings, simulation and analysis; the base kind is locked while scenes use the type; deleting a used type needs an explicit confirmation and only detaches the scenes (undoable).
- **Comments**: titled, coloured, resizable frames for organizing areas; never part of simulation, reachability or statistics.
- **Context menus** (new reusable accessible component with keyboard navigation, search, submenus, viewport clamping, Esc/outside close, Shift+F10 / menu key and touch long-press; native menus stay on inputs): graph canvas (Add Scene ▸, Add Custom Scene ▸, IF/Branch, Comment, Add node… picker, Auto Arrange, Fit View), scenes (Edit/Focus, Duplicate, Set as Start, Open Timeline/Sequence, Shot/Audio Planner, Delete), IF nodes (Edit condition, Duplicate, Delete), connections (Select/Edit, **Insert IF node**, Delete), plus Timeline trigger rows, Sequence items and library project rows (only existing actions).
- **Drag-to-create**: dropping an output wire on empty canvas opens a searchable picker at the drop position (compatible targets only); the new node and its connection are one undo step, cancelling changes nothing.
- Store: scene duplication, node duplication, generalized delete (scenes, IF nodes, comments and their connections in one undo step).

### Changed
- **JSON schema 5**: exports are written as `schemaVersion: 5` with `project.logicNodes`, `project.comments`, `project.sceneTypes`, optional `scene.typeId` and optional `transition.sourcePort`. A branch connection is a normal transition whose source/target may be an IF node, so ids, shot links and transition directions of existing transitions are untouched. Schema 1–4 and bare project files are still imported (new collections start empty). Unknown fields, duplicate ids (scenes, IF nodes and comments share one id space), comment endpoints, missing/unexpected pins, two connections on one pin, duplicate connections, IF-only cycles, designs on IF connections and scene type mismatches are blocking import errors; IF nodes without condition or with open outputs only warn.
- Library project records are now written as `{ v: 5, project }`. Records with `v: 1`–`v: 4` are still read, normalized in memory only and not rewritten until the project is edited; the legacy single-project key is never modified. An older build reading a `v: 5` record treats it as damaged and preserves it.
- `updateTransition` ignores endpoint/pin changes at runtime; `addTransition` validates every connection (`canConnect`).
- `CLAUDE.md` compatibility rules now state schema 5 and records `{ v: 5 }`. `package.json` version metadata is unchanged.

### Fixed
- The minimap showed no nodes: React Flow's measured node sizes were never fed back into the controlled nodes. They are now kept in session state (never in the project), so the minimap draws scenes, IF nodes and comments.

### Not included
Reroute nodes, clipboard paste, Set Variable, AND/OR, Event and Delay nodes (Set Flag and structured conditions arrived in v0.7B).

## v0.6D — Cinematic sequence overview

Pull request: [#11](https://github.com/gofQ/horror-director/pull/11)

### Added
- **Sequence mode** inside the Timeline tab (segmented control next to the scene selector; the trigger editor stays as its own mode and there is no new top-level tab). For the selected scene it shows three coordinated tracks — Camera (shots), Audio (cues) and Horror events (triggers) — on one scene-relative time axis with aligned ticks, a scene-end boundary, layered audio, overlapping shots in lanes, a vertical time cursor (set by selecting an item or with a keyboard-operable slider), Fit / zoom with horizontal scrolling, a detail panel and a compact time-ordered event list. Items are accessible buttons (Tab, Enter/Space) and categories are distinguished by label, shape and pattern as well as colour.
- **Derived model** `src/lib/sequence.ts`: pure `buildSequence(scene)` with stable `kind:id` keys, original references, deterministic ordering (start, then shot < audio < trigger, then authored order) and the displayed range extended — never clamped or retimed — for items past the scene duration. Reuses the shot and audio analysis helpers.
- **Planning notes**: informational warnings for shots/cues beyond the scene duration, triggers after the scene end, fades longer than their cue, and empty or partially planned scenes. Layered audio and silence are not errors; triggers with a free-text condition are marked conditional (they may never fire in play); the view states that it shows authored planning timing, not a simulation.
- **Open in editor** from the details: Shot planner or Audio planner focused on the selected item, or the existing trigger editor with that trigger selected. The overview itself is read-only; edits use the existing editors with their Undo/Redo and autosave, and selections never go stale after deletions or project switches.

### Changed
- `ShotPlannerDialog` and `AudioPlannerDialog` accept an optional `focusId` (focus that item's title on open); `assignLanes` accepts any `{ id, start, duration }` list.
- No schema change: JSON stays `schemaVersion: 4`, records stay `{ v: 4 }`; nothing new is persisted. `package.json` version metadata is unchanged.

## v0.6C — Audio & atmosphere planner

Pull request: [#10](https://github.com/gofQ/horror-director/pull/10)

### Added
- **Audio cues** per scene: ordered planning notes with a stable id, title, start and duration (seconds relative to the scene), type (ambience, music, SFX, voice, whisper, stinger, silence), origin (diegetic / non-diegetic / ambiguous), spatial direction (non-spatial, front, behind, left, right, above, moving), a descriptive target level (0–10, not measured loudness), fade-in/fade-out, loop flag, asset/reference identifier, sound direction notes and an optional text-to-audio brief. They are planning data only — not playable audio or engine commands — and independent of triggers, scene ambience, shot sound notes and transition audio continuity (nothing is migrated or overwritten). They do not influence pacing statistics.
- **Audio planner** dialog (TR/EN) from the scene Inspector: add, edit, duplicate, move up/down and delete cues; a layered SVG/CSS timeline with per-type styling (silence hatched); overlapping cues are shown as layers and never as errors; silence is an authored intention and does not mute other cues; warnings for cues ending after the scene and for fades longer than the cue. Authored timing is never changed automatically. Keyboard-operable, Undo/Redo inside the dialog, mobile layout.
- Sample project demonstrates a layered cue set (hum bed, intentional silence, whisper from behind, stinger) in the first scene.

### Changed
- **JSON schema 4**: exports are written as `schemaVersion: 4` and include `scene.audioCues`. Schema 1, 2, 3 and bare project files are still imported (missing `audioCues` become empty lists; shots, transition directions, triggers, characters and all other fields are preserved). Duplicate cue ids (per scene), invalid values and unknown fields (also inside cues) are blocking import errors; cues past the scene end or with over-long fades are warnings only.
- Library project records are now written as `{ v: 4, project }`. Records with `v: 1`–`v: 3` are still read, normalized in memory only and not rewritten until the project is edited; the legacy single-project key is never modified. An older build reading a `v: 4` record treats it as damaged and preserves it.
- `CLAUDE.md` compatibility rules now state the current schema (4) and the accepted older versions.
- `package.json` version metadata is unchanged.

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
