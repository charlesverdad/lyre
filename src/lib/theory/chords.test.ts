import { describe, expect, it } from 'vitest';
import { chordToDegree, parseChordToken, renderChord } from './chords';
import type { Chord } from './types';

describe('parseChordToken', () => {
	it('parses bare major roots', () => {
		expect(parseChordToken('G')).toEqual({ root: 7, quality: '' });
		expect(parseChordToken('C')).toEqual({ root: 0, quality: '' });
	});

	it('parses roots with accidentals', () => {
		expect(parseChordToken('Bb')).toEqual({ root: 10, quality: '' });
		expect(parseChordToken('F#')).toEqual({ root: 6, quality: '' });
		expect(parseChordToken('Db')).toEqual({ root: 1, quality: '' });
	});

	it('parses common qualities', () => {
		expect(parseChordToken('Em')).toEqual({ root: 4, quality: 'm' });
		expect(parseChordToken('Gdim')).toEqual({ root: 7, quality: 'dim' });
		expect(parseChordToken('Caug')).toEqual({ root: 0, quality: 'aug' });
		expect(parseChordToken('Dsus2')).toEqual({ root: 2, quality: 'sus2' });
		expect(parseChordToken('Asus4')).toEqual({ root: 9, quality: 'sus4' });
		expect(parseChordToken('G2')).toEqual({ root: 7, quality: '2' });
		expect(parseChordToken('C5')).toEqual({ root: 0, quality: '5' });
		expect(parseChordToken('A6')).toEqual({ root: 9, quality: '6' });
		expect(parseChordToken('G7')).toEqual({ root: 7, quality: '7' });
		expect(parseChordToken('Cmaj7')).toEqual({ root: 0, quality: 'maj7' });
		expect(parseChordToken('Dm7')).toEqual({ root: 2, quality: 'm7' });
		expect(parseChordToken('Em9')).toEqual({ root: 4, quality: 'm9' });
		expect(parseChordToken('A9')).toEqual({ root: 9, quality: '9' });
		expect(parseChordToken('Gadd9')).toEqual({ root: 7, quality: 'add9' });
		expect(parseChordToken('D11')).toEqual({ root: 2, quality: '11' });
		expect(parseChordToken('E13')).toEqual({ root: 4, quality: '13' });
	});

	it('parses combination qualities', () => {
		expect(parseChordToken('Bm7b5')).toEqual({ root: 11, quality: 'm7b5' });
		expect(parseChordToken('D7sus4')).toEqual({ root: 2, quality: '7sus4' });
	});

	it('does not treat bare "o" as a diminished-quality alias', () => {
		// "Go" and "Do" are common English words/lyrics ("Go tell it on the
		// mountain"); a bare "o" -> dim alias would misparse them as chords.
		// "o" is only meaningful immediately before a digit (o7 -> dim7).
		expect(parseChordToken('Go')).toBeNull();
		expect(parseChordToken('Do')).toBeNull();
		expect(parseChordToken('Co7')).toEqual({ root: 0, quality: 'dim7' });
		expect(parseChordToken('Gdim')).toEqual({ root: 7, quality: 'dim' });
		expect(parseChordToken('G°')).toEqual({ root: 7, quality: 'dim' });
	});

	it('parses slash chords', () => {
		expect(parseChordToken('G/B')).toEqual({ root: 7, quality: '', bass: 11 });
		expect(parseChordToken('D/F#')).toEqual({ root: 2, quality: '', bass: 6 });
		expect(parseChordToken('Cmaj7/E')).toEqual({ root: 0, quality: 'maj7', bass: 4 });
	});

	it('parses N.C. (no chord) in its common spellings', () => {
		expect(parseChordToken('N.C.')).toEqual({ root: 0, quality: 'N.C.', noChord: true });
		expect(parseChordToken('NC')).toEqual({ root: 0, quality: 'N.C.', noChord: true });
		expect(parseChordToken('n.c.')).toEqual({ root: 0, quality: 'N.C.', noChord: true });
	});

	it('returns null for unparseable / weird tokens', () => {
		expect(parseChordToken('H')).toBeNull();
		expect(parseChordToken('Xyz')).toBeNull();
		expect(parseChordToken('')).toBeNull();
		expect(parseChordToken('G/B/D')).toBeNull();
		expect(parseChordToken('Gfrobnicate')).toBeNull();
	});

	it('parses the "6/9" quality despite its internal slash, and its "69" alias', () => {
		expect(parseChordToken('G6/9')).toEqual({ root: 7, quality: '6/9' });
		expect(parseChordToken('C69')).toEqual({ root: 0, quality: '6/9' });
	});
});

