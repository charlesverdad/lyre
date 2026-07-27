/**
 * Chord-over-lyric row splitting (task B3, mvp-spec.md F3).
 *
 * A `Line` stores chords at exact character indices into its lyric string
 * (`src/lib/theory/types.ts`). Naively rendering a "chord row" and "lyric
 * row" as two independently-flowed text blocks only stays aligned if both
 * rows use the same monospaced character width — which lyrics don't, at any
 * font scale, once they're set in a proportional face.
 *
 * The fix: don't align via character position at all. Split the lyric text
 * *at* each chord's index into fragments, one per chord (plus a leading
 * fragment if the first chord isn't at index 0). Each fragment pairs a chord
 * with the lyric text that immediately follows it. The caller then renders
 * each fragment as its own column (chord stacked above its lyric text) —
 * the browser's own layout keeps the chord glued to the start of its lyric
 * fragment regardless of font, weight, or size, so alignment survives any
 * font-scale change for free.
 */

export interface ChordFragment {
	/** Rendered chord text for this fragment, or `undefined` for a chordless leading fragment. */
	chordText?: string;
	/** The lyric text that follows this chord (up to the next chord, or line end). */
	lyricText: string;
}

/** The subset of `Line` (`$lib/theory/types`) this module needs, generic over the chord type. */
export interface ChordLineInput<TChord> {
	lyrics: string;
	chords: { chord: TChord; index: number }[];
}

/**
 * Split a `Line` into chord/lyric fragments, given a chord renderer (the
 * caller supplies this — usually `renderChord` from `$lib/theory/chords` —
 * so this module stays free of theory/key concerns and is trivially
 * testable with plain strings).
 */
export function splitChordLine<TChord>(
	line: ChordLineInput<TChord>,
	renderChordText: (chord: TChord) => string
): ChordFragment[] {
	if (line.chords.length === 0) {
		return [{ lyricText: line.lyrics }];
	}

	const sorted = [...line.chords].sort((a, b) => a.index - b.index);
	const fragments: ChordFragment[] = [];

	const firstIndex = Math.max(0, Math.min(sorted[0].index, line.lyrics.length));
	if (firstIndex > 0) {
		fragments.push({ lyricText: line.lyrics.slice(0, firstIndex) });
	}

	for (let i = 0; i < sorted.length; i++) {
		const start = Math.max(0, Math.min(sorted[i].index, line.lyrics.length));
		const end =
			i + 1 < sorted.length
				? Math.max(start, Math.min(sorted[i + 1].index, line.lyrics.length))
				: line.lyrics.length;
		fragments.push({
			chordText: renderChordText(sorted[i].chord),
			lyricText: line.lyrics.slice(start, end)
		});
	}

	return fragments;
}
