# Horror Director

A browser-based planning tool for solo psychological-horror projects (built with Unreal Engine 5.x in mind).
Design your scene flow as a node graph, plan scares on a timeline, track character behaviour, and export
everything as JSON for later Unreal Engine import. No backend, no paid APIs — projects live in your browser's
`localStorage`.

## Features

- **Scene graph** (React Flow): drag-and-drop scene nodes (Reality / Dream / Nightmare / Memory / Ending),
  connect them with typed transitions (cut, fade, glitch, blackout, morph, loop-back), conditions and durations.
- **Dream ⇄ reality transitions**: automatically detected and drawn as dashed, colour-coded edges (↓ descent, ↑ awakening).
- **Looping scenes**: self-loop edges, per-scene loop settings (max iterations, exit condition), and automatic cycle detection.
- **Horror event timeline**: per-scene trigger track with draggable markers, intensity curve (0–10),
  trigger types (jumpscare, audio, visual, AI, environment, narrative), conditions and fire-once flag.
- **Characters**: states with behaviour notes and aggression level; a scene × character matrix tracks each character's state across scenes.
- **Analysis**: structural checks (no start, unreachable scenes, dead ends, closed loops without exit, inescapable dreams,
  triggers past scene duration, stale references) plus project statistics.
- **Import / Export JSON** with schema validation (zod) and a versioned format.
- Undo/redo (50 steps, Ctrl/Cmd+Z), strict import validation, save-status indicator and one-click JSON backup (Ctrl/Cmd+S).
- Auto-save to `localStorage`, responsive dark UI (inspector becomes a bottom sheet on small screens).

## Story path simulator (v0.5A)

The **Simulator** tab walks a route through your scene graph, read-only, by manual choice:

- Starts at the project's start scene, shows the current scene and its outgoing transitions (label, style, duration,
  dream/reality crossing, condition), and lets you pick the next one. **Back** and **Restart** are available; the
  status says whether the route reached an **ending**, a **dead end**, is **incomplete**, or was **stopped by a limit**.
- **Transition conditions are never evaluated.** They are shown as *assumptions* you make by choosing that transition.
- **Loops:** `Max iterations` on a looping scene counts *additional repeat visits after the first* (4 ⇒ up to 5 visits).
  `0` (unlimited) is bounded by a separate configurable **safety limit** (default 5 repeat visits). Cycles through
  scenes without loop settings are bounded by a hard **step cap** (transitions taken; default 40, configurable 1–200).
  Limits always produce an explicit warning; blocked options are disabled with the reason.
- **Absolute timeline:** scene visits run for the scene's `duration`, followed by the transition's `duration`; a
  trigger's absolute time is *scene start + its local time* (repeat visits handled per visit). `Fire only once`
  triggers appear on the first visit only. Triggers with a **condition** are drawn hollow as *hypothetical* (not
  verified gameplay events). Triggers **after their scene's duration** are flagged (red outline), shown at their true
  time (never shifted) and excluded from the statistics.
- **Statistics:** total duration, scene visits, unique scenes, planned trigger occurrences, average/peak intensity,
  reality→dream and dream→reality transitions, loop repetitions (repeat visits) and the route status.
- The chart plots trigger markers at their authored 0–10 intensity with scene boundaries; it deliberately draws no
  curve, because intensity values are designer planning numbers, **not** a measured fear/tension score. Markers and
  events are clickable/keyboard-selectable for details.
- Simulation state is separate from the project: it never changes project data, autosave, the library or undo history,
  resets when you switch projects, and the route is revalidated (shortened with a notice) if graph edits invalidate it.

## Graph usability (v0.4B)

- **Auto Arrange** (graph toolbar): lays scenes out left to right in layers following the story flow — branching,
  merging, cycles, self-loops, disconnected groups (stacked vertically) and multiple endings (one final column) are
  handled. It only changes **scene positions** (ids, transitions, triggers, characters and text are untouched), runs
  **only when you press the button** (never on load, reload or project switch), is **one undo/redo step** that restores
  exact positions, and is deterministic/idempotent (pressing it again changes nothing). Manual dragging still works.
  The viewport then fits the result (the viewport is not stored in the project).
- **Edge routing:** A→B and B→A are drawn on separate paths with separate labels; backward edges arc underneath or
  S-curve instead of cutting through scenes; self-loops arc above their scene. Edge labels are clickable (they select
  the edge) and show the full text as a tooltip. No schema change; duplicate ordered pairs are still rejected.

## Tests

