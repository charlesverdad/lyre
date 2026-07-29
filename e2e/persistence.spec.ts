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

// docs/PLAN-v0.3.md §E4: a write in one tab must show up in another tab's
// already-open library view live — no reload of the second tab. Two *pages
// sharing one browser context* is the Playwright equivalent of two real tabs
// on the same origin — genuinely separate `BrowserContext`s each get
// isolated storage, so this can't be expressed with `browser.newContext()`
// twice; it needs two `Page`s off one `context`, which is exactly what this
// test does. This exercises `LyreStore.subscribe`'s cross-tab `storage`
// listener and `createLiveQuery`'s re-run in a realistic user scenario, but
// — see the next test's comment — it does not, and structurally cannot,
// regress the specific historical "lazy listener" defect below.
test('cross-tab: a write in one tab appears live in another tab already open on /library', async ({
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

	await addSongViaPaste(tabB, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});

	// Tab A never navigates or reloads — this is a live update, not a refetch.
	await expect(tabA.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible({
		timeout: 10_000
	});

	await tabA.close();
	await tabB.close();
});

// docs/PLAN-v0.3.md §E4 + E1 review: the most serious bug of the whole
// release was a tab's stale in-memory cache silently reverting another tab's
// write on its next save — `LyreStore` used to attach its cross-tab
// `storage` listener lazily, inside `subscribe()`, instead of unconditionally
// in the constructor (src/lib/db/store.ts's constructor comment). A tab that
// never called `subscribe()` at all kept a stale cache forever; its next
// `mutate()` would clone that stale draft and silently drop whatever another
// tab wrote meanwhile.
//
// This test exercises a real, useful scenario — tab A sitting on the edit
// screen (the one screen whose own load, `getSongWithDetails`, is a plain
// `store.read` rather than a `createLiveQuery`) while tab B writes a second
// song, then tab A saves an edit of its own without ever having navigated to
// `/library`/`/song`/`/collection` itself. It is *not*, however, a
// regression test for the historical defect above, and it's important to be
// honest about why: the root layout (`src/routes/+layout.svelte`) calls
// `defaultStore.subscribe(...)` unconditionally in its own `onMount`, on
// *every* route, for the migration-failure retry banner — so by the time any
// screen in this app finishes mounting, that tab has already subscribed once,
// regardless of which route it's on. There is currently no reachable screen
// in the real app that avoids calling `subscribe()`, so this exact bug can
// no longer be reproduced through UI navigation at all. Verified this
// empirically (task E4 review): temporarily moving
// `#attachStorageListener()` from the constructor back into `subscribe()` —
// the historical bug — left this e2e test passing unchanged, because the
// root layout's own subscription still arms the listener before tab A ever
// gets to its edit-screen `read()`. The real regression coverage for the
// lazy-listener defect is `src/lib/db/store.test.ts`'s "invalidates its
// cache on a cross-tab write even when subscribe() was never called" test,
// which constructs a bare `LyreStore` and never calls `subscribe()` on it at
// all — something no code path in the actual app can do anymore. (That unit
// test itself had a real bug making it toothless too, fixed in the same
// review pass — see its own comment.)
test('cross-tab: a save from the edit screen (no createLiveQuery of its own) still keeps a concurrent write from another tab', async ({
	context
}) => {
	const tabB = await context.newPage();
	await tabB.goto('/library');
	await addSongViaPaste(tabB, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});
	const songId = new URL(tabB.url()).pathname.split('/').pop();

	const tabA = await context.newPage();
	// Deep link directly to the edit screen, skipping /song and /library —
	// this is still the closest thing to an isolated tab the real app
	// offers, even though (per the comment above) the root layout's own
	// subscription means it isn't actually isolated from cache invalidation.
	await tabA.goto(`/edit/${songId}`);
	const saveButton = tabA.getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeEnabled({ timeout: 10_000 });

	// Tab B writes a second song while tab A sits on the edit screen.
	await addSongViaPaste(tabB, {
		title: ROCK_OF_AGES_TITLE,
		authors: ROCK_OF_AGES_AUTHOR,
		chartText: ROCK_OF_AGES_CHART
	});

	// Tab A, still on the edit screen with zero navigation since landing,
	// makes an unrelated edit and saves.
	await tabA.getByPlaceholder(/comma-separated/i).fill('Edited Author');
	await saveButton.click();
	await tabA.waitForURL(/\/song\//);

	const raw = await tabA.evaluate((key) => localStorage.getItem(key), LIBRARY_STORAGE_KEY);
	const doc = JSON.parse(raw!) as { songs: StoredSong[] };
	const titles = doc.songs.map((song) => song.title);
	expect(titles).toContain(AMAZING_GRACE_TITLE);
	expect(titles).toContain(ROCK_OF_AGES_TITLE);

	await tabA.close();
	await tabB.close();
});
