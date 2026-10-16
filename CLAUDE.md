# Repository rules for Claude

Horror Director is a browser-only planning tool (React + TypeScript + Vite, no backend). These rules are permanent.

## Every milestone
- **Update `CHANGELOG.md`** for every feature or fix milestone (Added / Changed / Fixed, PR link when available). Never invent dates, releases or test results.
- **README files describe the current product**, not version-to-version changes: no version headings, implementation history or test counts. Version history belongs in `CHANGELOG.md`.
- **Keep `README.md` and `README.tr.md` synchronized** (same structure and facts).
- **Update `progress.md`** with the current status and remaining risks/limitations (engineering handoff, not a changelog).
- **Preserve data compatibility** (JSON schema — currently v9, with v1–v8 and bare-project imports; library records `{ v: 9 }` with `v: 1`–`v: 8` still read and never rewritten at boot — export format, library storage keys, legacy migration) unless a task explicitly says otherwise. Do not change `package.json` version metadata silently.
- **Run and report the relevant tests** with real results; state environment limitations honestly.

## Commands
```bash
npm run typecheck
npm test
npm run build
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e   # Cloud sessions; elsewhere: npx playwright install chromium
```

## Conventions
- Work on a dedicated branch per milestone and open a PR against the integration branch; do not auto-merge.
- Localization: add every UI string to `src/i18n/en.ts` and `src/i18n/tr.ts` (typed parity); user content is never translated.
- Simulator, pacing and comparison are read-only and session-only: they must never write to project data, autosave, undo history or exports.
- Keep changes scoped to the milestone; no unrelated refactors.
- Right-click inside the app is app-owned: a new region needs no code (the global fallback in `GlobalContextMenu.tsx` covers it); a specialised menu must call `preventDefault()` so the fallback skips it.
- Production task ids must depend only on a task's responsibility and source identity, never on phase, order or engine; readiness comes from authored data and implementation status is always unknown.
- Production progress is user data stored separately from the project: keys `horror-director:progress:v1:<library project id>` (never under `horror-director:proj:`), strict versioned validation, verified compare-and-set writes; it is never written into project JSON, undo history, autosave or exports. `verified` is reachable only through an explicit confirmed approval, a stale record keeps its saved status, and damaged progress or orphans are preserved, never silently deleted. Task-source fingerprints must exclude UI-only fields (positions, waypoints), language, order and unrelated entities.
- The production planner (`src/lib/production/`) is pure and read-only; engine wording lives in `plan.*` i18n keys and names are always labelled as proposals.
