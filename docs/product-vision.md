# Product Vision

## What is Lyre?

Lyre is a personal worship songbook app for guitarists. It answers one question well: *"I want to play this song right now — show me the lyrics and chords the way **I** play it."*

Ultimate Guitar has the content but is noisy: ads, upsells, tabs for every instrument, ratings, comments, and a transpose feature that doesn't understand the difference between "change the key" and "change the shapes I finger." Worship players have a specific workflow that UG doesn't serve:

- They play mostly **open-chord shapes** (G, C, D, E, A families) and use a **capo** to reach the congregation's or their vocal key.
- They return to the **same songs repeatedly** — a personal repertoire, not an infinite catalog.
- They play in a **flow context** (personal devotion, small group, worship set) where fumbling with an app mid-song is unacceptable.

## Positioning: a player over the free worship chord web

The closest existing thing is **[pnwchords.com](https://pnwchords.com)** — free, worship-only, community-maintained charts with the right spirit (its charts even open with pattern-style headers like *"Original in Ab. Capo 1, play in G"*, and its notice reads "only for personal worship and educational use"). What it lacks is the playing experience: desktop-era layout, no real transpose, no library, no memory of how *you* play a song.

Lyre's wedge is to be **the mobile player/skin on top of sites like pnwchords**, not a rival catalog:

- **Grab/bookmark**: paste (or share) a song URL → Lyre fetches the chart, parses the chords-above-lyrics text and the key/capo header, and files it in your library with full attribution and a link back to the source.
- The source site remains the canonical content home; Lyre adds rendering, transposition, patterns, collections, and offline play.
- **Open source** (see principles) — the same posture as the free chord-sharing community it builds on, and the reason sites like pnwchords should see Lyre as a friendly client rather than a scraper-competitor.

## Who it's for

**Primary persona (v0.1): the owner-player.** A guitarist who plays for personal praise and worship. Grabs charts from the sites they already use, builds a private library, saves per-song playing patterns, opens the app on a phone/tablet on a music stand, and plays.

**Second persona (committed, phase 2): the worship leader.** Edits grabbed charts to match how the team actually plays them (cut verse 3, fix a chord, add flow notes), organizes songs into **collections** (Sunday set, Christmas, quiet-time rotation), and **shares a set with team members**, who open every song in the shared keys on their own phones.

**Later personas:** full church teams (shared libraries, roles, CCLI reporting). Out of scope for now but the data model leaves room.

## Product principles

1. **No ads, no dark patterns — ever.** This is a devotional tool. Nothing interrupts playing. If it ever needs revenue, it's a straightforward paid product/subscription, never attention monetization.
2. **The pattern is the product.** Everyone can find chords for "Goodness of God." Only Lyre remembers that *you* play it G-shapes-capo-2, and renders it that way by default, forever.
3. **Play mode is sacred.** The chart view must be readable at music-stand distance, never sleep the screen, never pop anything over the lyrics, and work offline.
4. **Own your data, local-first.** The library lives on the device and remains fully usable with no network. Sync (when it comes) is a convenience layer, not a dependency.
5. **Music theory is handled correctly or not at all.** Transposition respects enharmonics (F♯ vs G♭), key signatures, and the capo/shape distinction. A worship app that renders `A#` in the key of B♭ is not trustworthy.
6. **Open source.** The app is free software (permissive license, e.g. MIT/Apache-2.0). It builds on a community that shares charts freely for worship; the client should be shared in the same spirit. Open source is also the trust argument for the no-ads promise and the anti-lock-in guarantee.
7. **Guest of the sites we grab from.** Fetches are user-initiated, rate-gentle, attributed, and link back. Lyre never re-hosts or republishes grabbed content — a grabbed chart lives only in the user's own library.

## Non-goals

- Not a public tab-sharing platform or social network (no comments, ratings, follower counts).
- Not a full notation/tab editor — chord charts (lyrics + chord symbols), not tablature or sheet music.
- Not a content catalog we host. Users grab or enter charts into their own private libraries (see [licensing](licensing-and-content.md)); Lyre never republishes them. A licensed catalog integration (CCLI SongSelect) may come later.
- Not a DAW/practice suite — no recording, no metronome-first design (a simple metronome/autoscroll may come later as a play-mode aid).

## Why "no ads" is a feature, not just a preference

Competing with Ultimate Guitar head-on across all genres is a content-licensing war. Competing for the worship niche is winnable on **experience**: worship players are a tight community, the repertoire is comparatively small (a few thousand songs cover the vast majority of sets), and the tolerance for ads inside a devotional practice is near zero. The wedge is: best-in-class capo-aware transposition + a personal repertoire that opens instantly to *your* arrangement.
