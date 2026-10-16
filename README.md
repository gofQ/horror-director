# Horror Director

A browser-based planning tool for solo psychological-horror projects, built with Unreal Engine 5.x in mind. Design your
scene flow as a node graph, plan scares on a timeline, track character behaviour, simulate and compare story routes,
and export everything as JSON for later Unreal Engine import. No backend and no paid APIs — projects live in your
browser's `localStorage`.

**Who it is for:** solo developers and small teams who want to plan scene flow, dream/reality transitions, loops and
scare pacing before (or alongside) building the game. Version history: [CHANGELOG.md](CHANGELOG.md). Turkish
documentation: [README.tr.md](README.tr.md).

## Features

- **Scene graph:** drag-and-drop scenes (Reality / Dream / Nightmare / Memory / Ending) connected by typed transitions
  (cut, fade, glitch, blackout, morph, loop-back) with conditions and durations. Dream ⇄ reality crossings are drawn as
  dashed, colour-coded edges. Reciprocal edges, backward edges and self-loops are routed so paths and labels stay readable.
- **Blueprint-style editor:** scene nodes with typed In/Out pins, clear directional wires, hover and selection feedback, a
  connection preview that shows whether a target is valid before you drop, minimap, pan/zoom and Undo/Redo. **IF / Branch**
  nodes have one input and TRUE / FALSE outputs with an editable, human-readable condition: they take part in navigation, the
  simulator, analysis and Auto Arrange; their free-text condition is a preproduction note and is **never evaluated**. **Comments**
  are non-executable frames for organizing areas. Dragging an output pin onto empty canvas opens a searchable node picker
  that creates and connects the node in one undoable step.
- **Narrative state:** per-project Boolean **flags** (name, description, default TRUE/FALSE, referenced by id so renaming is
  safe) managed in the project inspector. A **Set Flag** node (one input, one output) assigns TRUE or FALSE to a flag. An IF
  node can additionally carry a **structured condition** (check a flag is TRUE/FALSE, combined with AND, OR and NOT, nested)
  built with an accessible form, no scripting. The Simulator tracks flag state along the route, evaluates only structured
  conditions, and shows a State inspector. Set Flag and IF nodes are zero-time planning logic, not scenes.
- **Flow control:** three more zero-scene nodes share the same connection rules. An **Event** node (title, description,
  category: story beat, reveal, threat, relief, decision, custom; one input, one output) is an authored narrative milestone: when
  the simulated route passes it, it is stamped on the route clock. A **Delay** node (one input, one output, a duration from
  0 to 3600 seconds, planning notes) adds waiting time *between* scene visits. A **Random Branch** has one input and two
  outputs **A** and **B** with editable outcome labels and a probability of A from 0 to 100 % (B is 100 − A). Events are
  not gameplay callbacks: they are separate from scene triggers and audio cues and never change trigger counts, pacing
  intensity or scene data. Event and Delay outputs accept one connection, Random outputs one connection each, and loops that
  would only pass through logic nodes without a scene are refused. All three work with the context menu and picker,
  drag-to-create from a pin, the Inspector, copy/paste/duplicate, multi-selection, undo/redo, Auto Arrange, reroute points,
  reachability and the minimap.
- **Ordered Sequence:** a **Sequence** node has one input and three outputs, **Then 0**, **Then 1** and **Completed**. It runs
  the Then 0 subflow, returns to the Sequence, runs the Then 1 subflow, returns again, and only then follows Completed into the
  normal story. The Then outputs are two stages that run one after the other, never alternative branches (exactly two stages;
  no nesting or parallel execution). A stage is a straight line of **Event, Delay and Set Flag** nodes that ends in its own
  **Sequence Return** (one input, no output; it names its Sequence and the stage it closes). Scenes, IF, Random Branch and nested
  Sequence nodes are not allowed inside a stage, and a stage can only be entered through its own Then output and left through
  its Return; the editor refuses other connections and says why. An output or stage that is not connected or closed yet is allowed
  while you edit, is marked *Incomplete* on the node and in the Inspector, and is never treated as finished by the simulator.
  Sequence and Return take no time; copying a complete Sequence subgraph keeps the stage and owner links.
