# Contributing to Lyre

Thanks for considering it. Lyre is open source from day one — bug fixes, site adapters, and feature work are all welcome.

## Getting set up

See the [README's dev quickstart](README.md#dev-quickstart) for cloning, installing, and running the app locally. The short version: Node ≥24 + pnpm + [`just`](https://just.systems) (or `nix-shell`, which provides all three), then `just install dev`.

## Before you open a PR

`just verify` (lint + format check + typecheck + unit tests) must pass. If you touched `src/routes/`, `src/lib/ui/`, or anything else user-facing, also run `just e2e` — the Playwright acceptance walkthrough builds the app and runs it in a real browser.

```sh
just verify
just e2e
```

Unit tests are required for any `src/lib/**` change. E2E specs live in `e2e/`.

## Commit and PR conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope): …`, `fix: …`, `docs: …`).
- PR descriptions use `## Summary` / `## Test plan` (and `## Notes for reviewers` where useful).
- This is a solo/small-team project using a version-branch workflow — see [`docs/PLAN-v0.1.md`](docs/PLAN-v0.1.md) for how release work is broken into sub-PRs targeting a `v0.1.x`-style branch rather than `main` directly. If you're picking up a tracked task, check there first for the branch/PR-title convention in flight.
- Nobody pushes straight to `main` — everything goes through a PR.

## Design system

The whole app is monochrome (`docs/design.md`) — no color accents, ever. Use the token utility classes (`bg-bg`, `text-ink`, `border-line`, etc.); raw `gray-*`/color Tailwind classes are banned and will fail review.

## Music theory correctness

Transposition is degree-based and key-aware (`docs/domain-model.md` §4) — never do naive `+n`-semitone string math on chord names. If you're touching `src/lib/theory/` or `src/lib/chart/`, read that doc first.

## Site adapters

The grab flow's parser registry (`src/lib/grab/`) is designed for community contributions — a new site adapter is just a parsing-rules module plus tests, registered by domain. See the existing pnwchords adapter for the shape. Please keep any chart fixtures used in tests either public-domain (e.g. hymns) or your own invented lyrics — **never paste real, copyrighted worship-song lyrics into the repo**, in fixtures or otherwise. See [`docs/licensing-and-content.md`](docs/licensing-and-content.md) for why: the app ships zero song content, and that includes test fixtures.

## Licensing

MIT-licensed (see [`LICENSE`](LICENSE)). By contributing, you agree your contribution is licensed under the same terms.
