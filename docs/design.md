# Design Language — Mono

Instagram-like monochrome aesthetic: content is the only color on the page. Calm, editorial, zero visual noise — right for a devotional tool.

## Palette (grayscale only)

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#ffffff` | `#000000` | page background |
| `surface` | `#fafafa` | `#121212` | cards, sheets |
| `ink` | `#0a0a0a` | `#f5f5f5` | primary text, chords |
| `ink-2` | `#737373` | `#a3a3a3` | secondary text, metadata |
| `ink-3` | `#a3a3a3` | `#737373` | placeholders, disabled |
| `line` | `#e5e5e5` | `#262626` | hairline dividers (1px) |

No accent color. Primary actions are solid ink-on-bg inversions (black button, white text; inverted in dark mode). Destructive actions use weight + confirmation copy, not red.

## Type

- UI: system sans stack (`-apple-system, "SF Pro", Segoe UI, Roboto, …`), sizes 13/15/17/22/28, weights 400/600/700. Emphasis via weight and size, never color.
- **Chords: bold (700) monospace** (`ui-monospace, "SF Mono", …`), full `ink`, slightly wider tracking (`0.02em`), sized ~0.95em of the adjacent lyric text — so chords align over lyrics but read visibly stronger at a glance. This is a monochrome app: chords are distinguished from lyrics by weight/size/tracking only, never hue. Lyrics stay regular (400) sans at full size and full `ink` (never dimmed) — they must remain maximally readable at music-stand distance. Generous line-height (1.6+) with a chord line gap tuned for glanceability.
- Play mode base size 17px, pinch/stepper scalable 14–28px, persisted per pattern.

## Layout & chrome

- Mobile-first, single column, max-width 640px centered on larger screens.
- Bottom tab bar (Library · Add · Settings), 1px top hairline, no shadows anywhere — hairlines only.
- Screens: large title on top (28/700), tight toolbars, list rows 56px with hairline separators, full-bleed edges (16px inset content).
- Sheets (transpose, confirmations) slide from bottom, rounded 16px top corners, drag handle, scrim `rgb(0 0 0 / 0.4)`.
- Icons: thin-stroke outline set (e.g. Lucide at 1.5px stroke), `ink` colored, never filled except active tab state.
- Motion: 150–200ms ease-out; no bouncy springs.

## Play-mode specifics

- Badge strip pinned under the title: `Capo 2 · G shapes · sounds in A` — tap opens transpose sheet.
- Dark mode is first-class (music stands in dim rooms): true black `#000` background for OLED.
- Section labels (`Verse 1`, `Chorus`) render as `ink-2` uppercase 13/600 with extra top spacing; chorus optionally hairline-indented.
- Nothing overlays the chart while playing. Controls collapse to a single translucent bottom bar that hides on scroll.

## Tailwind mapping

Define the six tokens as CSS custom properties under `@theme` (Tailwind 4), swap values via `prefers-color-scheme` + a manual `data-theme` override. Components use only token utilities (`bg-bg`, `text-ink-2`, `border-line`) — raw gray-* classes are banned by convention.
