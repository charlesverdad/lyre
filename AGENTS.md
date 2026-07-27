# AGENTS.md — Lyre

Open-source, mobile-first worship songbook PWA. Read `docs/` before implementing anything — nothing gets built that isn't in an approved doc.

## Ground rules

- **Use `just` for everything** — never call pnpm/vite/eslint directly. `just verify` (lint + format check + typecheck + unit tests) must pass before any PR.
- `shell.nix` provides all binaries. If a command is missing, run it via `nix-shell --run '…'`.
- Package manager: **pnpm**. TypeScript strict. Svelte 5 runes (no legacy stores in new code).
- Design: monochrome only, per `docs/design.md`. Token utilities (`bg-bg`, `text-ink`, `border-line`); raw `gray-*`/color classes are banned.
- Music theory correctness is non-negotiable: degree-based transposition, key-aware enharmonic spelling (`docs/domain-model.md` §4). Never do naive +n-semitone string math on chord names.
- Licensing posture (`docs/licensing-and-content.md`): app ships zero song content; grabs are user-initiated + attributed; no bulk crawling; no UG adapter.

## Workflow

- PR-only; nobody pushes to `main`. Release work goes through a version branch (`v0.1.0`); each task is a sub-PR (`v0.1.0-task-<ID>` branch, title `<ID>: <summary>`) targeting the version branch. Final PR to `main` lists all merged sub-PRs.
- Commits: Conventional Commits (`feat(scope): …`, `fix: …`). PR body: `## Summary` / `## Test plan` / `## Notes for reviewers`.
- Every commit/PR ends with the `🤖 Generated with Claude Code` trailer.
- Unit tests are required for `src/lib/**` changes. E2E lives in `e2e/`.

## Learnings

Operational gotchas for future agents go in `.claude/LEARNINGS.md`, newest first, concise.
