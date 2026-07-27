# Lyre

An **open-source**, mobile-first praise & worship songbook for guitarists. Grab chord charts from free worship sites like [pnwchords.com](https://pnwchords.com), store *how you play them* (key, capo, chord shapes), and read clean lyrics + chords on a phone while you play — with real transpose.

Think of it as a beautiful, capo-aware **player skinned over the free worship chord web** — and later, a worship leader's tool: edit charts, build collections, share the set with your team. No ads. Ever.

## Docs

| Doc | What it covers |
|---|---|
| [Product vision](docs/product-vision.md) | Who it's for, why it exists, principles, non-goals |
| [Domain model](docs/domain-model.md) | Songs, keys, capo/shape math, transposition — the core concepts |
| [MVP spec](docs/mvp-spec.md) | What v0.1 does, screen by screen |
| [Roadmap](docs/roadmap.md) | Playlists, topics, similarity grouping, sync — the deferred features |
| [Licensing & content](docs/licensing-and-content.md) | Copyright reality of lyrics/chords, CCLI, how we stay clean |

## Try it

**[charlesverdad.github.io/lyre](https://charlesverdad.github.io/lyre/)** — the live app, deployed automatically on every merge to `main`. It's a local-first PWA: everything you save lives in your browser (IndexedDB), nothing is uploaded anywhere, and it works fully offline once loaded. Install it to your home screen for the full experience.

## What v0.1 does

- **Library** — search your saved songs by title, author, or lyrics; sort by recently played, recently added, or A–Z; delete with confirmation.
- **Add a song** — grab a chart from a URL (pnwchords.com today, a "best effort" generic extractor for other chords-above-lyrics sites, or paste one in as a fallback) and it works out the source key, capo, and shape from headers like *"Original in Ab. Capo 1, play in G."* You can also just paste ChordPro or plain chords-above-lyrics text.
- **Play mode** — lyrics with chords rendered above them in your saved pattern, a tap-to-open transpose sheet (step the sounding key, pick a shape, or set the capo directly — each recomputes the other two), font scaling, chords-only/lyrics-only toggles, and a screen wake lock so it doesn't sleep on the music stand.
- **Patterns** — every song remembers *your* preferred key/shape/capo combination. Casual transposes ("Just for now") never overwrite it; "Save as my pattern" does.
- **Data safety** — one-tap export of your whole library to a `.zip` (ChordPro files + a JSON manifest), importable back in — the backup story and anti-lock-in guarantee until sync exists.
- **Offline-first** — a service worker caches the app shell and your library so it keeps working with no connection.

Playlists, team set-sharing, multi-device sync, and licensed catalog search are on the [roadmap](docs/roadmap.md), not in v0.1.

## No ads, ever

Lyre is open source (MIT) and ships zero song content — your library is yours, stored on your device. See [licensing & content](docs/licensing-and-content.md) for how grabbing charts stays on the right side of copyright.

## Dev quickstart

```sh
git clone https://github.com/charlesverdad/lyre.git
cd lyre
```

You need Node ≥24, pnpm, and [`just`](https://just.systems). Either:

- **Nix**: `nix-shell` (or let direnv's `use nix` load it) — provides all three.
- **Manual**: install [Node 24+](https://nodejs.org), `corepack enable` (ships pnpm), and `just` yourself.

Then:

```sh
just install dev    # install deps, start the dev server
```

Before opening a PR, the full gate must pass locally:

```sh
just verify          # lint + format check + typecheck + unit tests
just e2e              # Playwright acceptance walkthrough (builds first)
```

See [AGENTS.md](AGENTS.md) for the full contributor workflow, or [CONTRIBUTING.md](CONTRIBUTING.md) for a shorter version.

## The core idea in one example

You play **"Goodness of God"** with **G shapes, capo 2**. That means it *sounds* in **A**, but your hands are playing G, C, D, Em. Lyre stores all three facts — sounding key, shape key, capo — as your **pattern** for that song, and renders the chart exactly that way every time you open it. Change any one of the three and the other two recompute.

Sites like pnwchords already speak this language — their charts open with lines like *"Original in Ab. Capo 1, play in G."* Lyre parses that on grab and turns it into your starting pattern automatically.
