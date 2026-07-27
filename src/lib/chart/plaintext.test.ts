import { describe, expect, it } from 'vitest';
import {
	isChordLine,
	matchSectionLabel,
	normalizeLyricText,
	parsePlaintextChart
} from './plaintext';

describe('normalizeLyricText', () => {
	it('converts curly apostrophes and quotes to straight ones', () => {
		expect(normalizeLyricText('I’ve found it’s "great"')).toBe('I\'ve found it\'s "great"');
		expect(normalizeLyricText('“Amazing” grace')).toBe('"Amazing" grace');
	});

	it('converts non-breaking spaces to regular spaces', () => {
		expect(normalizeLyricText('word word')).toBe('word word');
	});
});

describe('isChordLine', () => {
	it('recognizes an all-chord line', () => {
		expect(isChordLine('G       C       D       Em')).toBe(true);
	});

	it('recognizes a chord line with slash chords', () => {
		expect(isChordLine('G   G/B   C   D/F#')).toBe(true);
	});

	it('tolerates up to 20% non-chord tokens (e.g. "x2" annotations)', () => {
		expect(isChordLine('G   C   D   Em   x2')).toBe(true);
	});

	it('rejects lyric lines', () => {
		expect(isChordLine('Amazing grace, how sweet the sound')).toBe(false);
	});

	it('rejects a blank line', () => {
		expect(isChordLine('')).toBe(false);
		expect(isChordLine('   ')).toBe(false);
	});

	it('rejects a line mostly non-chord tokens', () => {
		expect(isChordLine('Verse 1 starts here now G')).toBe(false);
	});
});

describe('matchSectionLabel', () => {
	it('matches common section keywords, case-insensitively', () => {
		expect(matchSectionLabel('Verse1')).toBe('Verse 1');
		expect(matchSectionLabel('Verse 2')).toBe('Verse 2');
		expect(matchSectionLabel('CHORUS')).toBe('Chorus');
		expect(matchSectionLabel('chorus:')).toBe('Chorus');
		expect(matchSectionLabel('Bridge')).toBe('Bridge');
		expect(matchSectionLabel('Pre-Chorus')).toBe('Pre-Chorus');
		expect(matchSectionLabel('Pre Chorus')).toBe('Pre-Chorus');
		expect(matchSectionLabel('PRECHORUS')).toBe('Pre-Chorus');
		expect(matchSectionLabel('Intro')).toBe('Intro');
		expect(matchSectionLabel('Outro')).toBe('Outro');
		expect(matchSectionLabel('Tag')).toBe('Tag');
		expect(matchSectionLabel('Interlude')).toBe('Interlude');
	});

	it('returns null for lyric lines', () => {
		expect(matchSectionLabel('Amazing grace, how sweet the sound')).toBeNull();
		expect(matchSectionLabel('G C D Em')).toBeNull();
	});
});

describe('parsePlaintextChart', () => {
	it('aligns chord columns to lyric character indices', () => {
		const doc = parsePlaintextChart(
			'             G\nAmazing grace, how sweet the sound\n           C          G\nThat saved a wretch like me',
			'G'
		);
		expect(doc.sourceKey).toBe('G');
		expect(doc.sections).toHaveLength(1);
		const [line1, line2] = doc.sections[0].lines;
		expect(line1.lyrics).toBe('Amazing grace, how sweet the sound');
		expect(line1.chords).toEqual([{ chord: { degree: 0, quality: '' }, index: 13 }]);
		expect(line2.lyrics).toBe('That saved a wretch like me');
		// C is degree 5 above G, second G is degree 0.
		expect(line2.chords).toEqual([
			{ chord: { degree: 5, quality: '' }, index: 11 },
			{ chord: { degree: 0, quality: '' }, index: 22 }
		]);
	});

	it('parses slash chords mid-line and reports the bass degree', () => {
		const doc = parsePlaintextChart('G   G/B   C\nlyric line here for alignment', 'G');
		const chords = doc.sections[0].lines[0].chords;
		// G = degree 0, G/B = degree 0 with bass degree 4 (B is 4 semitones above G), C = degree 5.
		expect(chords[0].chord).toEqual({ degree: 0, quality: '' });
		expect(chords[1].chord).toEqual({ degree: 0, quality: '', bassDegree: 4 });
		expect(chords[2].chord).toEqual({ degree: 5, quality: '' });
	});

	it('clamps chords past the end of the lyric line to append at the end', () => {
		const doc = parsePlaintextChart('D                        G\nhi', 'G');
		const chords = doc.sections[0].lines[0].chords;
		expect(chords[0].chord).toEqual({ degree: 7, quality: '' }); // D
		expect(chords[0].index).toBe(0);
		expect(chords[1].chord).toEqual({ degree: 0, quality: '' }); // G
		expect(chords[1].index).toBe(2); // clamped to lyric "hi" length
	});

	it('handles a chord-only line (no following lyric) as an instrumental line', () => {
		const doc = parsePlaintextChart('G   D   Em   C\n\nVerse1\nlyrics after a blank line', 'G');
		const first = doc.sections[0];
		expect(first.lines[0].lyrics).toBe('');
		expect(first.lines[0].chords).toHaveLength(4);
		expect(first.lines[0].chords[0].index).toBe(0);
	});

	it('handles a chord-only chart with no lyrics at all', () => {
		const doc = parsePlaintextChart('G   C   D\nEm   D   C', 'G');
		expect(doc.sections).toHaveLength(1);
		expect(doc.sections[0].lines).toHaveLength(2);
		expect(doc.sections[0].lines[0].lyrics).toBe('');
		expect(doc.sections[0].lines[1].lyrics).toBe('');
	});

	it('handles a lyric-only line with no chord line above it', () => {
		const doc = parsePlaintextChart('Just a spoken line, no chords here', 'G');
		expect(doc.sections[0].lines).toEqual([
			{ lyrics: 'Just a spoken line, no chords here', chords: [] }
		]);
	});

	it('splits into labeled sections and normalizes labels', () => {
		const doc = parsePlaintextChart('Verse1\nG\nline one\n\nChorus\nC\nline two', 'G');
		expect(doc.sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus']);
		expect(doc.sections[0].lines.map((l) => l.lyrics)).toEqual(['line one', '']);
		expect(doc.sections[1].lines.map((l) => l.lyrics)).toEqual(['line two']);
	});

	it('normalizes curly apostrophes in lyrics', () => {
		const doc = parsePlaintextChart('G\nI’ve been set free', 'G');
		expect(doc.sections[0].lines[0].lyrics).toBe("I've been set free");
	});

	it('keeps raw text for unparseable chord tokens on an otherwise-chord line', () => {
		// 4 of 5 tokens parse (80%), meeting the chord-line threshold; the
		// unparseable token is kept verbatim as a raw passthrough chord.
		const doc = parsePlaintextChart('G   D   Em   C   Xyz123\nlyric line here', 'G');
		const chords = doc.sections[0].lines[0].chords;
		expect(chords).toHaveLength(5);
		expect(chords[4].chord).toEqual({ degree: 0, quality: '', raw: 'Xyz123' });
	});
});
