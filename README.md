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
