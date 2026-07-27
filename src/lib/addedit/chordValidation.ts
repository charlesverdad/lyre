/**
 * Unknown-chord detection for the add/edit editor preview (mvp-spec.md F2:
 * "Chord tokens are validated live: unknown/unparseable chord tokens get
 * highlighted... but never block saving").
 *
 * A `Chord` from `src/lib/chart` carries `raw` set instead of a resolved
 * `degree`/`quality` whenever `parseChordToken` couldn't interpret it
 * (`src/lib/theory/chords.ts`) — that's the signal we surface here.
 */

import type { Chord, ChartDoc } from '$lib/theory/types';

/** True when a chord is an unparseable passthrough token. */
export function isUnknownChord(chord: Chord): boolean {
	return chord.raw !== undefined;
}

/** Every distinct unparseable chord token appearing anywhere in `doc`, in first-seen order. */
export function unknownChordTokens(doc: ChartDoc): string[] {
	const seen = new Set<string>();
	for (const section of doc.sections) {
		for (const line of section.lines) {
			for (const { chord } of line.chords) {
				if (isUnknownChord(chord) && chord.raw !== undefined) seen.add(chord.raw);
			}
		}
	}
	return [...seen];
}

/** Total count of chart lines that failed to parse into a `ChartDoc` (mvp-spec.md F2 empty state). */
export function hasParsedContent(doc: ChartDoc): boolean {
	return doc.sections.length > 0;
}
