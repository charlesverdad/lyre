import { describe, expect, it } from 'vitest';
import { formatAuthorsInput, parseAuthorsInput } from './authors';

describe('parseAuthorsInput', () => {
	it('splits on commas and trims whitespace', () => {
		expect(parseAuthorsInput('Chris Tomlin, Ed Cash')).toEqual(['Chris Tomlin', 'Ed Cash']);
	});

	it('drops empty entries from stray/trailing commas', () => {
		expect(parseAuthorsInput('Chris Tomlin, , Ed Cash,')).toEqual(['Chris Tomlin', 'Ed Cash']);
	});

	it('returns an empty array for blank input', () => {
		expect(parseAuthorsInput('   ')).toEqual([]);
		expect(parseAuthorsInput('')).toEqual([]);
	});
});

describe('formatAuthorsInput', () => {
	it('joins authors with ", "', () => {
		expect(formatAuthorsInput(['Chris Tomlin', 'Ed Cash'])).toBe('Chris Tomlin, Ed Cash');
	});

	it('round-trips through parseAuthorsInput', () => {
		const authors = ['Chris Tomlin', 'Ed Cash'];
		expect(parseAuthorsInput(formatAuthorsInput(authors))).toEqual(authors);
	});
});
