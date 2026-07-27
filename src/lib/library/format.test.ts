import { describe, expect, it } from 'vitest';
import { formatPatternSummary, formatSongSubtitle } from './format';

describe('formatPatternSummary', () => {
	it('renders shape, capo, and sounding key as "G shapes · capo 2 · A"', () => {
		expect(formatPatternSummary({ shapeKey: 'G', capo: 2, soundingKey: 'A' })).toBe(
			'G shapes · capo 2 · A'
		);
	});

	it('renders "no capo" instead of "capo 0"', () => {
		expect(formatPatternSummary({ shapeKey: 'D', capo: 0, soundingKey: 'D' })).toBe(
			'D shapes · no capo · D'
		);
	});
});

describe('formatSongSubtitle', () => {
	it('joins authors and pattern summary with a middot', () => {
		expect(formatSongSubtitle(['Bethel Music'], 'G shapes · capo 2 · A')).toBe(
			'Bethel Music · G shapes · capo 2 · A'
		);
	});

	it('joins multiple authors with commas', () => {
		expect(formatSongSubtitle(['Chris Tomlin', 'Ed Cash'], undefined)).toBe(
			'Chris Tomlin, Ed Cash'
		);
	});

	it('falls back to just the pattern summary when there are no authors', () => {
		expect(formatSongSubtitle([], 'G shapes · capo 2 · A')).toBe('G shapes · capo 2 · A');
	});

	it('falls back to just the authors when there is no pattern yet', () => {
		expect(formatSongSubtitle(['Bethel Music'], undefined)).toBe('Bethel Music');
	});

	it('returns an empty string when there is neither', () => {
		expect(formatSongSubtitle([], undefined)).toBe('');
	});
});
