import { describe, expect, it } from 'vitest';
import { resolveAdapter } from './registry';
import { pnwchordsAdapter } from './adapters/pnwchords';
import { genericAdapter } from './adapters/generic';

describe('resolveAdapter', () => {
	it('matches pnwchords.com exactly', () => {
		const lookup = resolveAdapter('https://pnwchords.com/some-song/');
		expect(lookup).toEqual({ kind: 'adapter', adapter: pnwchordsAdapter });
	});

	it('matches a pnwchords.com subdomain', () => {
		const lookup = resolveAdapter('https://www.pnwchords.com/some-song/');
		expect(lookup.kind).toBe('adapter');
		if (lookup.kind === 'adapter') expect(lookup.adapter).toBe(pnwchordsAdapter);
	});

	it('falls back to the generic adapter for unknown domains', () => {
		const lookup = resolveAdapter('https://some-random-chords-site.example/song');
		expect(lookup).toEqual({ kind: 'generic', adapter: genericAdapter });
	});

	it('excludes ultimate-guitar.com with a typed unsupported-site error', () => {
		const lookup = resolveAdapter('https://ultimate-guitar.com/tab/some-song');
		expect(lookup.kind).toBe('excluded');
		if (lookup.kind === 'excluded') {
			expect(lookup.error.reason).toBe('unsupported-site');
			expect(lookup.error.message).toMatch(/paste/i);
		}
	});

	it('excludes tabs.ultimate-guitar.com', () => {
		const lookup = resolveAdapter('https://tabs.ultimate-guitar.com/tab/some-song');
		expect(lookup.kind).toBe('excluded');
	});

	it('excludes ultimate-guitar.com subdomains generally, not just the known one', () => {
		const lookup = resolveAdapter('https://www.ultimate-guitar.com/tab/some-song');
		expect(lookup.kind).toBe('excluded');
	});

	it('does not fall through to the generic adapter for excluded domains', () => {
		const lookup = resolveAdapter('https://ultimate-guitar.com/tab/some-song');
		expect(lookup.kind).not.toBe('generic');
	});

	it('treats an unparseable URL as not excluded and falls back to generic', () => {
		const lookup = resolveAdapter('not a url');
		expect(lookup).toEqual({ kind: 'generic', adapter: genericAdapter });
	});
});
