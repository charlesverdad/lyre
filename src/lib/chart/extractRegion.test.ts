import { describe, expect, it } from 'vitest';
import { chartSignalDensity, extractChartRegion, looksNoisy } from './extractRegion';

// Public-domain lyrics only (Amazing Grace, John Newton 1779) — see
// .claude/LEARNINGS.md's licensing constraint.
const CHART_BODY = `Original in Ab. Capo 1, play in G.

Verse 1
             G
Amazing grace, how sweet the sound
           C          G
That saved a wretch like me
              G                 D
I once was lost, but now am found
           G          D      G
Was blind, but now I see`;

/**
 * A synthetic select-all-copy dump mimicking a rendered chord-site page:
 * nav chrome, a search widget, a "Trending" rail, the chart itself, then a
 * related-posts/footer block. No real page's markup or copy is reproduced —
 * this is a hand-built approximation of the *shape* of that noise.
 */
const NOISY_DUMP = `Home
Chords
Artists
Search
Trending
Holy Holy Holy
Blessed Assurance
Come Thou Fount
Search chords, artists, or songs...
Sign In
Submit a chart

${CHART_BODY}

Related posts
What a Friend We Have in Jesus
It Is Well with My Soul
Nearer My God to Thee
Follow us
Facebook
Instagram
Twitter
© 2026 Example Chords Site. All rights reserved.
Privacy Policy
Terms of Service`;

describe('chartSignalDensity / looksNoisy', () => {
	it('is low for a page dump dominated by nav/footer chrome', () => {
		expect(looksNoisy(NOISY_DUMP)).toBe(true);
	});

	it('is high for a clean chart with no surrounding chrome', () => {
		expect(looksNoisy(CHART_BODY)).toBe(false);
	});

	it('is zero for text with no chart-shaped lines at all', () => {
		expect(chartSignalDensity('Just some random prose.\nNo chords here.\nNope.')).toBe(0);
	});
});

describe('extractChartRegion', () => {
	it('finds the chart region in a noisy page dump and drops nav/footer chrome', () => {
		const result = extractChartRegion(NOISY_DUMP);
		expect(result.confidence).toBe('high');
		expect(result.chartText).toContain('Amazing grace, how sweet the sound');
		expect(result.chartText).toContain('Original in Ab. Capo 1, play in G.');
		// Noise from both above and below the chart must be gone.
		expect(result.chartText).not.toContain('Trending');
		expect(result.chartText).not.toContain('Search chords');
		expect(result.chartText).not.toContain('Related posts');
		expect(result.chartText).not.toContain('Follow us');
		expect(result.chartText).not.toContain('Privacy Policy');
	});

	it('pulls in a pattern-header line up to a few lines above the chord-line cluster', () => {
		const dump = `Some nav noise
More nav noise
Original in Ab. Capo 1, play in G.

Verse 1
             G
Amazing grace, how sweet the sound

Footer noise
More footer noise`;
		const result = extractChartRegion(dump);
		expect(result.chartText).toContain('Original in Ab. Capo 1, play in G.');
		expect(result.chartText).not.toContain('nav noise');
		expect(result.chartText).not.toContain('footer noise');
	});

	it('leaves a clean chart unchanged (modulo surrounding whitespace)', () => {
		const result = extractChartRegion(CHART_BODY);
		expect(result.chartText).toBe(CHART_BODY.trim());
		expect(result.confidence).toBe('high');
	});

	it('tolerates small stanza-break gaps inside the window', () => {
		const dump = `Verse 1
             G
Amazing grace, how sweet the sound

           C          G
That saved a wretch like me

Chorus
              G                 D
I once was lost, but now am found`;
		const result = extractChartRegion(dump);
		expect(result.chartText).toBe(dump.trim());
		expect(result.confidence).toBe('high');
	});

	it('returns low confidence and the original text when there is no chart at all', () => {
		const text = 'Just some random prose.\nNo chords here.\nNope, still nothing.';
		const result = extractChartRegion(text);
		expect(result.confidence).toBe('low');
		expect(result.chartText).toBe(text.trim());
	});

	// Review regression (PR #19): a verse and the bridge that follows it were
	// being split into two windows by a >3-blank-line stanza break, and only
	// the "best" (higher signal-count) window survived — silently deleting a
	// real section from the extracted chart. Blank runs, however long, must
	// never split a window on their own; only a run of genuine noise lines
	// does.
	it('keeps both sections when a verse and bridge are separated by a long run of blank lines', () => {
		const dump = `Verse 1
             G
Amazing grace, how sweet the sound
           C          G
That saved a wretch like me




Bridge
              G                 D
I once was lost, but now am found
           G          D      G
Was blind, but now I see`;
		const result = extractChartRegion(dump);
		expect(result.confidence).toBe('high');
		expect(result.chartText).toBe(dump.trim());
		expect(result.chartText).toContain('Amazing grace, how sweet the sound');
		expect(result.chartText).toContain('Bridge');
		expect(result.chartText).toContain('Was blind, but now I see');
	});

	it('still splits on a genuine run of noise between two chord clusters and picks/trims the denser one', () => {
		const dump = `Verse 1
             G
Amazing grace, how sweet the sound
           C          G
That saved a wretch like me

Sponsored
Buy our songbook today
Limited time offer
Free shipping on orders over $50
Not affiliated with any publisher

Tag
G
Amazing`;
		const result = extractChartRegion(dump);
		expect(result.confidence).toBe('high');
		expect(result.chartText).toContain('Amazing grace, how sweet the sound');
		// The noise block, and the smaller trailing "Tag" cluster it splits
		// off from the denser Verse 1 cluster, are both dropped.
		expect(result.chartText).not.toContain('Sponsored');
		expect(result.chartText).not.toContain('Buy our songbook');
		expect(result.chartText).not.toContain('Limited time offer');
		expect(result.chartText).not.toContain('Tag');
	});
});
