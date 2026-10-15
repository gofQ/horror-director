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

- No undo/redo.
- Single project at a time in storage (use Export for multiple projects/backups).
- Opposing edges between the same two scenes overlap visually; edge labels may collide in dense graphs (no auto-layout).
- Transitions between the same ordered pair of scenes are limited to one.
- Timeline is per-scene; there is no cross-scene "run-through" intensity view yet.
- Touch support for graph editing relies on React Flow defaults; timeline drag is pointer-based but only lightly tested on touch.
- No Unreal-side importer yet; the JSON format is documented in the README and is versioned (`schemaVersion`).
- No component/E2E test suite in the repo (browser check was manual).
- Production bundle is ~540 kB (no code-splitting).

## Ideas for next steps

Undo/redo, auto-layout (dagre/elk), multi-project library, path simulator with sanity/intensity curve across a route,
Unreal importer plugin / DataTable CSV export, audio cue library, scene thumbnails.
