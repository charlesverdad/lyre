import { describe, expect, it } from 'vitest';
import { genericAdapter } from './generic';

// Chart body throughout is Amazing Grace (public domain) — see
// docs/licensing-and-content.md.

describe('genericAdapter', () => {
	it('prefers the largest <pre> block when one exists', () => {
		const html = `<html><head><title>Amazing Grace | Some Chords Site</title></head><body>
<pre>short</pre>
<pre>
G
Amazing grace, how sweet the sound
        C              G
That saved a wretch like me
       Em               C            D
I once was lost, but now I'm found
</pre>
</body></html>`;
		const result = genericAdapter.extract(html, 'https://example.com/amazing-grace');
		expect(result).not.toBeNull();
		expect(result?.chartText).toContain('Amazing grace, how sweet the sound');
		expect(result?.chartText).not.toBe('short');
	});

	it('falls back to the largest chart-like text block when there is no <pre>', () => {
		const html = `<html><head><title>Amazing Grace - Chords</title></head><body>
<nav>Home About Contact Login Sign up Search</nav>
<div>
G
Amazing grace, how sweet the sound
        C              G
That saved a wretch like me
       Em               C            D
I once was lost, but now I'm found
                       Em       C
Was blind but now I see
</div>
<footer>Copyright notice with no chords at all just regular prose text here</footer>
</body></html>`;
		const result = genericAdapter.extract(html, 'https://example.com/amazing-grace');
		expect(result).not.toBeNull();
		expect(result?.chartText).toContain('Amazing grace, how sweet the sound');
		expect(result?.chartText).not.toContain('Copyright notice');
	});

	it('returns null when nothing on the page looks like a chart', () => {
		const html = `<html><head><title>Just a blog post</title></head><body>
<p>This is just a paragraph of regular prose with no chords in it whatsoever.</p>
<p>Another unrelated paragraph, still no chords anywhere on this page.</p>
</body></html>`;
		const result = genericAdapter.extract(html, 'https://example.com/blog-post');
		expect(result).toBeNull();
	});

	it('extracts title from og:title', () => {
		const html = `<html><head>
<meta property="og:title" content="Amazing Grace Chords" />
<title>fallback title</title>
</head><body><pre>
G
Amazing grace, how sweet the sound
        C              G
That saved a wretch like me
</pre></body></html>`;
		const result = genericAdapter.extract(html, 'https://example.com/amazing-grace');
		expect(result?.title).toBe('Amazing Grace Chords');
	});
});
