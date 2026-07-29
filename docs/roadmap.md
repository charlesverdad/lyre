# Roadmap

Post-MVP features in rough order. Each phase should ship independently useful.

## Phase 1 — Organize (collections & topics)

- **Collections** ✅ shipped v0.3: ordered, named groups ("Sunday morning", "Quiet time", "Christmas"). A song can be in many collections; add/remove/reorder (move up/down) from the collection screen, delete a collection without touching its songs. **Not yet shipped**: collection *play mode* (swipe/next-button between songs, each opening in its preferred pattern) — today, opening a song from a collection just goes to the normal song screen.
- **Topics/tags**: free-form tags on songs (surrender, gratitude, communion, Advent…). Filter the library by tag; a topic is effectively a smart collection. Not started.
- **Setlist niceties**: per-collection pattern overrides (the same song may sit in a different key inside a flow to match the surrounding songs), simple flow notes between songs ("pray here", "repeat bridge 2x"). `CollectionItem` already has an optional `note` field reserved for this ([domain model §5](domain-model.md)), but nothing in the UI reads or writes it yet — not started.
- **Grab improvements**: more site adapters (community PRs), re-fetch & diff against source, duplicate detection on grab (same URL/CCLI#/title). Not started.

## Phase 2 — Lead & share (the worship-leader release)

- **Edit for the team**: the leader's edit overlay (cut verse 3, fixed chords, flow notes) is a first-class object on top of the grabbed original.
- **Share a set**: export a collection as a **set bundle** — song references (source URLs and/or CCLI#/title), the leader's chosen pattern per song, and edit overlays. Delivered as a link or file (works over WhatsApp/Signal/email; no accounts required).
- **Receiving a set**: a member opens the bundle → their Lyre re-grabs each song from its source URL (or matches songs already in their library), applies the leader's patterns/edits, and saves it as a collection. Content flows source-site → each member's device; Lyre relays references, not lyrics (see [licensing](licensing-and-content.md)).
- **Member-side re-patterning**: a member can view the set in the leader's sounding keys but with their *own* shape/capo choices — same sounding key, different hands. The pattern model handles this natively.

## Phase 3 — Play-mode aids

- **Autoscroll** with per-song speed saved on the pattern; tap to pause.
- **Chord diagrams** on tap (shape-aware: tapping `G/B` in capo-2 mode shows the G/B open fingering).
- **Nashville numbers display mode** — render degrees instead of letter chords; worship players increasingly read numbers, and Lyre already stores charts as degrees internally, so this is nearly free.
- **Section navigation**: jump-to-chorus/bridge chips; "flow arrows" (V1 → C → V2 → C → B → C).
- Foot-pedal / volume-button page turning.

## Phase 4 — Search & content

- **In-app catalog search**: find a song without leaving Lyre. Two routes, both legitimate: search free sites that welcome it (e.g., querying pnwchords' own site search on the user's behalf — talk to the site owner first; being open source and attribution-friendly is the door-opener), and/or integrate **CCLI SongSelect** (see [licensing](licensing-and-content.md)) where users authenticate with their own subscription and Lyre fetches the official chart.
- **Smart paste improvements**: better plain-text parsers (Ultimate Guitar copy format, OnSong, OpenSong, Planning Center exports).

## Phase 5 — Similarity & discovery (the "group them together" idea)

- **Grouping by musical compatibility**: songs that flow well together — same/related sounding key (or a comfortable capo pivot away), similar tempo. "What in my library can follow this song without a jarring key change?" is a genuinely useful worship-flow question no mainstream app answers.
- **Topic auto-suggestion** from lyrics (local or LLM-assisted, opt-in).
- **Similarity browsing**: "songs like this" by theme + key + tempo within *your* library.

## Phase 6 — Sync & teams

- **Multi-device sync**, still local-first (CRDT or simple last-write-wins per record; library sizes are tiny). Requires accounts — keep optional; set bundles (Phase 2) already cover the sharing use case without any server.
- **Team libraries** (church worship team): standing shared collections rather than one-off set bundles, roles (leader edits, members view), per-member patterns on the same song (the leader plays G-capo-2, the second guitarist plays E-capo-5 for voicing spread — same sounding key, different patterns; the domain model already supports this).

## Sustainability (the no-ads, open-source promise)

The app is open source and free for personal use, permanently. If costs ever appear (sync servers, a hosted fetch relay, SongSelect partnership), the model is a modest paid team/sync tier or donations — text data for a niche audience is cheap. Advertising is permanently off the table — it's in the product principles, and it should be in the README of the public repo.
