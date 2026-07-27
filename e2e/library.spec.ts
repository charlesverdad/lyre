import { expect, test } from '@playwright/test';
import {
	AMAZING_GRACE_AUTHOR,
	AMAZING_GRACE_CHART,
	AMAZING_GRACE_TITLE
} from './fixtures/amazing-grace';
import { addSongViaPaste } from './helpers';

// mvp-spec.md acceptance walkthrough + F1: library row shows the pattern
// summary, search finds a song by a lyric word, and delete removes it.
test('library: row summary, lyric search, and delete', async ({ page }) => {
	await addSongViaPaste(page, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});

	await page.getByRole('link', { name: 'Library' }).click();
	await page.waitForURL(/\/library/);

	// The row only renders once Dexie's live query resolves — see
	// library-empty.spec.ts's comment on the same cold-open timing.
	const titleText = page.getByText(AMAZING_GRACE_TITLE, { exact: true });
	await expect(titleText).toBeVisible({ timeout: 10_000 });

	const row = titleText.locator('xpath=ancestor::button[1]');
	await expect(row).toContainText('John Newton');
	await expect(row).toContainText('G shapes · capo 1 · Ab');

	// F1: "instant client-side search over title/author/lyrics" — a word
	// that only appears in the lyrics, not the title/author.
	await page.getByPlaceholder('Search songs, authors, lyrics').fill('wretch');
	await expect(page.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible();

	await page.getByPlaceholder('Search songs, authors, lyrics').fill('nonexistent song xyz');
	await expect(page.getByText('No matches')).toBeVisible();

	await page.getByPlaceholder('Search songs, authors, lyrics').fill('');
	await expect(page.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Song options', exact: true }).click();
	await expect(page.getByRole('heading', { name: AMAZING_GRACE_TITLE })).toBeVisible();
	await page.getByRole('button', { name: 'Delete song' }).click();

	await expect(page.locator('p', { hasText: 'Add your first song' })).toBeVisible({
		timeout: 10_000
	});
});
