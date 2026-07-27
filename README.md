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

## The core idea in one example

You play **"Goodness of God"** with **G shapes, capo 2**. That means it *sounds* in **A**, but your hands are playing G, C, D, Em. Lyre stores all three facts — sounding key, shape key, capo — as your **pattern** for that song, and renders the chart exactly that way every time you open it. Change any one of the three and the other two recompute.

Sites like pnwchords already speak this language — their charts open with lines like *"Original in Ab. Capo 1, play in G."* Lyre parses that on grab and turns it into your starting pattern automatically.
