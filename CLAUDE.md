# Repository rules for Claude

Horror Director is a browser-only planning tool (React + TypeScript + Vite, no backend). These rules are permanent.

## Every milestone
- **Update `CHANGELOG.md`** for every feature or fix milestone (Added / Changed / Fixed, PR link when available). Never invent dates, releases or test results.
- **README files describe the current product**, not version-to-version changes: no version headings, implementation history or test counts. Version history belongs in `CHANGELOG.md`.
- **Keep `README.md` and `README.tr.md` synchronized** (same structure and facts).
- **Update `progress.md`** with the current status and remaining risks/limitations (engineering handoff, not a changelog).
- **Preserve data compatibility** (JSON schema — currently v6, with v1–v5 and bare-project imports; library records `{ v: 6 }` with `v: 1`–`v: 5` still read and never rewritten at boot — export format, library storage keys, legacy migration) unless a task explicitly says otherwise. Do not change `package.json` version metadata silently.
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
