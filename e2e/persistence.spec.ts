import { expect, test } from '@playwright/test';
import {
	AMAZING_GRACE_AUTHOR,
	AMAZING_GRACE_CHART,
	AMAZING_GRACE_TITLE
} from './fixtures/amazing-grace';
import {
	ROCK_OF_AGES_AUTHOR,
	ROCK_OF_AGES_CHART,
	ROCK_OF_AGES_TITLE
} from './fixtures/rock-of-ages';
import { addSongViaPaste } from './helpers';

// The store of record's own key (src/lib/db/store.ts's `LIBRARY_STORAGE_KEY`)
// — hardcoded rather than imported since e2e specs run outside the app's
// `$lib` alias/bundling. task E1, docs/PLAN-v0.3.md §E1.
const LIBRARY_STORAGE_KEY = 'lyre:library:v1';

interface StoredSong {
	title: string;
}

// docs/PLAN-v0.3.md §E4: add a song, reload the page, confirm it's still
// there and that localStorage holds the library key.
test('persistence: a saved song survives a reload, and localStorage holds the library key', async ({
	page
}) => {
	await addSongViaPaste(page, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});

	// Reload right on the song's own page first — the most direct "did this
	// actually persist" check, independent of the library list re-rendering.
	await page.reload();
	await expect(page.getByRole('heading', { name: AMAZING_GRACE_TITLE })).toBeVisible({
		timeout: 10_000
	});

	await page.getByRole('link', { name: 'Library' }).click();
	await page.waitForURL(/\/library/);
	await expect(page.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible({
		timeout: 10_000
	});

	const raw = await page.evaluate((key) => localStorage.getItem(key), LIBRARY_STORAGE_KEY);
	expect(raw).not.toBeNull();
	const doc = JSON.parse(raw!) as { songs: StoredSong[] };
	expect(doc.songs.some((song) => song.title === AMAZING_GRACE_TITLE)).toBe(true);
});

// docs/PLAN-v0.3.md §E4 + E1 review: the most serious bug of the whole
// release was a tab's stale in-memory cache silently reverting another tab's
// write on its next save (LyreStore didn't invalidate its cache on a
// cross-tab `storage` event). Two *pages sharing one browser context* is the
// Playwright equivalent of two real tabs on the same origin — genuinely
// separate `BrowserContext`s each get isolated storage, so this can't be
// expressed with `browser.newContext()` twice; it needs two `Page`s off one
// `context`, which is exactly what this test does.
test('cross-tab safety: a write in one tab is seen live by another, and neither reverts the other', async ({
	context
}) => {
	const tabA = await context.newPage();
	const tabB = await context.newPage();

	await tabA.goto('/library');
	// `getByText` alone is ambiguous here: the empty state's heading and its
	// action button share the exact same copy ("Add your first song").
	await expect(tabA.locator('p', { hasText: 'Add your first song' })).toBeVisible({
		timeout: 10_000
	});
	await tabB.goto('/library');

	// Tab B writes first, while A is sitting idle on the (still-empty) library.
	await addSongViaPaste(tabB, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});

	// Tab A must pick this up live via the `storage` event → cache
	// invalidation → live-query re-run, with no reload of its own.
	await tabA.goto('/library');
	await expect(tabA.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible({
		timeout: 10_000
	});

	// Tab A now saves its own song. If A's cache were stale (the bug this
	// regresses), this write would clone a doc that never saw B's song and
	// silently drop it — the single-key document only ever has one shape.
	await addSongViaPaste(tabA, {
		title: ROCK_OF_AGES_TITLE,
		authors: ROCK_OF_AGES_AUTHOR,
		chartText: ROCK_OF_AGES_CHART
	});

	const raw = await tabA.evaluate((key) => localStorage.getItem(key), LIBRARY_STORAGE_KEY);
	const doc = JSON.parse(raw!) as { songs: StoredSong[] };
	const titles = doc.songs.map((song) => song.title);
	expect(titles).toContain(AMAZING_GRACE_TITLE);
	expect(titles).toContain(ROCK_OF_AGES_TITLE);

	// And tab B — independently, via its own next read — sees both too.
	await tabB.goto('/library');
	await expect(tabB.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible({
		timeout: 10_000
	});
	await expect(tabB.getByText(ROCK_OF_AGES_TITLE, { exact: true })).toBeVisible({
		timeout: 10_000
	});

	await tabA.close();
	await tabB.close();
});
