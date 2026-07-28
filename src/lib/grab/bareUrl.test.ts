import { describe, expect, it } from 'vitest';
import { isBareUrl } from './bareUrl';

describe('isBareUrl', () => {
	it('is true for a plain https URL', () => {
		expect(isBareUrl('https://pnwchords.com/amazing-grace')).toBe(true);
	});

	it('is true for a plain http URL', () => {
		expect(isBareUrl('http://example.com/song')).toBe(true);
	});

	it('tolerates surrounding whitespace/newlines around the single URL', () => {
		expect(isBareUrl('  https://pnwchords.com/amazing-grace  \n')).toBe(true);
	});

	it('is false for multiline text with a URL inside it', () => {
		const text = `Amazing Grace
See the original at https://pnwchords.com/amazing-grace
G           C
Amazing grace, how sweet the sound`;
		expect(isBareUrl(text)).toBe(false);
	});

	it('is false for a single line containing a URL plus other text', () => {
		expect(isBareUrl('check out https://pnwchords.com/amazing-grace')).toBe(false);
	});

	it('is false for a non-http(s) scheme (e.g. javascript:) — safeHttpUrl gate', () => {
		expect(isBareUrl('javascript:alert(1)')).toBe(false);
	});

	it('is false for plain text that is not a URL at all', () => {
		expect(isBareUrl('G           C\nAmazing grace')).toBe(false);
	});

	it('is false for empty/whitespace-only input', () => {
		expect(isBareUrl('')).toBe(false);
		expect(isBareUrl('   ')).toBe(false);
	});
});
