import { expect, test } from '@playwright/test';
import { AMAZING_GRACE_AUTHOR, AMAZING_GRACE_TITLE } from './fixtures/amazing-grace';

// task D1 (mvp-spec.md F2): a select-all + copy off a real chord-site page
// hands back nav/search/footer chrome around the chart, not just the chart.
// `$lib/chart/extractRegion.ts`'s region extraction (wired into the paste
// flow via `deriveChartParseState`) should trim that noise before parsing,
// so the preview shows only the chart and save still works.
const NOISY_PAGE_DUMP = `Home
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

Original in Ab. Capo 1, play in G.

Verse 1
             G
Amazing grace, how sweet the sound
           C          G
That saved a wretch like me
              G                 D
I once was lost, but now am found
           G          D      G
Was blind, but now I see

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

test('noisy paste: page-dump paste shows only the trimmed chart and saves', async ({ page }) => {
	await page.goto('/add');

	await page.getByPlaceholder(/paste a chart/i).fill(NOISY_PAGE_DUMP);

	// The "trimmed page noise" hint appears, and the preview renders only the
	// chart — none of the nav/footer chrome leaked into the parsed doc.
	await expect(page.getByText('Trimmed page noise — check the preview.')).toBeVisible();
	await expect(page.getByText('Preview', { exact: true })).toBeVisible();
	await expect(page.getByText('Amazing grace, how sweet the sound')).toBeVisible();
	await expect(page.getByText('G shapes · capo 1 · Ab')).toBeVisible();

	await expect(page.getByText('Trending')).toHaveCount(0);
	await expect(page.getByText('Related posts')).toHaveCount(0);
	await expect(page.getByText('Search chords, artists, or songs')).toHaveCount(0);

	await page.getByPlaceholder('Song title').fill(AMAZING_GRACE_TITLE);
	await page.getByPlaceholder(/comma-separated/i).fill(AMAZING_GRACE_AUTHOR);

	const saveButton = page.getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();

	await page.waitForURL(/\/song\//);
	await expect(page.getByRole('heading', { name: AMAZING_GRACE_TITLE })).toBeVisible();
});
