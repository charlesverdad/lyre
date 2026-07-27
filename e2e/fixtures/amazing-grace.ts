/**
 * Public-domain fixture chart for e2e tests (task C2: "public-domain lyrics
 * only, ever" — docs/licensing-and-content.md). "Amazing Grace" (John
 * Newton, 1779) is in the public domain worldwide.
 *
 * Header line matches the pnwchords convention parsed by
 * `src/lib/chart/header.ts` ("Original in Ab. Capo 1, play in G.") — see
 * `src/lib/addedit/parseState.test.ts`'s `HEADER_CHART` fixture, which this
 * mirrors: sounding key Ab, shape key G, capo 1.
 */
export const AMAZING_GRACE_TITLE = 'Amazing Grace';
export const AMAZING_GRACE_AUTHOR = 'John Newton';

export const AMAZING_GRACE_CHART = `Original in Ab. Capo 1, play in G.

Verse 1
             G
Amazing grace, how sweet the sound
           C          G
That saved a wretch like me
              G                 D
I once was lost, but now am found
           G          D      G
Was blind, but now I see`;
