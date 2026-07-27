import { describe, expect, it } from 'vitest';
import { pnwchordsAdapter } from './pnwchords';

/**
 * Synthetic pnwchords-style fixture, structurally mirroring a real captured
 * page (materialize-style tab/button noise, JSON-LD blocks, the
 * `<pre data-key="...">` chart block) — LICENSING: chart body is Amazing
 * Grace (public domain), not any copyrighted worship song. See
 * docs/licensing-and-content.md.
 */
function pnwchordsFixture(
	opts: {
		titleTag?: string;
		ogTitle?: string;
		includeMusicRecordingJsonLd?: boolean;
		preAttrs?: string;
	} = {}
): string {
	const {
		titleTag = 'Amazing Grace - John Newton',
		ogTitle = 'Amazing Grace - John Newton',
		includeMusicRecordingJsonLd = true,
		preAttrs = 'data-key="G"'
	} = opts;

	const musicRecordingScript = includeMusicRecordingJsonLd
		? `<script type="application/ld+json">
{
  "@context":"http://schema.org",
  "@type":"MusicRecording",
  "byArtist": {
    "@context":"http://schema.org",
    "@type":"MusicGroup",
    "name":"John Newton"
  },
  "name":"Amazing Grace",
  "url":"https://pnwchords.com/amazing-grace/"
}
</script>`
		: '';

	return `<!doctype html>
<html>
<head>
	<title>${titleTag}</title>
	<meta property="og:title" content="${ogTitle}" />
	<meta property="og:site_name" content="pnwchords" />
	<script type="application/ld+json" class="yoast-schema-graph">{"@context":"https:\\/\\/schema.org","@graph":[{"@type":"Article","headline":"Amazing Grace &#8211; John Newton"}]}</script>
</head>
<body>
<nav class="materialize-nav">
	<ul class="tabs">
		<li><a href="#chords">Chords</a></li>
		<li><a href="#lyrics">Lyrics</a></li>
	</ul>
</nav>
<div class="responsive-tabs">
<h2 class="tabtitle">Chords</h2>
<div class="tabcontent">
<ul class="button-noise">
	<li><a href="javascript:void(0);" onclick="Columnar2()"><i class="material-icons">view_column</i>Split2</a></li>
	<li><a href="javascript:void(0);" onclick="Columnar3()"><i class="material-icons">view_module</i>Split3</a></li>
</ul>
</div>
${musicRecordingScript}
<pre ${preAttrs}>
Original in Ab. Capo 1, play in G.
Verse1
G
Amazing grace, how sweet the sound
        C              G
That saved a wretch like me
       Em               C            D
I once was lost, but now I&#8217;m found
                       Em       C
Was blind but now I see

Chorus
C                           G
  &#8217;Twas grace that taught my heart to fear
C                           G       D
  And grace my fears relieved
</pre>
</div>
<footer>© pnwchords</footer>
</body>
</html>`;
}

describe('pnwchordsAdapter', () => {
	it('extracts chart text from the first <pre data-key> block', () => {
		const html = pnwchordsFixture();
		const result = pnwchordsAdapter.extract(html, 'https://pnwchords.com/amazing-grace/');
		expect(result).not.toBeNull();
		expect(result?.chartText).toContain('Original in Ab. Capo 1, play in G.');
		expect(result?.chartText).toContain('Amazing grace, how sweet the sound');
		// materialize nav/button noise outside the <pre> must not leak in.
		expect(result?.chartText).not.toContain('Split2');
		expect(result?.chartText).not.toContain('material-icons');
	});

	it('decodes HTML entities in the chart text (curly apostrophe)', () => {
		const html = pnwchordsFixture();
		const result = pnwchordsAdapter.extract(html, 'https://pnwchords.com/amazing-grace/');
		expect(result?.chartText).toContain('I once was lost, but now I’m found');
		expect(result?.chartText).not.toContain('&#8217;');
	});

	it('reads title/artist from the JSON-LD MusicRecording block', () => {
		const html = pnwchordsFixture();
		const result = pnwchordsAdapter.extract(html, 'https://pnwchords.com/amazing-grace/');
		expect(result?.title).toBe('Amazing Grace');
		expect(result?.artist).toBe('John Newton');
	});

	it('falls back to og:title/<title> "Song - Artist" parsing when MusicRecording JSON-LD is missing', () => {
		const html = pnwchordsFixture({ includeMusicRecordingJsonLd: false });
		const result = pnwchordsAdapter.extract(html, 'https://pnwchords.com/amazing-grace/');
		expect(result?.title).toBe('Amazing Grace');
		expect(result?.artist).toBe('John Newton');
	});

	it('strips a trailing " - pnwchords" suffix from the title-tag fallback', () => {
		const html = pnwchordsFixture({
			includeMusicRecordingJsonLd: false,
			titleTag: 'Amazing Grace - John Newton - pnwchords',
			ogTitle: 'Amazing Grace - John Newton - pnwchords'
		});
		const result = pnwchordsAdapter.extract(html, 'https://pnwchords.com/amazing-grace/');
		expect(result?.title).toBe('Amazing Grace');
		expect(result?.artist).toBe('John Newton');
	});

	it('returns null when there is no <pre data-key> block on the page', () => {
		const html =
			'<html><head><title>Not a chart page</title></head><body>nothing here</body></html>';
		const result = pnwchordsAdapter.extract(html, 'https://pnwchords.com/not-a-chart/');
		expect(result).toBeNull();
	});

	it('is registered under pnwchords.com', () => {
		expect(pnwchordsAdapter.domains).toContain('pnwchords.com');
	});
});