describe('chordToDegree / renderChord round trip', () => {
	it('round-trips diatonic chords through a key', () => {
		const key = 'G';
		for (const token of ['G', 'C', 'D', 'Em', 'Am', 'Bm', 'F#dim']) {
			const parsed = parseChordToken(token);
			expect(parsed).not.toBeNull();
			const chord = chordToDegree(parsed!, key);
			expect(renderChord(chord, key)).toBe(token);
		}
	});

	it('round-trips slash chords, transposing both root and bass', () => {
		const key = 'C';
		const parsed = parseChordToken('G/B')!;
		const chord = chordToDegree(parsed, key);
		expect(renderChord(chord, key)).toBe('G/B');
		// Transpose the shape key up to D: G/B (IV/6 in C) becomes A/C# in D.
		expect(renderChord(chord, 'D')).toBe('A/C#');
	});

	it('renders 1-4-5-6m degree pattern correctly per key (never naive sharps)', () => {
		const key = 'G';
		const progression = ['G', 'C', 'D', 'Em'].map((t) => chordToDegree(parseChordToken(t)!, key));
		expect(progression.map((c) => renderChord(c, 'G'))).toEqual(['G', 'C', 'D', 'Em']);
		expect(progression.map((c) => renderChord(c, 'F'))).toEqual(['F', 'Bb', 'C', 'Dm']);
		expect(progression.map((c) => renderChord(c, 'F'))).not.toContain('A#m');
	});

	it('N.C. round-trips regardless of key', () => {
		const parsed = parseChordToken('N.C.')!;
		const chord = chordToDegree(parsed, 'G');
		expect(renderChord(chord, 'G')).toBe('N.C.');
		expect(renderChord(chord, 'Bb')).toBe('N.C.');
	});

	it('passes through raw/unparseable chords verbatim', () => {
		const chord: Chord = { degree: 0, quality: '', raw: 'Gsomethingweird(add#11)' };
		expect(renderChord(chord, 'C')).toBe('Gsomethingweird(add#11)');
		expect(renderChord(chord, 'D')).toBe('Gsomethingweird(add#11)');
	});

	it('spells the tritone (#4/b5) per the key accidental preference', () => {
		const chord: Chord = { degree: 6, quality: '' };
		expect(renderChord(chord, 'C')).toBe('F#'); // sharp-preference key
		expect(renderChord(chord, 'F')).toBe('Cb'); // flat-preference key
	});

	it('spells borrowed (b2/b3/b6/b7) chords flat, even in sharp-preference keys', () => {
		expect(renderChord({ degree: 10, quality: '' }, 'D')).toBe('C');
		expect(renderChord({ degree: 8, quality: '' }, 'C')).toBe('Ab');
		expect(renderChord({ degree: 3, quality: 'm' }, 'C')).toBe('Ebm');
		expect(renderChord({ degree: 10, quality: '' }, 'E')).toBe('D');
		expect(renderChord({ degree: 8, quality: '' }, 'G')).toBe('Eb');
	});

	it('round-trips and transposes the "6/9" quality', () => {
		const parsed = parseChordToken('G6/9')!;
		const chord = chordToDegree(parsed, 'C');
		expect(renderChord(chord, 'C')).toBe('G6/9');
		expect(renderChord(chord, 'D')).toBe('A6/9');
	});
});
