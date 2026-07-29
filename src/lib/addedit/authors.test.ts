import { describe, expect, it } from 'vitest';
import { formatAuthorsInput, parseAuthorsInput } from './authors';

describe('parseAuthorsInput', () => {
	it('splits on commas and trims whitespace', () => {
		expect(parseAuthorsInput('John Newton, Isaac Watts')).toEqual(['John Newton', 'Isaac Watts']);
	});

	it('drops empty entries from stray/trailing commas', () => {
		expect(parseAuthorsInput('John Newton, , Isaac Watts,')).toEqual([
			'John Newton',
			'Isaac Watts'
		]);
	});

	it('returns an empty array for blank input', () => {
		expect(parseAuthorsInput('   ')).toEqual([]);
		expect(parseAuthorsInput('')).toEqual([]);
	});
});

describe('formatAuthorsInput', () => {
	it('joins authors with ", "', () => {
		expect(formatAuthorsInput(['John Newton', 'Isaac Watts'])).toBe('John Newton, Isaac Watts');
	});

	it('round-trips through parseAuthorsInput', () => {
		const authors = ['John Newton', 'Isaac Watts'];
		expect(parseAuthorsInput(formatAuthorsInput(authors))).toEqual(authors);
	});
});
