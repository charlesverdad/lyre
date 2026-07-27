import { describe, expect, it } from 'vitest';
import { grabFromHtml, grabUrl, safeHttpUrl } from './fetcher';

// Chart body throughout is Amazing Grace (public domain) — see
// docs/licensing-and-content.md.

const PNWCHORDS_HTML = `<!doctype html>
<html><head>
<title>Amazing Grace - John Newton</title>
<meta property="og:title" content="Amazing Grace - John Newton" />
<script type="application/ld+json">
{"@type":"MusicRecording","name":"Amazing Grace","byArtist":{"name":"John Newton"}}
</script>
</head><body>
<pre data-key="G">
Original in Ab. Capo 1, play in G.
Verse1
G
Amazing grace, how sweet the sound
        C              G
That saved a wretch like me
</pre>
</body></html>`;

function fakeFetch(response: { ok: boolean; status?: number; statusText?: string; text: string }) {
	return async () =>
		({
			ok: response.ok,
			status: response.status ?? (response.ok ? 200 : 500),
			statusText: response.statusText ?? '',
			text: async () => response.text
		}) as Response;
}

describe('grabUrl', () => {
	it('fetches, extracts, and parses a successful grab', async () => {
		const outcome = await grabUrl('https://pnwchords.com/amazing-grace/', {
			fetchImpl: fakeFetch({ ok: true, text: PNWCHORDS_HTML })
		});
		expect(outcome.ok).toBe(true);
		if (outcome.ok) {
			expect(outcome.result.title).toBe('Amazing Grace');
			expect(outcome.result.artist).toBe('John Newton');
			expect(outcome.result.header).toEqual({ soundingKey: 'Ab', shapeKey: 'G', capo: 1 });
			expect(outcome.result.sourceKey).toBe('G');
			expect(outcome.result.sourceUrl).toBe('https://pnwchords.com/amazing-grace/');
			expect(outcome.result.sourceSite).toBe('pnwchords.com');
		}
	});

	it('reports cors-or-network on a fetch TypeError', async () => {
		const throwingFetch = async () => {
			throw new TypeError('Failed to fetch');
		};
		const outcome = await grabUrl('https://example.com/song', { fetchImpl: throwingFetch });
		expect(outcome).toEqual({
			ok: false,
			reason: 'cors-or-network',
			detail: 'Failed to fetch'
		});
	});

	it('reports http-error (not cors-or-network) on a non-200 response', async () => {
		const outcome = await grabUrl('https://example.com/song', {
			fetchImpl: fakeFetch({ ok: false, status: 404, statusText: 'Not Found', text: '' })
		});
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.reason).toBe('http-error');
			expect(outcome.detail).toContain('404');
		}
	});

	it('distinguishes http-error (server responded) from cors-or-network (fetch itself failed)', async () => {
		const httpErrorOutcome = await grabUrl('https://example.com/song', {
			fetchImpl: fakeFetch({ ok: false, status: 404, statusText: 'Not Found', text: '' })
		});
		const networkErrorOutcome = await grabUrl('https://example.com/song', {
			fetchImpl: async () => {
				throw new TypeError('Failed to fetch');
			}
		});

		expect(httpErrorOutcome).toMatchObject({ ok: false, reason: 'http-error' });
		expect(networkErrorOutcome).toMatchObject({ ok: false, reason: 'cors-or-network' });
	});

	it('reports unsupported-site for Ultimate Guitar without fetching', async () => {
		let called = false;
		const outcome = await grabUrl('https://ultimate-guitar.com/tab/some-song', {
			fetchImpl: async () => {
				called = true;
				throw new Error('should not be called');
			}
		});
		expect(called).toBe(false);
		expect(outcome).toEqual({
			ok: false,
			reason: 'unsupported-site',
			detail: expect.stringMatching(/paste/i)
		});
	});

	it('reports no-chart-found when the resolved adapter finds nothing', async () => {
		const outcome = await grabUrl('https://pnwchords.com/not-a-chart-page/', {
			fetchImpl: fakeFetch({ ok: true, text: '<html><body>nothing here</body></html>' })
		});
		expect(outcome).toEqual({ ok: false, reason: 'no-chart-found' });
	});

	// SEC1: javascript:-scheme URL XSS. A `javascript:` URL used to fail
	// `fetch` with a `TypeError` (mapped to `cors-or-network`), which
	// auto-opens the guided-paste sheet's "Open the page" link in the UI —
	// clicking it ran attacker script in-origin. `fetchImpl` must never even
	// be called for a non-http(s) URL.
	it('rejects a javascript: URL as invalid-url without calling fetch', async () => {
		let called = false;
		const outcome = await grabUrl('javascript:alert(1)', {
			fetchImpl: async () => {
				called = true;
				throw new Error('should not be called');
			}
		});
		expect(called).toBe(false);
		expect(outcome).toEqual({ ok: false, reason: 'invalid-url' });
	});

	it('rejects a data: URL as invalid-url without calling fetch', async () => {
		let called = false;
		const outcome = await grabUrl('data:text/html,<script>alert(1)</script>', {
			fetchImpl: async () => {
				called = true;
				throw new Error('should not be called');
			}
		});
		expect(called).toBe(false);
		expect(outcome).toEqual({ ok: false, reason: 'invalid-url' });
	});

	it('rejects a non-URL string as invalid-url without calling fetch', async () => {
		let called = false;
		const outcome = await grabUrl('not a url', {
			fetchImpl: async () => {
				called = true;
				throw new Error('should not be called');
			}
		});
		expect(called).toBe(false);
		expect(outcome).toEqual({ ok: false, reason: 'invalid-url' });
	});
});