- **Custom scene types:** per-project, reusable scene types (name, curated colour and icon, base kind, default description
  and duration). A custom scene is a normal scene whose base kind (reality, dream, nightmare, memory, ending) still drives
  crossings, simulation and analysis.
- **Context menus:** the app owns right-click everywhere inside it, so the browser's native menu never appears. Specialised
  menus cover the graph canvas, scenes, IF nodes, comments, connections, reroute points, Timeline/Sequence items and project
  rows; every other region (header, tabs, empty panels, dialogs, the Production workspace) gets a general application menu
  (copy selected text, undo/redo, go to a tab, back up, projects, language). Text inputs and text areas get an app-themed
  **Cut / Copy / Paste / Select all** menu that keeps the selection and caret and the browser's own undo. The clipboard is
  permission-gated: when the browser blocks or lacks it the item says so (Paste is disabled and names Ctrl/Cmd+V) and a
  message explains what happened, never a silent no-op. Also available with Shift+F10 / the Menu key, Escape to close, arrow
  keys to move, and long-press on touch. Only targets inside the app are handled; browser chrome is untouched.
- **Production planner:** the **Production** tab turns the active project into an implementation plan for **Unreal Engine 5.x**
  (Blueprint-first) or **Unity 6** (C# and components). A pure, deterministic planning core reads the whole authored graph
  (every branch and ending, not one simulated route) and an engine adapter adds the engine mapping. The preview and the
  downloads (`production-plan-unreal.md` / `production-plan-unity.md` and an engine-specific task CSV
  `production-tasks-<engine>.csv`) have 14 sections: overview and assumptions, scene/level inventory, graph and transitions,
  flags, IF and Random Branch, Event/Delay/Sequence, shots, audio, characters, horror triggers, assets and missing dependencies,
  milestones, tasks and a verification checklist. Every task has a stable ID derived from its source IDs, a phase, source
  scene/node/transition/trigger IDs, an engine concept, implementation instructions, dependencies, a Definition of Done and its
  missing information. Semantics are kept: Scene → logic → Scene hops, Sequence order Then 0 → Return 0 → Then 1 → Return 1 →
  Completed, Delay as extra time *between* scenes, Event as a planning milestone (not an existing callback), Random
  probabilities as design intent, structured conditions separated from free-text assumptions, and player belief versus reality
  from transition direction notes. Unreachable scenes and incomplete authoring are listed, missing details are marked **TBD**.
  Class, asset and file names are *proposals*; no code is generated and **no Unreal or Unity runtime integration is
  performed**. The planner is read-only: it never changes the project, library, autosave or undo history.
- **Task hand-off:** the Production tab also lists every task in dependency order (assets before the audio and character tasks that need them, shared systems before consumers, verification last) in a searchable task explorer with filters for phase, source type and readiness. Readiness is **Ready**, **Needs information** (an essential authored input is missing, for example an IF without a condition, an incomplete Sequence stage, an unconnected output, a cue without an asset reference or an unreachable scene) or **Blocked by dependencies**; it is derived from authored data only and never means that anything is implemented: implementation status is always unknown because the app is not connected to an engine. A task's details show its missing requirements and the items to confirm, its source IDs (click to open the scene, node or transition in the graph), and its dependencies and dependents. For the selected task you can **download an implementation brief** (Markdown) with the exact authored data — shots and direction notes, cue timing, spatial direction, fades, silence and asset references, graph pins, flags, structured IF text, Random probabilities, Event and Delay data, Sequence stage order, character states, trigger timing and intensity — plus proposed classes and assets, ordered steps, edge cases, acceptance tests, missing information and exclusions, and **copy a coding agent prompt** for Claude Code or Codex running in your Unreal or Unity project (inspect first, verify what exists, implement only this task, preserve the authored behavior, run engine checks, report). Task IDs depend only on a task's responsibility and source, not on the schedule. The Unreal `/Game/...` text you author per scene is shown only in Unreal plans, as an unverified reference; Unity plans show a proposed scene path. Explorer selection and filters are session-only and never change the project.
- **Showcase sample:** **Projects → Add sample** creates a new project, "The Hollow Village (Showcase)" (never overwriting
  existing work): a false-awakening story with all five scene kinds, a custom scene type, three characters with several states, triggers, shots, spatial
  audio, transition direction notes, a bounded loop, an IF with a structured AND/OR/NOT condition, Set Flag nodes, Event, Delay,
  Random Branch, one complete ordered Sequence with two Returns, reroute points and graph comments. A dismissible **Explore the
  sample** guide on the graph points to where each feature lives and explains editor interactions (undo/redo, copy/paste,
  multi-select, context menus), which are not project data.
- **Reroute points:** right-click a connection → **Add Reroute Point** (or use the buttons in the connection inspector), drag
  the points to reshape the wire, right-click a point → **Remove Point**. Several points per connection are supported (up to
  16); scene, IF and Set Flag connections all work. Points only change how the wire is drawn: endpoints, ports, ids,
  conditions and design notes stay as they are, and simulation, analysis, pacing and comparison ignore them.
- **Selection and productivity:** Ctrl/Cmd-click or Shift+drag (or the Select/Pan toggle) selects several scenes, IF/Set Flag
  nodes and comments; they move, copy, duplicate and delete together, each batch as one undo step. **Copy / Paste /
  Duplicate** (Ctrl/Cmd+C, V, D, also in the context menus) is graph-local and per project: connections are copied only when both
  ends are copied, every id is regenerated (including shots, cues, triggers, shot-linked direction notes), ports and flag
  references stay valid, and a paste lands at the cursor. **Fit Selection**, **Center on Selection**, Select All and `F` help in
  large graphs. Shortcuts never act while you type in a field.
- **Auto Arrange:** a deterministic left-to-right layout of the scenes and logic nodes. It runs only when you press the button,
  changes only positions (reroute points on connections are cleared, undo restores them) and is a single undo/redo step.
- **Loops:** self-loops, per-scene loop settings (max iterations, exit condition) and automatic cycle detection.
- **Horror timeline:** per-scene trigger track with draggable markers, intensity (0–10), trigger types (jumpscare,
  audio, visual, AI, environment, narrative), conditions and a fire-once flag.
- **Cinematic sequence:** a read-only **Sequence** mode inside the Timeline tab that lays a scene's shots, audio cues and
  triggers on one shared time axis (Camera, Audio and Horror events tracks) with a scene-end boundary, layered audio,
  a time cursor, details, a time-ordered list and zoom. It is derived from existing data (nothing is stored), shows
  authored planning timing rather than a simulation, and opens the existing editors for changes.
- **Characters:** behaviour states with aggression levels and a scene × character matrix.
- **Analysis:** structural checks (no start, unreachable scenes, dead ends, closed loops without exit, inescapable
  dreams, triggers past scene duration, stale references) plus project statistics.
- **Story path simulator:** walk a route through the graph by choosing transitions (Back / Restart). Reports whether the
  route reaches an ending, a dead end, is incomplete or was stopped by a limit; shows an absolute-time chart of planned
  triggers at their authored intensity and route statistics.
- **Pacing analysis:** neutral, deterministic observations about the simulated route (see below).
- **Route comparison:** pin a route as Route A, build Route B and compare them side by side (see below).
- **Shot planner:** ordered cinematic shot notes per scene (framing, camera movement, psychological technique, sound
  and visual notes, start/duration relative to the scene) opened from the scene Inspector. Planning notes only — they
  are independent of triggers and transitions, warn about overlaps and overruns, and never change your timing.
- **Transition designer:** optional director's notes per transition — psychological technique (including reality reveal),
  what the player believes vs. what is actually happening, the reveal, visual/audio continuity, Unreal notes and links to
  shots of the source and destination scenes, with a before → transition → after preview. Planning data only: never
  evaluated, independent of the transition's style, condition and duration.
- **Audio planner:** ordered audio cues per scene (ambience, music, SFX, voice, whisper, stinger, silence) with start/duration
  relative to the scene, diegetic / non-diegetic / ambiguous origin, spatial direction (non-spatial, front, behind, left,
  right, above, moving), a descriptive target level, fades, loop flag, asset reference, direction notes and an optional
  text-to-audio brief, opened from the scene Inspector with a layered timeline. Planning notes only — no playback,
  spatialization, generation or engine commands; independent of triggers, scene ambience, shot sound notes and pacing.
- **Project library:** several projects, open/create/rename/duplicate/delete, import as new, remembered active project.
- **Safety:** undo/redo (50 steps), strict import validation, save-status indicator, JSON backup, recovery of unreadable data.
- **English and Turkish** interface, responsive dark UI (the inspector becomes a bottom sheet on small screens).

## Installation and launch

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

## How to use

1. **Build the graph.** Add scenes from the toolbar over the graph or right-click the canvas (**Add Scene**, **Add Custom
   Scene**, **Add IF / Branch**, **Add Comment / Note**, **Add node…** for a searchable list). Drag from a node's **right**
   pin to another node's **left** pin to connect; connect a node to itself for a loop. Drag from a pin onto empty canvas to
   pick a new node that is connected automatically. Right-click a connection to insert an IF node into it. An **IF / Branch**
   node has a TRUE and a FALSE output (one connection each): write the condition in your own words, connect the outputs to
   scenes, and use it in the Simulator, where you choose TRUE or FALSE yourself — the choice is shown as an assumption, the
   IF node takes no scene time and adds no extra visit or trigger. To model story state, create **flags** in the project
   inspector (nothing selected), add a **Set Flag** node (**Add Set Flag**, the picker, or drag from a pin), choose its flag and
   TRUE/FALSE, and give an IF node a **structured condition** in its inspector. **Add Event**, **Add Delay** and **Add Random Branch** (menu, picker, palette or drag from a pin) create the flow-control nodes; edit their category, duration, labels and probability in the inspector. Define reusable **Scene types** in the project inspector
   (nothing selected). Select an item and press `Del` to delete it (connections go with it in one undo step).
   Set the start scene in the scene inspector. **Projects → Add sample** creates "The Hollow Village (Showcase)", a complete
   demo of every feature (a new project; your own work is untouched).
2. **Plan scares.** In **Timeline**, double-click the track to add a trigger at that time and intensity; drag markers to retime.
   Switch the Timeline to **Sequence** to see the scene's shots, audio cues and triggers together: pick a scene, select an
   item (click, or Tab and Enter) to see its details and place the time cursor, use Fit / zoom for long scenes, and use the
   button in the details to open the item in the Shot planner, the Audio planner or the trigger editor. Items beyond the
   scene end stay where you authored them (the axis is extended and a note is shown); triggers with a condition are marked
   as conditional because they may never fire in play. Layered audio and silence are normal, not errors.
3. **Track characters** in **Characters** and check the structure in **Analysis**.
4. **Simulate a route** in **Simulator:** pick transitions from the current scene. Free-text conditions (on transitions, triggers and
   IF nodes) are *never evaluated*; they are shown as assumptions you make by choosing that transition.
   - Flags start from their defaults and change when the route passes a Set Flag node, in route order; the State inspector
     lists the current values. An IF node with a structured condition shows its evaluated result: the matching output is
     marked *matches condition*, the other stays selectable as an explicit *override (what-if)* that is counted and flagged
     (also in route comparison). Your route is never changed silently. Flag state is recomputed from the start on every
     replay, Back, Restart and graph edit, and is never saved.
   - A **Delay** adds its seconds to the route clock exactly once, in traversal order: the next scene simply starts later
     (scene and connection durations are unchanged) and its scene-local triggers shift with it. An **Event** is stamped
     with the absolute route time. Neither is a scene visit or a trigger occurrence. The **Flow trace** lists events,
     delay start/end, IF choices, Set Flag assignments and Random decisions in chronological order.
   - A **Sequence** shows the stage it waits for: the route can only take Then 0, then (after its Return) Then 1, and only
     then Completed. Every connection is still your explicit choice and the Return hands control back without a choice of its own;
     Delay seconds in a stage count once, Event and Set Flag effects keep their order, and the Flow trace adds *Sequence
     started*, *stage entered*, *stage returned* and *Sequence completed*. Back, Restart and graph edits rebuild the position from the
     chosen connections; visiting the Sequence again starts it afresh. A stage that cannot continue is reported, not skipped.
   - At a **Random Branch** you either pick A or B yourself (marked as a *what-if*) or press **Roll outcome**: a seeded draw
     (the seed is a session-only field) that only previews the result until you commit it. The same seed and decision
     always give the same draw, and nothing is rerolled by Back, replay, project edits or reload. The chosen connection is
     stored in the route like any other choice; the roll's seed is session-only provenance (never saved or exported), and
     route comparison counts rolled versus hand-picked outcomes. One simulated route does not verify the authored probability.
   - Loop `Max iterations` counts *additional repeat visits after the first* (4 ⇒ up to 5 visits). `0` (unlimited) is
     bounded by a configurable safety limit (default 5); other cycles by a hard step cap (default 40, 1–200).
   - A scene visit lasts the scene's `duration`, followed by the transition's `duration`; a trigger's time is *scene
     start + its local time*. `Fire only once` triggers appear on the first visit only; triggers with a condition are
     drawn hollow as *hypothetical*; triggers after their scene's duration are flagged, shown at their true time and
     excluded from the statistics.
   - The chart shows markers only, with no curve: intensity is a design number you entered, **not** a measured fear or
     tension score.
5. **Read the pacing analysis** below the chart. It inspects only valid planned events of the current route
   (hypothetical events are included and flagged). All thresholds are inclusive:

   | Pattern | Rule | Severity |
   |---|---|---|
   | Trigger cluster | ≥ 4 events within 20 s | caution from 6 events |
   | Repeated high intensity | ≥ 2 events with intensity ≥ 8 within 45 s | caution from 3 |
   | Repeated trigger type | ≥ 4 events of one kind within 120 s *(adjustable)* | caution from 6 |
   | Trigger-free interval | gap ≥ 90 s *(adjustable)* from route start, between events and after the last event of a **finished** route | informational |
   | Escalation | ≥ 3 consecutive events with strictly rising intensity, each ≤ 60 s apart | informational |

   Findings are observations, not verdicts: clustering, repetition and silence can all be deliberate. There is no
   quality score and no tension curve. Selecting a finding highlights its events and time range on the chart.
6. **Compare routes:** click **Pin as Route A**, use **Back/Restart** to build **Route B**, and the comparison panel
   shows both side by side: duration and status, scene visits, unique scenes, loop repetitions, planned events,
   events per minute, average/peak authored intensity, trigger-kind distribution, pacing findings by category and
   severity (with explicit `B − A` deltas), the first divergence point, shared and route-exclusive scenes, transitions
   and events, and aligned event timelines. Events are identified by scene, trigger and visit occurrence, so repeated
   visits compare correctly. Both routes use the same limits and thresholds and are re-simulated against the current
   project; if graph edits invalidate Route A you get an explicit warning and the comparison is marked incomplete.
   **Replace Route A** or **Clear comparison** at any time. There is deliberately no "best route" ranking.
7. **Plan shots:** select a scene and open **Shot planner** in the Inspector. Add shots, set start/duration (seconds
   from the scene start), framing, camera movement, a psychological/reality technique and sound/visual notes; duplicate,
   move up/down or delete them. Warnings flag overlapping shots, shots that end after the scene and shots whose start
   precedes the previous shot; nothing is changed automatically. **Sort by time** reorders the list (timing untouched).
   The list shows the authored order, which is also the export order. Undo/Redo covers every change.
8. **Design transitions:** select a transition (click its label) and open **Design transition** in the Inspector. Start a
   design, pick a technique, describe what the player believes, what is actually happening and the reveal, add
   continuity and Unreal notes, and optionally link a shot from the source scene and one from the destination scene
   (self-loops choose both from the same scene). The preview shows before → transition → after. Deleting a shot that a
   transition links asks for confirmation and clears the link in the same undo step; **Clear design** removes a design.
9. **Plan audio:** select a scene and open **Audio planner** in the Inspector. Add cues, set type, origin, spatial
   direction, start/duration (seconds from the scene start), target level (0–10, a planning value rather than measured
   loudness), fades, loop, asset reference, direction notes and an optional text-to-audio brief; duplicate, move up/down
   or delete them. The timeline shows each cue as a bar in layers: overlapping cues are normal and simply use more
   layers, silence cues are drawn hatched and represent an authored intention (they do not mute other cues). Warnings
   flag cues that end after the scene and fades longer than their cue; nothing is changed automatically. Spatial ideas
   (a whisper behind the player, a sound moving left to right, ambience that suddenly disappears, a distant voice with
   ambiguous origin, a stinger after silence) are expressed through the structured fields and notes. Undo/Redo covers every change.
10. **Plan the engine work** in **Production:** pick Unreal Engine 5.x or Unity 6, read the preview, check the listed gaps
    and TBD markers, and download the Markdown plan and the task CSV. In the task explorer search and filter tasks, open a
    task's sources in the graph, download its implementation brief or copy the coding agent prompt. Nothing is changed in your project.
11. Use **Backup** regularly — browser storage can be cleared.

Simulation, pacing and comparison state is separate from the project: it never changes project data, autosave, the
library or undo history, it is not exported, and it resets when you switch projects.

## Data storage, backups and JSON compatibility

- **Storage** (browser `localStorage`): `horror-director:library:v1` (index), `horror-director:proj:<id>` (one record per
  project), `horror-director:lang` (language). Ids are internal and independent of names. Library data (ids,
  timestamps, active project) is never written into project JSON.
- **Backup** downloads the *active* project in the schema-9 export format. Importing validates strictly (duplicate ids,
  dangling references, invalid values, unrecognised fields, newer schema versions are errors shown before anything is replaced). A file
  can be imported as a new project or, with confirmation, replace the active project.
- **Older files and data:** schema-1 to schema-8 exports and bare project files are still imported; missing shots, audio
  cues, IF nodes, comments, scene types and flags start as empty lists and missing transition directions stay absent (an informational notice appears for
  schema-1/bare files), and the next backup is schema 9 with all other fields unchanged. Stored projects from earlier versions are read the
  same way and are only rewritten when you edit them. Project records are stored as `{ v: 9, project }` (earlier `v: 1`–`v: 8`
  records are still read); an older build that cannot read the new fields shows such a record as damaged and preserves it
  rather than dropping data. Downgrading is not supported.
- **Migration:** the single-project storage of early versions is validated, copied into the library under the id
  `legacy`, verified and only then indexed. The original key (`horror-director:project:v1`) is never modified or deleted.
- **Safe switching and recovery:** pending edits are saved before switching; unreadable stored data is preserved
  (`horror-director:unreadable:<time>`) and offered for download instead of being overwritten.
- **Multiple tabs are not merged** (last write wins); a change from another tab is detected, a banner is shown and
  library operations are blocked until you reload.

```jsonc
{
  "format": "horror-director",
  "schemaVersion": 9,
  "exportedAt": "ISO-8601",
  "project": {
    "name": "", "description": "", "startSceneId": "scene id | null",
    "scenes": [{ "id", "title", "kind": "reality|dream|nightmare|memory|ending", "position": {"x","y"},
                 "unrealLevel": "/Game/Maps/…", "ambience", "duration", "loop": {"enabled","maxIterations","exitCondition"},
                 "triggers": [{ "id","name","kind","time","intensity","description","condition","once" }],
                 "shots": [{ "id","title","start","duration","framing": "wide|medium|close-up|extreme-close-up|pov",
                             "movement": "static|pan|tilt|tracking|handheld",
                             "technique": "none|match-cut|impossible-space|identity-discontinuity|false-awakening",
                             "soundNotes","visualNotes" }],
                 "audioCues": [{ "id","title","start","duration",
                                 "type": "ambience|music|sfx|voice|whisper|stinger|silence",
                                 "origin": "diegetic|non-diegetic|ambiguous",
                                 "direction": "nonspatial|front|behind|left|right|above|moving",
                                 "level": "0–10 planning value","fadeIn","fadeOut","loop","asset","notes","prompt" }],
                 "typeId": "custom scene type id (optional; kind equals its baseKind)",
                 "characterStates": { "<characterId>": "<stateId>" } }],
    "flags": [{ "id","name","description","defaultValue": true }],
    "logicNodes": [{ "id", "type": "branch", "title", "description", "condition": "free text, never evaluated", "position": {"x","y"},
                     "expression": "optional structured condition: {op:'flag',flagId,is} | {op:'not',arg} | {op:'and'|'or',args:[…]}" },
                   { "id", "type": "setFlag", "title", "description", "flagId": "flag id | null", "value": true, "position": {"x","y"} },
                   { "id", "type": "event", "title", "description", "eventCategory": "story|reveal|threat|relief|decision|custom", "position": {"x","y"} },
                   { "id", "type": "delay", "title", "description": "planning notes", "seconds": "0–3600", "position": {"x","y"} },
                   { "id", "type": "random", "title", "description", "probabilityA": "0–100 (B = 100 − A)", "labelA", "labelB", "position": {"x","y"} },
                   { "id", "type": "sequence", "title", "description", "position": {"x","y"} },
                   { "id", "type": "seqReturn", "title", "description", "sequenceId": "owning Sequence id | null", "stage": "0|1", "position": {"x","y"} }],
    "comments": [{ "id","title","text","color","position": {"x","y"},"width","height" }],
    "sceneTypes": [{ "id","name","color","icon","baseKind": "reality|dream|nightmare|memory|ending","description","duration?" }],
    "transitions": [{ "id","source": "scene or IF node id","target": "scene or IF node id","label","style","condition","duration",
                      "waypoints": "[{x,y}] reroute points, ≤ 16, flow coordinates, optional (presentation only)",
                      "sourcePort": "true|false (leaving an IF node), a|b (Random Branch) or then0|then1|completed (Sequence); absent for every other source",
                      "direction": { "technique": "none|match-cut|impossible-space|identity-discontinuity|false-awakening|reality-reveal",
                                     "playerBelief","reality","visualContinuity","audioContinuity","reveal","unrealNotes",
                                     "sourceShotId": "shot id of the source scene | null",
                                     "targetShotId": "shot id of the target scene | null" } /* optional */ }],
    "characters": [{ "id","name","role","color","description","states":[{ "id","name","behavior","aggression" }] }]
  },
  "derived": { "startSceneId": "…", "transitions": [{ "id", "crossing": "reality->dream|dream->reality|same-layer" }] }
}
```

`derived` is a convenience block for engine-side readers and is ignored on import. A bare `project` object is also
accepted on import. In Unreal, parse the file with `FJsonObjectConverter`/`UE::Json` or a Python editor script and map
`unrealLevel` to level assets.

## Language

The interface is available in **English** and **Türkçe**. The first visit uses the browser language (`tr*` → Turkish,
otherwise English); the **TR | EN** switch changes it immediately without reloading or losing edits, and the choice is
remembered separately from project data. Your own content (scene names, descriptions, imported text, the sample's
narrative) is never translated, and exported JSON is identical in both languages.

Translation guide: `src/i18n/en.ts` is the source of truth; `src/i18n/tr.ts` is typed `Record<MessageKey, string>`, so a
missing key fails `npm run typecheck`. Messages use `{placeholder}` interpolation checked at compile time; problems from
analysis, validation and import are structured diagnostics (`code` + `params`) rendered through the dictionary.

## Testing

```bash
npm run typecheck   # tsc (app and e2e)
npm test            # unit tests (vitest)
npm run test:e2e    # Playwright browser tests (builds and serves the app itself)
```

E2E needs a Chromium: run `npx playwright install chromium` once, or point `PW_CHROMIUM_PATH` at an existing binary
(e.g. `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`). The suite runs against the production build in
Chromium and uses test ids and DOM geometry rather than screenshot comparisons.

## Known limitations

- Simulation is manual: no automatic route enumeration or "best path"; Random Branch probabilities are authored intent that a single route cannot verify; free-text conditions are display-only; only structured flag conditions are evaluated, and only inside the simulator.
- Timing assumes the full scene duration is spent in every scene; real gameplay timing will differ.
- Pacing thresholds are fixed heuristics (only the repeated-type window and trigger-free minimum are adjustable), not tuned
  to an audience or validated against player behaviour. Intensity is authored design intent, not measured fear.
- Only the current route (and one pinned route) is analyzed or compared; routes are session-only and not saved or exported.
- Multiple browser tabs are not merged; there is no cloud sync. Browser storage can be cleared, so keep backups.
- Auto Arrange uses a readability heuristic, not minimal crossings; very dense graphs can still have overlapping labels.
- Shots are planning notes in a simple list: no storyboard images, camera timeline editor or engine/Unreal import yet. The list
  keeps authored order; sorting by time is an explicit action.
- The Sequence view is a derived overview: it has no playback, waveform or simulation, cannot edit items itself, keeps its
  selection, zoom and cursor only for the session, and shows triggers with a condition as conditional rather than evaluating them.
- Free-text conditions are planning notes and are never parsed or evaluated. Only structured IF conditions on Boolean flags are
  evaluated, and only inside the simulator (nothing is executed in a game); there are no numeric variables, scripting, separate
  AND/OR/NOT nodes, parallel execution, nested Sequences, Sequences with more than two stages, or runtime execution. Set Flag, Event and Delay nodes have one input and one
  output, a Sequence Return has no output, and connections touching any logic node cannot carry a transition design. A Delay is extra time between scene visits,
  not an in-scene timeline editor; scenes still consume their full authored duration.
- Task readiness reflects authored information only (Ready is not Implemented); briefs and prompts are guidance, not generated engine code, and every path, class and asset name in them is a proposal. Task IDs changed once between the first production planner and this one; explorer state is session-only.
- Production plans are planning guidance derived from the project: they contain no executable engine code, do not claim that any
  engine asset or system exists, and no Unreal or Unity runtime integration or importer exists. Class/asset names are proposals;
  the plan text is localized but the project content inside it is not translated. The legacy "The Hollow Apartment" sample still
  seeds a fresh library; the full showcase is added from Projects.
- The app-owned context menu cannot reach browser chrome, and the clipboard depends on browser permission (Paste is unavailable
  where the browser offers no read access; use Ctrl/Cmd+V). Long-press on touch is not exercised on a real device.
- Audio cues are planning notes: no playback, waveform, 3D spatialization, AI generation or engine/Unreal runtime
  instructions, and no asset library. Cues are independent of triggers and do not affect pacing statistics.
- Transition directions are planning notes: no generated images, animation or 3D preview, and no Unreal execution. Stored
  records are schema-checked **and integrity-checked** on load (dangling scene, logic-node, flag, shot, character or scene-type
  references, invalid pins and similar problems): an inconsistent record is listed as such in Projects with its first problems, is
  never opened, repaired, overwritten or deleted automatically, can be downloaded byte-exact, and can be opened explicitly with
  **Open anyway** (a raw copy is saved first; nothing is repaired until you edit).
- Undo/redo history is session-only and cleared when switching projects.
- No Unreal-side importer yet; the JSON format is documented above. The production bundle is not code-split.
- Turkish strings have not been reviewed by a native game-industry editor; E2E covers Chromium only.

## Stack

React 19, TypeScript, Vite, @xyflow/react, Zustand, Zod, lucide-react, Vitest, Playwright.
