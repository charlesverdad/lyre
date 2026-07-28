import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { AMAZING_GRACE_CHART, AMAZING_GRACE_TITLE } from './fixtures/amazing-grace';
import { addSongViaPaste } from './helpers';

const SAVED_BADGE = 'Capo 1 · G shapes · sounds in Ab';
const TRANSPOSED_BADGE = 'Capo 2 · G shapes · sounds in A';

/**
 * Open the transpose sheet, tap the "A" key chip ("play in key" — the
 * pasted chart is Ab/G/capo-1, so this reaches the same A/G/capo-2
 * destination as the old semitone-stepper walkthrough), then tap the "G"
 * shape chip ("with shape") — the two-question flow task D3 redesigned
 * the sheet around: pick a key, pick a shape, the capo is the answer.
 */
async function openAndPickKeyAndShape(page: Page): Promise<void> {
	await page.getByRole('button', { name: SAVED_BADGE }).click();
	await expect(page.getByRole('heading', { name: 'Transpose' })).toBeVisible();

	await page.getByRole('button', { name: 'Play in key A', exact: true }).click();
	await expect(page.getByText('Capo 2', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'G shapes · capo 2', exact: true }).click();
	await expect(page.getByText('G shapes · sounds in A', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await addSongViaPaste(page, { title: AMAZING_GRACE_TITLE, chartText: AMAZING_GRACE_CHART });
	await expect(page.getByRole('button', { name: SAVED_BADGE })).toBeVisible();
});

test('"Just for now" changes the on-screen badge without touching the saved pattern', async ({
	page
}) => {
	await openAndPickKeyAndShape(page);
	await page.getByRole('button', { name: 'Just for now' }).click();

	await expect(page.getByRole('button', { name: TRANSPOSED_BADGE })).toBeVisible();

	// Reloading re-derives the working pattern from the *saved* pattern —
	// the "just for now" transpose was session-only.
	await page.reload();
	await expect(page.getByRole('button', { name: SAVED_BADGE })).toBeVisible();
});

test('"Save as my pattern" persists the transpose across reloads', async ({ page }) => {
	await openAndPickKeyAndShape(page);
	await page.getByRole('button', { name: 'Save as my pattern' }).click();

	await expect(page.getByRole('button', { name: TRANSPOSED_BADGE })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('button', { name: TRANSPOSED_BADGE })).toBeVisible();
});

test('picking a key that would push the current shape past capo 9 auto-switches to a playable shape', async ({
	page
}) => {
	// Saved pattern is G shapes. F# (6) - G (7) mod 12 = 11 — unplayable. The
	// sheet must auto-switch off G rather than leave it selected-and-disabled
	// with an unplayable pattern one tap from being saved (review fix).
	await page.getByRole('button', { name: SAVED_BADGE }).click();
	await expect(page.getByRole('heading', { name: 'Transpose' })).toBeVisible();

	await page.getByRole('button', { name: 'Play in key F#', exact: true }).click();

	// F# (6): among comfort shapes available at capo <=9, E (capo 2) is
	// lowest, so it's the auto-switch pick.
	await expect(page.getByText('Capo 2', { exact: true })).toBeVisible();
	await expect(page.getByText('E shapes · sounds in F#', { exact: true })).toBeVisible();

	const saveButton = page.getByRole('button', { name: 'Save as my pattern' });
	await expect(saveButton).toBeEnabled();
});
