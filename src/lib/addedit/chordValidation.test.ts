import { describe, expect, it } from 'vitest';
import { parseChart } from '$lib/chart';
import { hasParsedContent, isUnknownChord, unknownChordTokens } from './chordValidation';

describe('isUnknownChord', () => {
	it('is true for chords carrying a raw passthrough token', () => {
		expect(isUnknownChord({ degree: 0, quality: '', raw: 'Xyz' })).toBe(true);
	});

	it('is false for resolved chords', () => {
		expect(isUnknownChord({ degree: 0, quality: '' })).toBe(false);
	});
});

describe('unknownChordTokens', () => {
	it('collects distinct unparseable tokens from a parsed chart', () => {
		// 4/5 tokens must parse as chords to count as a chord line (isChordLine's
		// 80% heuristic, src/lib/chart/plaintext.ts) — Xyz rides along as the
		// unparseable one.
		const { doc } = parseChart('G     C     D     Em    Xyz\nSome lyrics for this line here');
		expect(unknownChordTokens(doc)).toEqual(['Xyz']);
	});

	it('is empty for a chart with only recognized chords', () => {
		const { doc } = parseChart('G       C\nSome lyrics    more lyrics');
		expect(unknownChordTokens(doc)).toEqual([]);
	});
});

describe('hasParsedContent', () => {
	it('is false when nothing chord/lyric-shaped was found', () => {
		const { doc } = parseChart('   \n\n  ');
		expect(hasParsedContent(doc)).toBe(false);
	});

	it('is true once at least one section was parsed', () => {
		const { doc } = parseChart('Verse 1\nG       C\nSome lyrics    more lyrics');
		expect(hasParsedContent(doc)).toBe(true);
	});
});
