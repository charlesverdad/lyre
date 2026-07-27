# Domain Model

The heart of Lyre is getting the relationship between **sounding key**, **chord shapes**, and **capo** exactly right. This doc defines the concepts, the math, and the data model.

## 1. The three-part pattern

When a guitarist says *"I play Goodness of God with G shapes, capo 2"*, three facts are in play:

| Concept | Meaning | Example |
|---|---|---|
| **Sounding key** | The actual pitch the audience hears; what a singer or pianist would name | A |
| **Shape key** | The chord family the hands finger (as if no capo) | G |
| **Capo** | Fret the capo sits on | 2 |

They are bound by one equation (all arithmetic mod 12 semitones):

```
soundingKey = shapeKey + capo
```

G (7) + 2 = 9 = A. ✅

A **Pattern** is the stored triple `{soundingKey, shapeKey, capo}`. Given any two, the third is derived. Lyre stores one *preferred pattern per song per user*, and any number of alternates (e.g., "when I sing with Sarah we do it in G: G shapes, capo 0").

### The two distinct transpose operations

This is where Ultimate Guitar-style transpose confuses people, and where Lyre must be precise. There are two different user intents:

1. **"Change the key"** (the song should *sound* different — e.g., the singer needs it lower).
   → `soundingKey` changes. Lyre then suggests shape/capo combos that produce the new key, ranked by playability (see §4).

2. **"Change how I play it"** (same sounding key, different hands — e.g., "I'd rather play C shapes than E shapes").
   → `soundingKey` is fixed; user picks a new `shapeKey`; `capo` recomputes. If the required capo would be negative or absurdly high (> 9 by default), that shape is shown as unavailable.

The UI must never present a single "transpose ±" control without saying which of these it does. Default chart controls:

- **Key stepper** (sounding key ± semitone) → intent 1.
- **Shape picker** (choose from C, D, E, G, A families…) → intent 2.
- **Capo stepper** → moves capo and shifts *shape* in the opposite direction, keeping sounding key constant (the most common live adjustment: "capo's buzzing on 7, let me go capo 4 with different shapes").

## 2. Songs vs. Charts vs. Patterns

- **Song** — the musical work. Title, authors, CCLI number (optional), default/original key, tempo, meter, tags/topics. One per real-world song.
- **Chart** — a chord-over-lyrics document for that song, stored in a *shape-key-neutral* internal form (see §3). A song usually has one chart, but may have several (acoustic vs. full arrangement, different sources). A chart remembers where it came from: `sourceUrl`, `sourceSite`, `fetchedAt`, plus the raw grabbed text so the user's edits are an overlay on a preserved original (re-fetch and diff later).
- **Pattern** — the user's playing configuration for a chart: `{soundingKey, shapeKey, capo}` plus display prefs (font size, autoscroll speed). One is marked preferred.

```
Song 1──* Chart 1──* Pattern (one flagged preferred)
```

Keeping the chart key-neutral means transposition is pure rendering — the stored document never mutates when the user flips keys.

## 3. Chart format: ChordPro

