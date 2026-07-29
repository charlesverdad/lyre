import { expect, test, type Page } from '@playwright/test';
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
import { addSongViaPaste, dialogRowByTitle, openDialog, rowByTitle } from './helpers';

const COLLECTION_NAME = 'Sunday Set';

/** Vertical position of a row, for order assertions (rows are a plain top-to-bottom list). */
async function rowTop(row: ReturnType<typeof rowByTitle>): Promise<number> {
	const box = await row.boundingBox();
	if (!box) throw new Error('row has no bounding box — is it actually visible?');
	return box.y;
}

// docs/PLAN-v0.3.md §E4: create a collection, add two songs, reorder (move
// up/down), open a song from the set, remove one, delete the collection, and
// confirm the songs survive in the library.
test('collections: full lifecycle — create, add, reorder, open, remove, delete', async ({
	page
}) => {
	await addSongViaPaste(page, {
		title: AMAZING_GRACE_TITLE,
		authors: AMAZING_GRACE_AUTHOR,
		chartText: AMAZING_GRACE_CHART
	});
	await addSongViaPaste(page, {
		title: ROCK_OF_AGES_TITLE,
		authors: ROCK_OF_AGES_AUTHOR,
		chartText: ROCK_OF_AGES_CHART
	});

	await page.getByRole('link', { name: 'Library' }).click();
	await page.waitForURL(/\/library/);
	await page.getByRole('button', { name: 'Collections', exact: true }).click();
	await expect(page.getByText('Create your first collection')).toBeVisible({ timeout: 10_000 });

	// --- Create -----------------------------------------------------------
	await page.getByRole('button', { name: 'New collection', exact: true }).first().click();
	const createDialog = openDialog(page);
	await expect(createDialog.getByRole('heading', { name: 'New collection' })).toBeVisible();
	await createDialog.getByPlaceholder('e.g. Sunday service').fill(COLLECTION_NAME);
	await createDialog.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);

	await expect(rowByTitle(page, COLLECTION_NAME)).toContainText('No songs yet');
	await rowByTitle(page, COLLECTION_NAME).click();
	await page.waitForURL(/\/collection\//);
	const collectionUrl = new URL(page.url());
	const collectionId = collectionUrl.pathname.split('/').pop();

	await expect(page.getByRole('heading', { name: COLLECTION_NAME })).toBeVisible();
	await expect(page.getByText('No songs in this set yet')).toBeVisible();

	// --- Add two songs ------------------------------------------------------
	await page.getByRole('button', { name: 'Add songs', exact: true }).first().click();
	const addDialog = openDialog(page);
	await expect(addDialog.getByRole('heading', { name: 'Add songs' })).toBeVisible();
	await dialogRowByTitle(page, AMAZING_GRACE_TITLE).click();
	await expect(dialogRowByTitle(page, AMAZING_GRACE_TITLE)).toHaveAttribute('aria-checked', 'true');
	await dialogRowByTitle(page, ROCK_OF_AGES_TITLE).click();
	await expect(dialogRowByTitle(page, ROCK_OF_AGES_TITLE)).toHaveAttribute('aria-checked', 'true');
	// Close via Escape — the sheet has no explicit close button (native
	// <dialog> Escape handling, see src/lib/ui/Sheet.svelte).
	await page.keyboard.press('Escape');
	await expect(page.locator('dialog[open]')).toHaveCount(0);

	// Added in click order: Amazing Grace first, Rock of Ages second.
	await expect(rowByTitle(page, AMAZING_GRACE_TITLE)).toBeVisible();
	await expect(rowByTitle(page, ROCK_OF_AGES_TITLE)).toBeVisible();
	expect(await rowTop(rowByTitle(page, AMAZING_GRACE_TITLE))).toBeLessThan(
		await rowTop(rowByTitle(page, ROCK_OF_AGES_TITLE))
	);

	// --- Reorder: move up/down are disabled (not hidden) at the ends --------
	await rowByTitle(page, AMAZING_GRACE_TITLE)
		.getByRole('button', { name: `Song options for ${AMAZING_GRACE_TITLE}` })
		.click();
	const firstRowOptions = openDialog(page);
	await expect(firstRowOptions.getByRole('button', { name: 'Move up' })).toBeDisabled();
	await expect(firstRowOptions.getByRole('button', { name: 'Move down' })).toBeEnabled();
	await firstRowOptions.getByRole('button', { name: 'Move down' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);

	// Order flipped: Rock of Ages now first.
	expect(await rowTop(rowByTitle(page, ROCK_OF_AGES_TITLE))).toBeLessThan(
		await rowTop(rowByTitle(page, AMAZING_GRACE_TITLE))
	);

	await rowByTitle(page, AMAZING_GRACE_TITLE)
		.getByRole('button', { name: `Song options for ${AMAZING_GRACE_TITLE}` })
		.click();
	const lastRowOptions = openDialog(page);
	await expect(lastRowOptions.getByRole('button', { name: 'Move down' })).toBeDisabled();
	await expect(lastRowOptions.getByRole('button', { name: 'Move up' })).toBeEnabled();
	await page.keyboard.press('Escape');
	await expect(page.locator('dialog[open]')).toHaveCount(0);

	// --- Open a song from the set --------------------------------------------
	await rowByTitle(page, ROCK_OF_AGES_TITLE).click();
	await page.waitForURL(/\/song\//);
	await expect(page.getByRole('heading', { name: ROCK_OF_AGES_TITLE })).toBeVisible();

	// Back to the collection via a direct deep link (also exercises the
	// found-collection path of the same route the not-found spec covers).
	await page.goto(`/collection/${collectionId}`);
	await expect(page.getByRole('heading', { name: COLLECTION_NAME })).toBeVisible({
		timeout: 10_000
	});

	// --- Remove one song ------------------------------------------------------
	await rowByTitle(page, AMAZING_GRACE_TITLE)
		.getByRole('button', { name: `Song options for ${AMAZING_GRACE_TITLE}` })
		.click();
	await openDialog(page).getByRole('button', { name: 'Remove from collection' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(rowByTitle(page, AMAZING_GRACE_TITLE)).toHaveCount(0);
	await expect(rowByTitle(page, ROCK_OF_AGES_TITLE)).toBeVisible();

	// --- Delete the collection ------------------------------------------------
	await page.getByRole('button', { name: 'Back to Library' }).first().click();
	await page.waitForURL(/\/library/);
	await page.getByRole('button', { name: 'Collections', exact: true }).click();
	await expect(rowByTitle(page, COLLECTION_NAME)).toBeVisible();

	await rowByTitle(page, COLLECTION_NAME)
		.getByRole('button', { name: 'Collection options' })
		.click();
	await openDialog(page).getByRole('button', { name: 'Delete', exact: true }).click();
	const confirmDialog = openDialog(page);
	await expect(confirmDialog).toContainText('kept in your library');
	await confirmDialog.getByRole('button', { name: 'Delete collection' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(rowByTitle(page, COLLECTION_NAME)).toHaveCount(0);

	// --- Songs survive in the library ------------------------------------------
	await page.getByRole('button', { name: 'Songs', exact: true }).click();
	await expect(rowByTitle(page, AMAZING_GRACE_TITLE)).toBeVisible({ timeout: 10_000 });
	await expect(rowByTitle(page, ROCK_OF_AGES_TITLE)).toBeVisible();
});

// Review fix during task E3: `loaded` was true before the query existed,
// flashing "not found" before the live query even ran. A stale/bad deep link
// (a collection deleted elsewhere, a typo, a bookmark) must render the real
// not-found state, not a crash or an infinite spinner.
test('collection: a deep link to a nonexistent id shows the not-found state', async ({
	page
}: {
	page: Page;
}) => {
	await page.goto('/collection/does-not-exist-e4-spec');

	await expect(page.getByRole('heading', { name: 'Collection not found' })).toBeVisible({
		timeout: 10_000
	});
	await expect(page.getByText('This collection may have been deleted.')).toBeVisible();

	await page.getByRole('button', { name: 'Back to Library' }).first().click();
	await page.waitForURL(/\/library/);
});
