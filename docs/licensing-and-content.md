# Licensing & Content

Competing with Ultimate Guitar means confronting the thing UG's whole business is built on: **lyrics and chord charts of modern worship songs are copyrighted works.** Most of the worship catalog (Bethel, Hillsong, Elevation, Maverick City, Getty…) is actively administered. This doc sets the policy so Lyre never has to retrofit legality.

## The legal landscape, briefly

- **Lyrics** are unambiguously protected. Reproducing or distributing them (including in an app) requires a license.
- **Chord progressions** by themselves are generally not protectable, but a *chord chart* that includes lyrics is a derivative of the lyrics.
- **Personal use**: an individual typing up a chart for their own private use is the classic low-risk zone (and in practice how every musician's binder works). The line is crossed at *distribution* — hosting charts for others, sharing libraries, shipping a pre-filled catalog.
- **CCLI** (Christian Copyright Licensing International) is the worship world's clearing house. **SongSelect** is their licensed lyrics/chords service with an API program; churches and many individuals already hold subscriptions. This is the legitimate path to in-app catalog search.

## Lyre's content policy

1. **The app ships zero content.** The library starts empty; users grab or enter charts into their own private libraries. Lyre is a *tool* (a browser/renderer/organizer) — it never hosts, seeds, or redistributes song content.
2. **Grab = personal bookmarking, not scraping.** The grab flow is a user-initiated fetch of one page the user is looking at, saved into that user's private library with attribution and a link back — functionally what worship musicians already do with copy-paste and print, and squarely within the posture the source sites themselves declare (pnwchords: *"All music and lyrics belong to original owners. Only for personal worship and educational use."*). What Lyre will **not** do: bulk crawling, mirroring a site's catalog, re-hosting grabbed charts, or making one user's grabbed content publicly visible. If a fetch relay is ever needed for CORS (see MVP spec), it must be stateless and cache nothing.
3. **Respect the source sites as partners.** Rate-gentle, honest user-agent, honor robots.txt and takedown requests, adapters removed on a site owner's ask. Being open source and worship-focused, Lyre should be a client these sites *like* — driving them traffic via always-present source links — and reaching out to site owners (starting with pnwchords) early is on the roadmap, before any in-app search of their catalog.
4. **Ultimate Guitar is different.** UG's ToS and commercial licensing make it a poor grab target; no UG adapter ships in the official repo. The paste flow remains for whatever text a user brings themselves.
5. **Set sharing relays references, not lyrics.** A shared set bundle carries source URLs, patterns, and edit overlays; each recipient's app fetches content from the source itself. The leader's edits (a diff against the grabbed original) travel with the bundle — sharing your arrangement notes is not republishing the song.
6. **Licensed catalog later, the right way**: integrate CCLI SongSelect (Phase 4) where the *user's own subscription* authorizes fetching official charts. Investigate the SongSelect API partner program before building; terms and availability must be verified at that time, not assumed.
7. **Public domain is first-class**: hymns are a rich PD sub-catalog that can be shared freely, lyrics included — mark PD status on songs so sharing rules can relax where the law does.
8. **Store attribution**: song metadata includes authors, copyright line, CCLI number, and source URL from day one, so any future reporting or licensing integration has the data it needs.

## Practical upside

This policy isn't just defensive. The free worship chord web (pnwchords and friends) and the CCLI ecosystem are both better allies than targets: "an open-source player for the chord sites you already use, that also plugs into the SongSelect subscription you already have — and plays every chart *your* way" is a stronger pitch than "another site with ads and scraped tabs," and it's a moat UG can't copy without abandoning their model.
