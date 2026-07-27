import { describe, expect, it } from 'vitest';
import { parsePatternHeader } from './header';

describe('parsePatternHeader', () => {
	it('parses the pnwchords "Original in X. Capo n, play in Y." style', () => {
		const result = parsePatternHeader('Original in Ab. Capo 1, play in G.\nVerse1\nG\nlyrics');
		expect(result.soundingKey).toBe('Ab');
		expect(result.shapeKey).toBe('G');
		expect(result.capo).toBe(1);
		expect(result.remainingText).toBe('Verse1\nG\nlyrics');
	});

	it('parses "Key: G"', () => {
		const result = parsePatternHeader('Key: G\nVerse1\nG\nlyrics');
		expect(result.soundingKey).toBe('G');
		expect(result.shapeKey).toBeUndefined();
		expect(result.capo).toBeUndefined();
	});

	it('parses "Key of G"', () => {
		const result = parsePatternHeader('Key of G\nVerse1\nG\nlyrics');
		expect(result.soundingKey).toBe('G');
	});

	it('parses "Capo 2"', () => {
		const result = parsePatternHeader('Capo 2\nVerse1\nG\nlyrics');
		expect(result.capo).toBe(2);
		expect(result.soundingKey).toBeUndefined();
	});

	it('parses "Capo: 2"', () => {
		const result = parsePatternHeader('Capo: 2\nVerse1\nG\nlyrics');
		expect(result.capo).toBe(2);
	});

	it('parses "Capo on 2nd fret"', () => {
		const result = parsePatternHeader('Capo on 2nd fret\nVerse1\nG\nlyrics');
		expect(result.capo).toBe(2);
	});

	it('combines "Key: X" and "Capo: n" on separate lines, deriving the shape key', () => {
		const result = parsePatternHeader('Key: A\nCapo: 2\nVerse1\nG\nlyrics');
		expect(result.soundingKey).toBe('A');
		expect(result.capo).toBe(2);
		// A (9) - 2 = 7 = G
		expect(result.shapeKey).toBe('G');
	});

	it('combines key and capo stated on the same line', () => {
		const result = parsePatternHeader('Key: A, Capo: 2\nVerse1\nG\nlyrics');
		expect(result.soundingKey).toBe('A');
		expect(result.capo).toBe(2);
		expect(result.shapeKey).toBe('G');
	});

	it('parses another pnwchords-style combination (Bb sounding, G shapes, capo 3)', () => {
		const result = parsePatternHeader('Original in Bb. Capo 3, play in G.\nVerse1');
		expect(result.soundingKey).toBe('Bb');
		expect(result.shapeKey).toBe('G');
		expect(result.capo).toBe(3);
	});

	it('returns all-undefined and untouched text when there is no header', () => {
		const text = 'Verse1\nG\nAmazing grace';
		const result = parsePatternHeader(text);
		expect(result.soundingKey).toBeUndefined();
		expect(result.shapeKey).toBeUndefined();
		expect(result.capo).toBeUndefined();
		expect(result.remainingText).toBe(text);
	});

	it('does not scan past a chord line or section label looking for header text', () => {
		const text = 'G C D\nSome lyric mentioning capo 5 mid-song';
		const result = parsePatternHeader(text);
		expect(result.capo).toBeUndefined();
		expect(result.remainingText).toBe(text);
	});

	it('does not scan past a ChordPro directive line', () => {
		const text = '{title: Test}\n{key: G}\n[G]lyrics';
		const result = parsePatternHeader(text);
		expect(result.soundingKey).toBeUndefined();
		expect(result.remainingText).toBe(text);
	});

	it('leaves a single known field undefined when only one of soundingKey/shapeKey/capo is stated', () => {
		const result = parsePatternHeader('Capo 4\nVerse1\nG\nlyrics');
		expect(result.capo).toBe(4);
		expect(result.soundingKey).toBeUndefined();
		expect(result.shapeKey).toBeUndefined();
	});

	it('parses "Key: X, play in Y" without dropping the shape-key clause', () => {
		// "Key: A" states the sounding key; "play in G" independently states the
		// shape key — A (9) - G (7) = capo 2.
		const result = parsePatternHeader('Key: A, play in G\nVerse1\nG\nlyrics');
		expect(result.soundingKey).toBe('A');
		expect(result.shapeKey).toBe('G');
		expect(result.capo).toBe(2);
	});

	it('parses "Key: X, play in Y" where the shape key is "higher" than the sounding key', () => {
		// Sounding G (7), shape A (9): capo = mod12(7 - 9) = 10 — an unusually
		// high but mathematically valid capo (A + 10 = 19 mod 12 = 7 = G).
		// derivePattern only throws for unrecognized key spellings, which
		// doesn't happen here, so all three fields end up populated; the
		// try/catch in parsePatternHeader exists to leave capo undefined
		// instead of throwing if that ever isn't the case.
		const result = parsePatternHeader('Key: G, play in A\nVerse1\nG\nlyrics');
		expect(result.soundingKey).toBe('G');
		expect(result.shapeKey).toBe('A');
		expect(result.capo).toBe(10);
	});

	it('parses "played in X" and "play with X shapes" phrasings', () => {
		expect(parsePatternHeader('played in G\nVerse1').shapeKey).toBe('G');
		expect(parsePatternHeader('play with G shapes\nVerse1').shapeKey).toBe('G');
	});

	it('still parses the full pnwchords sentence correctly alongside the new play-in rule', () => {
		const result = parsePatternHeader('Original in Ab. Capo 1, play in G.\nVerse1');
		expect(result.soundingKey).toBe('Ab');
		expect(result.shapeKey).toBe('G');
		expect(result.capo).toBe(1);
	});
});