Charts are stored in [ChordPro](https://www.chordpro.org/) format — the de-facto standard, human-editable, and importable from many tools:

```
{title: Goodness of God}
{key: A}          # original sounding key of this chart as entered

[G]I love You, [C]Lord
For Your mercy [G]never fails me
```

Rules:

- The chords written in the file are interpreted **in the chart's stated key** (`{key:}` directive). Internally each chord is normalized to a key-relative degree (effectively Nashville numbers: the above is `1 / 4 / 1`), so rendering in any shape key is a lookup, not string surgery.
- On paste/grab, Lyre also accepts the common "chords on the line above lyrics" plain-text format (what pnwchords and most chord sites use) and converts it to ChordPro.
- **Pattern headers are parsed on grab.** pnwchords charts open with lines like *"Original in Ab. Capo 1, play in G."* — that is a complete Lyre pattern: sounding key A♭, shape key G, capo 1. The grabber extracts it (and plain `Key: X` / `Capo: n` variants) to prefill both the chart's source key and the user's initial pattern.
- Supported chord vocabulary: root (A–G with ♯/♭), quality (maj, m, dim, aug, sus2, sus4, 2, 5, 6, 7, maj7, m7, 9, add9, 11, 13…), slash bass (`G/B`), and no-chord (`N.C.`). Unrecognized chords pass through verbatim rather than breaking the chart.
- Section directives (`{soc}/{eoc}` chorus, `{sov}` verse, labels like `Verse 1`, `Bridge`) are recognized for styling and future navigation ("jump to bridge").

## 4. Transposition & spelling rules

Naive transpose (+n to every root, always sharp) produces garbage like `A#m` in F minor. Lyre's rules:

1. **Degree-preserving transpose.** Because chords are stored as scale degrees relative to the chart key, rendering in shape key K means mapping degrees through K's diatonic spelling. `1-4-5-6m` in G renders as `G C D Em`; in F as `F B♭ C Dm` (never `A#`).
2. **Key spelling table.** Each of the 12 sounding pitches has a canonical major-key spelling (D♭ not C♯, F♯ not G♭ for shape keys, etc.), with user override per song for edge cases.
3. **Chromatic (non-diatonic) chords** keep their interval quality and are spelled per the key's accidental preference (flat keys spell flat, sharp keys sharp).
4. **Slash chords** transpose both root and bass.

### Shape ranking (for "change the key" suggestions)

When the user picks a new sounding key, Lyre ranks candidate `(shapeKey, capo)` pairs:

1. Prefer the **open-friendly shape families**, roughly in order: G, C, D, A, E (configurable per user — this is a personal-comfort setting, the whole point of the app).
2. Prefer **lower capo positions** (0–5 ideal, 6–7 acceptable, 8+ last resort).
3. If the user has a saved alternate pattern in that key, it wins outright.

Example: target sounding key **B** → suggestions: `A shapes capo 2`, `G shapes capo 4`, `E shapes capo 7`, …

## 5. Data model sketch

```
Song      { id, title, aliases[], authors[], ccliNumber?, copyright?,
            defaultKey, tempoBpm?, timeSignature?, topics[], createdAt, updatedAt }

Chart     { id, songId, name ("Default"), chordproSource, sourceKey,
            sourceUrl?, sourceSite?, fetchedAt?, rawGrabbedText?,
            sourceAttribution?, createdAt, updatedAt }

Pattern   { id, chartId, label ("My usual"), soundingKey, shapeKey, capo,
            isPreferred, fontScale?, autoscrollSpeed? }

Collection { id, name, description?, songIds[] (ordered),
             perSongOverrides { songId → pattern } }             # phase 1
SetShare   — exported bundle of a collection: song refs (sourceUrl or
             CCLI#/title) + patterns + the leader's edit overlays # phase 2
Topic      — free-form tags on Song, curated vocabulary later    # roadmap
```

Invariants:

- `Pattern`: `(shapeKey + capo) mod 12 == soundingKey`; `0 ≤ capo ≤ 11`.
- Exactly one preferred pattern per chart.
- Deleting a song cascades to charts and patterns; collections hold references and tolerate (flag) missing songs.

## 6. Worked example: Goodness of God

1. User shares the pnwchords URL into Lyre. The grabber pulls the chart, sees *"Original in Ab. Capo 1, play in G"*, and stores `Chart{sourceKey: A♭, sourceUrl: …}` with chords normalized to degrees, plus an initial `Pattern{A♭, G, 1}`.
2. The user prefers it a half-step up: bumps capo to **2** (shapes stay G) → sounding key recomputes to **A** → "Save as my pattern" → `Pattern{A, G, 2, preferred}`.
3. Opening the song renders G-family chords with a "Capo 2 · sounds in A" badge.
4. One day the user's voice is tired: taps key-down twice → target sounding key **G**. Lyre suggests `G shapes, capo 0` first. Their fingers change nothing except removing the capo.
