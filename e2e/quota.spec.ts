import { expect, test, type Page } from '@playwright/test';
import {
	AMAZING_GRACE_AUTHOR,
	AMAZING_GRACE_CHART,
	AMAZING_GRACE_TITLE
} from './fixtures/amazing-grace';
import { addSongViaPaste } from './helpers';

const QUOTA_MESSAGE = 'Storage is full — export your library and remove some songs.';

/**
 * Makes every future `localStorage.setItem` throw a real
 * `QuotaExceededError`-shaped `DOMException` — the same failure
 * `LyreStore.mutate` catches and rethrows as `StorageQuotaError`
 * (src/lib/db/store.ts). Regression coverage for task E1 review fix #4:
 * write paths that used to `await` a mutation without a `catch` produced an
 * unhandled rejection and no UI feedback under this exact condition.
 */
async function blockStorageWrites(page: Page): Promise<void> {
	await page.evaluate(() => {
		Storage.prototype.setItem = () => {
			throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		};
	});
}

test('add song: a full-storage save shows the StorageQuotaError message instead of failing silently', async ({
	page
}) => {
	await page.goto('/add');
	await page.getByPlaceholder(/paste a chart/i).fill(AMAZING_GRACE_CHART);
	await expect(page.getByText('Preview', { exact: true })).toBeVisible();
	await page.getByPlaceholder('Song title').fill(AMAZING_GRACE_TITLE);

	await blockStorageWrites(page);

	const saveButton = page.getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();

	await expect(page.getByText(QUOTA_MESSAGE)).toBeVisible();
	// Never navigated away — the failed save didn't pretend to succeed.
	await expect(page).toHaveURL(/\/add/);
});

test('library delete: a full-storage delete shows a message and leaves the sheet open', async ({
	page
}) => {
	await addSongViaPaste(page, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});

	await page.getByRole('link', { name: 'Library' }).click();
	await page.waitForURL(/\/library/);
	await expect(page.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible({
		timeout: 10_000
	});

	await blockStorageWrites(page);

	await page.getByRole('button', { name: 'Song options', exact: true }).click();
	await expect(page.getByRole('heading', { name: AMAZING_GRACE_TITLE })).toBeVisible();
	await page.getByRole('button', { name: 'Delete song' }).click();

	await expect(page.getByText(QUOTA_MESSAGE)).toBeVisible();
	// The sheet is still open with the delete button still there — not a
	// silent no-op that leaves the user guessing whether it worked.
	await expect(page.getByRole('button', { name: 'Delete song' })).toBeVisible();
	// The song is still in the library — the delete never actually happened.
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible();
});

test('opening a song still renders it when the non-blocking "recently played" write fails', async ({
	page
}) => {
	await addSongViaPaste(page, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});

	await page.getByRole('link', { name: 'Library' }).click();
	await page.waitForURL(/\/library/);
	await expect(page.getByText(AMAZING_GRACE_TITLE, { exact: true })).toBeVisible({
		timeout: 10_000
	});

	await blockStorageWrites(page);

	// Re-opening the song re-runs `load()`, which stamps `lastPlayedAt` via
	// `touchLastPlayed` — a full-document write that now fails under the
	// blocked storage above.
	await page.getByText(AMAZING_GRACE_TITLE, { exact: true }).click();
	await page.waitForURL(/\/song\//);

	// The song still opens and renders (badge reflects the resolved pattern,
	// same assertion transpose.spec.ts uses to confirm a full render) — a
	// failed play-timestamp must not block reading a song that's already
	// loaded.
	await expect(page.getByRole('heading', { name: AMAZING_GRACE_TITLE })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Capo 1 · G shapes · sounds in Ab' })
	).toBeVisible();
	// ...and it's surfaced, not swallowed as an unhandled rejection.
	await expect(page.getByText(QUOTA_MESSAGE)).toBeVisible();
});