describe('grabFromHtml', () => {
	it('runs the same pipeline as grabUrl minus the fetch, given pasted HTML', () => {
		const outcome = grabFromHtml(PNWCHORDS_HTML, 'https://pnwchords.com/amazing-grace/');
		expect(outcome.ok).toBe(true);
		if (outcome.ok) {
			expect(outcome.result.title).toBe('Amazing Grace');
			expect(outcome.result.header.shapeKey).toBe('G');
		}
	});

	it('treats input with no HTML tags as raw chart text directly', () => {
		const rawText = [
			'Key: G',
			'Verse1',
			'G',
			'Amazing grace, how sweet the sound',
			'        C              G',
			'That saved a wretch like me'
		].join('\n');
		const outcome = grabFromHtml(rawText, 'https://example.com/pasted');
		expect(outcome.ok).toBe(true);
		if (outcome.ok) {
			expect(outcome.result.chartText).toBe(rawText);
			expect(outcome.result.header.soundingKey).toBe('G');
			expect(outcome.result.title).toBeUndefined();
		}
	});

	it('reports no-chart-found for empty raw text', () => {
		const outcome = grabFromHtml('   ', 'https://example.com/pasted');
		expect(outcome).toEqual({ ok: false, reason: 'no-chart-found' });
	});

	it('still applies the unsupported-site exclusion for pasted Ultimate Guitar HTML', () => {
		const outcome = grabFromHtml(
			'<html><body><pre>G\nSome song</pre></body></html>',
			'https://ultimate-guitar.com/tab/some-song'
		);
		expect(outcome).toEqual({
			ok: false,
			reason: 'unsupported-site',
			detail: expect.stringMatching(/paste/i)
		});
	});

	it('rejects a javascript: URL as invalid-url even for plain pasted text', () => {
		const outcome = grabFromHtml('G\nAmazing grace', 'javascript:alert(1)');
		expect(outcome).toEqual({ ok: false, reason: 'invalid-url' });
	});
});

describe('safeHttpUrl', () => {
	it('passes through http and https URLs', () => {
		expect(safeHttpUrl('http://example.com')).toBe('http://example.com');
		expect(safeHttpUrl('https://example.com/song')).toBe('https://example.com/song');
	});

	it('rejects javascript:, data:, vbscript:, and unparseable strings', () => {
		expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
		expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
		expect(safeHttpUrl('vbscript:msgbox(1)')).toBeUndefined();
		expect(safeHttpUrl('not a url')).toBeUndefined();
		expect(safeHttpUrl('')).toBeUndefined();
	});
});
