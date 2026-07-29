/**
 * Second public-domain fixture chart for e2e tests, alongside
 * `amazing-grace.ts` — task E4 needs two distinct songs for collections
 * coverage (add two, reorder). "Rock of Ages" (Augustus Toplady, 1763) is a
 * pre-1900 hymn, safely in the public domain worldwide (see
 * docs/licensing-and-content.md and `.claude/LEARNINGS.md`'s licensing-sweep
 * note on task E2).
 *
 * Simple "Key: X" header (no capo/shape statement) — deliberately a
 * different header shape than `amazing-grace.ts`'s pnwchords-style header,
 * so between the two fixtures both `header.ts` header formats get exercised
 * somewhere in the e2e suite.
 */
export const ROCK_OF_AGES_TITLE = 'Rock of Ages';
export const ROCK_OF_AGES_AUTHOR = 'Augustus Toplady';

export const ROCK_OF_AGES_CHART = `Key: A

Verse 1
        A                  D
Rock of ages, cleft for me
              A       E
Let me hide myself in thee
           A                D
Let the water and the blood
            A         E      A
From thy wounded side which flowed`;
