import { describe, expect, it } from 'vitest';
import { isBareUrl, shouldAutoGrabPastedUrl } from './bareUrl';

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

describe('shouldAutoGrabPastedUrl', () => {
	// Review fix (PR #19): pasting a bare URL over/into existing paste-box
	// text must never auto-grab — it would preventDefault the paste and
	// silently overwrite whatever the user already had there.
	it('is true when the paste box is empty and the pasted text is a bare URL', () => {
		expect(shouldAutoGrabPastedUrl('', 'https://pnwchords.com/amazing-grace')).toBe(true);
	});

	it('is true when the paste box only has whitespace and the pasted text is a bare URL', () => {
		expect(shouldAutoGrabPastedUrl('   \n  ', 'https://pnwchords.com/amazing-grace')).toBe(true);
	});

	it('is false when the paste box already has chart text, even for a bare URL paste', () => {
		const existing = 'G           C\nAmazing grace, how sweet the sound';
		expect(shouldAutoGrabPastedUrl(existing, 'https://pnwchords.com/amazing-grace')).toBe(false);
	});

	it('is false when the pasted text is not a bare URL, regardless of box contents', () => {
		expect(shouldAutoGrabPastedUrl('', 'G           C\nAmazing grace')).toBe(false);
	});
});
