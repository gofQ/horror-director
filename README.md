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
- **Auto Arrange:** a deterministic left-to-right layout of the scenes. It runs only when you press the button, changes
  only scene positions and is a single undo/redo step.
- **Loops:** self-loops, per-scene loop settings (max iterations, exit condition) and automatic cycle detection.
- **Horror timeline:** per-scene trigger track with draggable markers, intensity (0–10), trigger types (jumpscare,
  audio, visual, AI, environment, narrative), conditions and a fire-once flag.
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

1. **Build the graph.** Add scenes from the toolbar over the graph. Drag from a node's **right** handle to another
   node's **left** handle to connect; connect a node to itself for a loop. Select an item and press `Del` to delete it.
   Set the start scene in the scene inspector. **Sample** loads "The Hollow Apartment", a demo with dream layers, a loop
   and two endings.
2. **Plan scares.** In **Timeline**, double-click the track to add a trigger at that time and intensity; drag markers to retime.
3. **Track characters** in **Characters** and check the structure in **Analysis**.
4. **Simulate a route** in **Simulator:** pick transitions from the current scene. Transition conditions are *never
   evaluated*; they are shown as assumptions you make by choosing that transition.
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
10. Use **Backup** regularly — browser storage can be cleared.

Simulation, pacing and comparison state is separate from the project: it never changes project data, autosave, the
library or undo history, it is not exported, and it resets when you switch projects.

## Data storage, backups and JSON compatibility

- **Storage** (browser `localStorage`): `horror-director:library:v1` (index), `horror-director:proj:<id>` (one record per
  project), `horror-director:lang` (language). Ids are internal and independent of names. Library data (ids,
  timestamps, active project) is never written into project JSON.
- **Backup** downloads the *active* project in the schema-4 export format. Importing validates strictly (duplicate ids,
  dangling references, invalid values, unrecognised fields, newer schema versions are errors shown before anything is replaced). A file
  can be imported as a new project or, with confirmation, replace the active project.
- **Older files and data:** schema-1, schema-2 and schema-3 exports and bare project files are still imported; missing shots
  and audio cues start as empty lists and missing transition directions stay absent (an informational notice appears for
  schema-1/bare files), and the next backup is schema 4 with all other fields unchanged. Stored projects from earlier versions are read the
  same way and are only rewritten when you edit them. Project records are stored as `{ v: 4, project }` (earlier `v: 1`–`v: 3`
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
  "schemaVersion": 4,
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
                 "characterStates": { "<characterId>": "<stateId>" } }],
    "transitions": [{ "id","source","target","label","style","condition","duration",
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

- Simulation is manual: no automatic route enumeration, probabilities or "best path"; conditions are display-only text.
- Timing assumes the full scene duration is spent in every scene; real gameplay timing will differ.
- Pacing thresholds are fixed heuristics (only the repeated-type window and trigger-free minimum are adjustable), not tuned
  to an audience or validated against player behaviour. Intensity is authored design intent, not measured fear.
- Only the current route (and one pinned route) is analyzed or compared; routes are session-only and not saved or exported.
- Multiple browser tabs are not merged; there is no cloud sync. Browser storage can be cleared, so keep backups.
- Auto Arrange uses a readability heuristic, not minimal crossings; very dense graphs can still have overlapping labels.
- Shots are planning notes in a simple list: no storyboard images, camera timeline editor or engine/Unreal import yet. The list
  keeps authored order; sorting by time is an explicit action.
- Audio cues are planning notes: no playback, waveform, 3D spatialization, AI generation or engine/Unreal runtime
  instructions, and no asset library. Cues are independent of triggers and do not affect pacing statistics.
- Transition directions are planning notes: no generated images, animation or 3D preview, and no Unreal execution. Stored
  records are schema-checked on load but not integrity-checked (a link to a missing shot is flagged in the designer and can
  be cleared; imports reject it).
- Undo/redo history is session-only and cleared when switching projects.
- No Unreal-side importer yet; the JSON format is documented above. The production bundle is not code-split.
- Turkish strings have not been reviewed by a native game-industry editor; E2E covers Chromium only.

## Stack

React 19, TypeScript, Vite, @xyflow/react, Zustand, Zod, lucide-react, Vitest, Playwright.
