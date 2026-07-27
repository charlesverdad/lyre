import { describe, expect, it } from 'vitest';
import { splitChordLine } from './chordLine';

const render = (text: string) => text;

describe('splitChordLine', () => {
	it('returns a single chordless fragment for a plain lyric line', () => {
		expect(splitChordLine({ lyrics: 'no chords here', chords: [] }, render)).toEqual([
			{ lyricText: 'no chords here' }
		]);
	});

	it('splits at each chord index, pairing a chord with the lyric text that follows it', () => {
		// "I love You, Lord" with [G] at 0 and [C] at 7 ("Lord" chart example, domain-model.md §3).
		const line = {
			lyrics: 'I love You, Lord',
			chords: [
				{ chord: 'G', index: 0 },
				{ chord: 'C', index: 7 }
			]
		};
		expect(splitChordLine(line, render)).toEqual([
			{ chordText: 'G', lyricText: 'I love ' },
			{ chordText: 'C', lyricText: 'You, Lord' }
		]);
	});

	it('emits a leading chordless fragment when the first chord is not at index 0', () => {
		const line = {
			lyrics: 'For Your mercy never fails me',
			chords: [{ chord: 'G', index: 15 }]
		};
		expect(splitChordLine(line, render)).toEqual([
			{ lyricText: 'For Your mercy ' },
			{ chordText: 'G', lyricText: 'never fails me' }
		]);
	});

	it('handles two chords with no lyric text between them (adjacent chords)', () => {
		const line = {
			lyrics: 'word',
			chords: [
				{ chord: 'G', index: 0 },
				{ chord: 'C', index: 0 }
			]
		};
		expect(splitChordLine(line, render)).toEqual([
			{ chordText: 'G', lyricText: '' },
			{ chordText: 'C', lyricText: 'word' }
		]);
	});

	it('renders each chord through the supplied renderer, in shape-key form', () => {
		const line = {
			lyrics: 'Lord',
			chords: [{ chord: { degree: 0, quality: '' }, index: 0 }]
		};
		const rendered = splitChordLine(line, (chord) => `<${chord.degree}${chord.quality}>`);
		expect(rendered).toEqual([{ chordText: '<0>', lyricText: 'Lord' }]);
	});

	it('sorts out-of-order chords by index before splitting', () => {
		const line = {
			lyrics: 'abcdef',
			chords: [
				{ chord: 'Y', index: 3 },
				{ chord: 'X', index: 0 }
			]
		};
		expect(splitChordLine(line, render)).toEqual([
			{ chordText: 'X', lyricText: 'abc' },
			{ chordText: 'Y', lyricText: 'def' }
		]);
	});

	it('clamps chord indices that exceed the lyric length (defensive)', () => {
		const line = {
			lyrics: 'hi',
			chords: [{ chord: 'G', index: 50 }]
		};
		expect(splitChordLine(line, render)).toEqual([
			{ lyricText: 'hi' },
			{ chordText: 'G', lyricText: '' }
		]);
	});
});
