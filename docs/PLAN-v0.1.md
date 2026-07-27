# v0.1.0 Build Plan

Orchestrated build of the [MVP spec](mvp-spec.md). Workflow follows the house convention: version branch `v0.1.0`, one sub-PR per task targeting it, final PR to `main` with a "Merged sub-PRs" section.

## Stack (versions verified 2026-07-27)

- SvelteKit 2.70.x + Svelte 5.56.x (runes), TypeScript, static adapter (pure client-side PWA)
- Tailwind CSS 4.3.x
- Dexie (latest stable) over IndexedDB
- Vitest for unit tests, Playwright for E2E
- pnpm, ESLint flat config + Prettier, justfile, shell.nix, GitHub Actions CI (`just verify`)
- Deploy: GitHub Pages via Actions (static build)

## Design language

Instagram-like **mono aesthetic**: pure monochrome (black/white + gray scale only), system sans stack, generous whitespace, thin hairline dividers, minimal chrome, bottom tab bar on mobile, no color accents — emphasis via weight and size. Dark mode = inverted grayscale. Chords render in **semibold mono**; lyrics in regular sans. See `docs/design.md`.

## Shared type contracts

Tasks are parallelized against these interfaces (final versions live in `src/lib/theory/types.ts`):

```ts
type PitchClass = 0..11            // C=0 … B=11
type KeyName = string              // canonical spelling, e.g. "A", "Ab", "F#"
interface Chord { degree: number;  // semitones above key root, 0..11
                  quality: string; // "", "m", "7", "maj7", "sus4", …
                  bassDegree?: number; raw?: string }  // raw = passthrough for unparseable
interface Pattern { soundingKey: KeyName; shapeKey: KeyName; capo: number }
interface ChartDoc { title?: string; sourceKey: KeyName;
                     sections: { label?: string; lines: Line[] }[] }
type Line = { lyrics: string; chords: { chord: Chord; index: number }[] }
interface SongRecord / ChartRecord / PatternRecord  // per docs/domain-model.md §5
```

## Task table

| # | Task | Branch | Depends on | Parallel-safe | Touches |
|---|------|--------|-----------|---------------|---------|
| T0 | Bootstrap: SvelteKit scaffold, Tailwind, ESLint/Prettier, vitest, justfile, shell.nix, CI, PR template, LICENSE (MIT), AGENTS.md | `feat/bootstrap` → main | — | — | everything (repo root) |
| A1 | Theory engine: note/key/chord parse+render, degree normalization, enharmonic spelling tables, pattern math, shape ranking | `v0.1.0-task-A1` | T0 | ✅ | `src/lib/theory/` |
| A2 | Chart parsing: chords-above-lyrics → ChartDoc, ChordPro ↔ ChartDoc, pattern-header parser ("Original in Ab. Capo 1, play in G") | `v0.1.0-task-A2` | T0 | ✅ | `src/lib/chart/` |
| A3 | Data layer: Dexie schema (songs/charts/patterns), repositories, export/import (zip + manifest) | `v0.1.0-task-A3` | T0 | ✅ | `src/lib/db/` |
| A4 | Design system + app shell: mono theme, base components (Button, Sheet, Badge, ListItem, SearchBar, TabBar), layout, routing skeleton | `v0.1.0-task-A4` | T0 | ✅ | `src/lib/ui/`, `src/routes/+layout*` |
| B1 | Library screen: list, search, sort, delete | `v0.1.0-task-B1` | A3, A4 | ✅ (own route) | `src/routes/(app)/library/` |
| B2 | Add/edit song: paste flow, metadata form, monospace editor + preview | `v0.1.0-task-B2` | A1, A2, A3, A4 | ✅ | `src/routes/(app)/add/`, `edit/` |
| B3 | Play mode: chart renderer, transpose sheet (key/shape/capo), pattern save, wake lock, font scale | `v0.1.0-task-B3` | A1, A2, A3, A4 | ✅ | `src/routes/(app)/song/` |
| B4 | Grabber: fetch pipeline, pnwchords adapter, generic extractor, adapter registry | `v0.1.0-task-B4` | A2, A3 | ✅ | `src/lib/grab/` |
| C1 | PWA: manifest, icons, service worker/offline, export/import UI, GH Pages deploy workflow | `v0.1.0-task-C1` | B1–B4 | ⚠️ integration | `static/`, `src/service-worker*`, `.github/` |
| C2 | E2E: Playwright acceptance walkthrough (per mvp-spec), README dev-quickstart update | `v0.1.0-task-C2` | C1 | ⚠️ integration | `e2e/`, README |

## Waves

1. **Wave 0**: T0 (PR to main, solo)
2. **Wave 1** (parallel, worktrees): A1, A2, A3, A4
3. **Wave 2** (parallel, worktrees): B1, B2, B3, B4
4. **Wave 3** (sequential): C1 → C2
5. **Validation** on `v0.1.0`: `just verify` + security review (fixes as own sub-PR)
6. **Final PR** `v0.1.0` → `main`, tag `v0.1.0`, GH Release + Pages deploy

## Per-task workflow (each subagent)

1. Worktree off `v0.1.0` (T0: off `main`), branch per table.
2. Implement per spec docs; unit tests required for `lib/` tasks.
3. `just verify` green in the worktree.
4. Push, `gh pr create --base v0.1.0` (T0: `--base main`), title `<ID>: <summary>`, body with `## Summary` / `## Test plan` / trailer.
5. Orchestrator reviews (code-reviewer agent + codex/kimi review), fixes loop, merges.

## Grab-flow MVP decision

Pure-web build: grabber tries direct `fetch` first; on CORS failure it falls back to a guided paste flow ("open the page → copy all → paste here" with the same adapter parsing applied to pasted text/HTML). No hosted relay in v0.1 (licensing posture: stateless or nothing). Capacitor wrap is the v0.2 path to native fetch + share-sheet.
