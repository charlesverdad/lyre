# MVP Spec (v0.1)

The MVP is the smallest thing the owner can actually worship with: **save songs, open one, see lyrics + chords rendered in my pattern, transpose on the fly.** Everything else (playlists, topics, similarity, sync, licensed catalogs) is [roadmap](roadmap.md).

## Scope statement

> As a guitarist, I can grab a chord chart from a site like pnwchords.com (or paste one), save my preferred key/shape/capo pattern, and read the chart hands-free on my phone while playing, transposing instantly when needed. Fully offline after grab. No account required.

## Platform recommendation

**Local-first PWA (installable web app), tablet/phone-first layout.** Rationale:

- The primary play surface is a phone or tablet on a music stand; a PWA covers iOS/Android/desktop with one codebase and installs to the home screen.
- Local-first (IndexedDB/SQLite-wasm) satisfies the offline principle with no backend to build, run, or secure for v0.1 — and no accounts.
- Wake-lock, full-screen, and font scaling are all available to PWAs.

(If native affordances become blocking — reliable wake-lock on older iOS, cross-origin fetching for the grab flow (see F2's CORS note), or a proper share-sheet target — wrap in Capacitor. Verify current stable framework versions at implementation time; do not pick from memory.)

**Open source from day one**: public repo, permissive license, site adapters designed as community contributions.

## Features

### F1 — Library

- List of saved songs: title, artist/author, preferred pattern summary (`G shapes · capo 2 · A`).
- Instant client-side search over title/author/lyrics (this is *library* search; catalog search of external sources is roadmap).
- Sort: recently played, recently added, alphabetical.
- Add / edit / delete song (delete confirms and cascades).

### F2 — Add a song: grab, or paste

- **Grab flow (primary):** paste a song URL — or share the page to Lyre from the browser (PWA share-target / native share sheet) → Lyre fetches the page, extracts the chart text, parses the "chords above lyrics" body and the key/capo header (*"Original in Ab. Capo 1, play in G"* → source key + initial pattern, per [domain model §3](domain-model.md)) → preview → save with `sourceUrl` attribution and the raw text preserved.
  - **Site adapters**: a small parser registry keyed by domain. v0.1 ships the pnwchords adapter + a generic "best effort" extractor for other chords-above-lyrics pages. Adapters are just parsing rules in the open-source repo — contributors add sites via PR.
  - Grabs are user-initiated, one page per action, with a clear failure path into the paste flow.
- **Paste flow (fallback):** paste ChordPro or plain chart text → same preview → save. A bare URL pasted into the paste box (nothing else on the line) is treated as a grab automatically, same as typing it into the "Grab from URL" field. A noisy select-all/copy off a chord-site page (nav/search/footer chrome around the chart) is run through chart-region extraction (`src/lib/chart/extractRegion.ts`) before parsing, so the preview shows just the chart; a "Trimmed page noise" hint marks when this happened.
- **PWA share target** (Android; iOS has no web share-target API — roadmap: Capacitor native share extension): installed Lyre registers as a share target (`static/manifest.webmanifest`'s `share_target`), so sharing a chord-site page from the browser's share sheet lands on `/share`, which hands the shared URL (or text) straight into the grab/paste flow above.
- Metadata: title (required), authors, original key (required — inferred, editable), tempo, CCLI# (optional). Grab prefills all it can from the page.
- Built-in editor with monospaced editing view and rendered preview toggle. Chord tokens are validated live; unknown tokens are highlighted but never block saving. Edits are an overlay — "view original" and "revert to grabbed text" always available.

> **Implementation note (CORS):** a pure PWA cannot fetch arbitrary cross-origin pages from the client. Options, in preference order: (a) wrap in Capacitor and use native HTTP (no CORS restriction) — likely the endgame anyway for wake-lock reliability; (b) a tiny stateless open-source fetch relay (fetches on the user's behalf, streams back, caches nothing); (c) paste flow as universal fallback. Decide at implementation time; the relay, if built, must store nothing (licensing posture depends on it).

### F3 — Chart view (play mode) — *the* screen

- Renders lyrics with chords above, in the song's **preferred pattern** by default.
- Header badge: `Capo 2 · G shapes · sounds in A`. Always visible, one tap to open the transpose sheet.
- **Transpose sheet** (per [domain model §1](domain-model.md)):
  - Sounding-key stepper (±1 semitone) with shape/capo suggestions ranked by comfort.
  - Shape picker (C, D, E, G, A, + full chromatic list) — recomputes capo, keeps sounding key.
  - Capo stepper — recomputes shapes, keeps sounding key.
  - "Save as my pattern" / "Just for now" — casual transposes don't silently overwrite the saved pattern.
- Readability: large type with pinch/±, high-contrast theme, dark mode, chords visually distinct from lyrics, section labels styled.
- Screen wake-lock while the chart is open.
- Works fully offline.
- Chord-only view toggle (hide lyrics) and lyrics-only toggle (hide chords, for singing).

### F4 — Pattern persistence

- Per song: one preferred pattern + unlimited named alternates ("With Sarah — G, no capo").
- Per user: comfortable-shape preference order (default G > C > D > A > E) used for suggestion ranking.

### F5 — Data safety

- One-tap **export of the whole library** to a zip of ChordPro files + a JSON manifest (songs/patterns). Import of the same. This is the backup story until sync exists, and the anti-lock-in guarantee.

## Explicitly out of MVP

Collections/playlists, set sharing with team members, topics/similarity grouping, in-app catalog search (grab requires the user to find the song in their browser first), multi-device sync, accounts, autoscroll, metronome, chord diagrams (fingering charts), Nashville-number display mode. All tracked in the [roadmap](roadmap.md) — the data model already accommodates them.

## Acceptance walkthrough

1. Open Lyre for the first time → empty library with an "Add your first song" prompt.
2. Share the pnwchords "The Goodness of God" URL to Lyre → preview shows the parsed chart with `Capo 1 · G shapes · sounds in A♭` (from the page's own header) → save.
3. Open it → bump capo to 2 → badge reads `Capo 2 · G shapes · sounds in A` → tap "Save as my pattern".
4. Kill the app, turn on airplane mode, reopen → song opens instantly in G shapes / capo 2.
5. Tap key-down twice → suggestion `G shapes · capo 0` → "Just for now" → chart unchanged in shapes, badge reads `No capo · sounds in G`; reopening the song later shows capo 2 again.
6. Export library → re-import on a second device/browser → identical library.