```bash
npm test            # unit tests (vitest)
npm run test:e2e    # Playwright browser tests (builds and serves the app itself)
```
E2E needs a Chromium: run `npx playwright install chromium` once, or point `PW_CHROMIUM_PATH` at an existing binary
(Cloud Sessions: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`). The suite covers startup, adding and
connecting scenes, Auto Arrange + undo/redo, reciprocal edges and self-loops, project switching, reload persistence and
TR/EN switching, using test ids and DOM geometry (no screenshot comparisons).

## Project library (v0.4A)

The **Projects** button in the top bar opens the library: create, open, rename, duplicate and delete projects, add the
sample, **import a JSON file as a new project**, or (explicitly, with confirmation) replace the active project from a file.
The active project is remembered across reloads. **Backup** always downloads the *active* project in the unchanged
schema-v1 export format — library data (ids, timestamps, active project) is never written into project JSON.

- **Storage:** `horror-director:library:v1` (index), `horror-director:proj:<id>` (one record per project), all in
  `localStorage`. Ids are internal and independent of names.
- **Migration from v0.1–v0.3:** on first start the old single project (`horror-director:project:v1`) is validated,
  copied into the library under the id `legacy`, read back and compared, and only then listed in the index. The original
  key is **never modified or deleted** (it stays as a stale rollback copy), the migration never re-runs, and a crash or
  failed write retries cleanly without duplicates. Unreadable legacy data is preserved (`horror-director:unreadable:<time>`)
  and offered for download instead of being migrated.
- **Switching is protected:** pending edits are saved first; if saving fails you stay on the current project and can
  download a backup or retry. Undo/redo history belongs to the active project and is cleared on every switch.
- **Damaged data:** an unreadable index is preserved and rebuilt from the stored project records; an unreadable project is
  listed as damaged (raw data kept, downloadable) and is never overwritten.
- **Known limit — multiple tabs:** two tabs editing the same library are *not* merged (last write wins). Horror Director
  only detects a change from another tab, shows a banner and blocks library operations until you reload.

## Language / Dil

The interface is fully available in **English** and **Türkçe**. The language is chosen on first visit from the browser
language (`tr*` → Turkish, anything else → English); use the **TR | EN** switch in the top bar to change it at any time —
the UI updates immediately without reloading or losing edits, and the choice is remembered separately from project data
(`localStorage` key `horror-director:lang`). Your own content (scene names, descriptions, imported text and the sample
project's narrative) is never translated, and exported JSON is identical in both languages (JSON keys, enum values and
Unreal asset paths stay as-is). New items (scene, trigger, character…) are given default names in the language active when
they are created. Turkish documentation: [README.tr.md](README.tr.md).

### Adding or changing translations
`src/i18n/en.ts` is the source of truth; `src/i18n/tr.ts` is typed `Record<MessageKey, string>`, so a missing key fails
`npm run typecheck`. Messages use `{placeholder}` interpolation, checked at compile time by `t(key, params)`. Analysis,
validation and import problems are *structured diagnostics* (`code` + `params`, see `src/lib/diagnostics.ts`) rendered
through the dictionary — never English strings translated after the fact.

## Setup

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # vitest unit tests (graph analysis, import/export, store)
npm run typecheck  # tsc
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

## Usage tips

- Add scenes from the toolbar over the graph. Drag from a node's **right** handle to another node's **left** handle to connect;
  connect a node to itself to make a loop. Select and press `Del` to delete.
- Double-click the timeline track to add a trigger at that time/intensity; drag markers to retime.
- Use **Backup** regularly for backups — browser storage can be cleared.
- **Sample** loads "The Hollow Apartment", a demo project showing dream layers, a loop and two endings.

## JSON format (for Unreal integration)

```jsonc
{
  "format": "horror-director",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601",
  "project": {
    "name": "", "description": "", "startSceneId": "scene id | null",
    "scenes": [{ "id", "title", "kind": "reality|dream|nightmare|memory|ending", "position": {"x","y"},
                 "unrealLevel": "/Game/Maps/…", "ambience", "duration", "loop": {"enabled","maxIterations","exitCondition"},
                 "triggers": [{ "id","name","kind","time","intensity","description","condition","once" }],
                 "characterStates": { "<characterId>": "<stateId>" } }],
    "transitions": [{ "id","source","target","label","style","condition","duration" }],
    "characters": [{ "id","name","role","color","description","states":[{ "id","name","behavior","aggression" }] }]
  },
  "derived": { "startSceneId": "…", "transitions": [{ "id", "crossing": "reality->dream|dream->reality|same-layer" }] }
}
```

`derived` is a convenience block for engine-side readers and is ignored on import. A bare `project` object is also accepted on import.
In Unreal, parse the file with `FJsonObjectConverter`/`UE::Json` or a Python editor script, and map `unrealLevel` to level assets.

## Stack

React 19, TypeScript, Vite, @xyflow/react, Zustand (persisted), Zod, lucide-react, Vitest.
