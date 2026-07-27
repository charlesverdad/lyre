import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { AMAZING_GRACE_CHART, AMAZING_GRACE_TITLE } from './fixtures/amazing-grace';
import { addSongViaPaste } from './helpers';

const SAVED_BADGE = 'Capo 1 · G shapes · sounds in Ab';
const TRANSPOSED_BADGE = 'Capo 2 · G shapes · sounds in A';

/**
 * Open the transpose sheet, step the sounding key up one semitone
 * (Ab → A per domain-model.md §1 pitch-class math), and pick the
 * "G shapes · capo 2" suggestion — the exact sequence in mvp-spec.md's
 * acceptance walkthrough (steps 3 and 5, adapted: the spec's example goes
 * G→A directly since it starts from a G source; here we start from the
 * pasted Ab/G/capo-1 pattern and step up once to reach the same A/G/capo-2
 * destination).
 */
async function openAndPickTransposeSuggestion(page: Page): Promise<void> {
	await page.getByRole('button', { name: SAVED_BADGE }).click();
	await expect(page.getByRole('heading', { name: 'Transpose' })).toBeVisible();

	await page.getByRole('button', { name: 'Step sounding key up a semitone' }).click();
	await expect(page.getByText('Sounds in A', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'G shapes · capo 2', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
	await addSongViaPaste(page, { title: AMAZING_GRACE_TITLE, chartText: AMAZING_GRACE_CHART });
	await expect(page.getByRole('button', { name: SAVED_BADGE })).toBeVisible();
});

test('"Just for now" changes the on-screen badge without touching the saved pattern', async ({
	page
}) => {
	await openAndPickTransposeSuggestion(page);
	await page.getByRole('button', { name: 'Just for now' }).click();

	await expect(page.getByRole('button', { name: TRANSPOSED_BADGE })).toBeVisible();

	// Reloading re-derives the working pattern from the *saved* pattern —
	// the "just for now" transpose was session-only.
	await page.reload();
	await expect(page.getByRole('button', { name: SAVED_BADGE })).toBeVisible();
});

test('"Save as my pattern" persists the transpose across reloads', async ({ page }) => {
	await openAndPickTransposeSuggestion(page);
	await page.getByRole('button', { name: 'Save as my pattern' }).click();

	await expect(page.getByRole('button', { name: TRANSPOSED_BADGE })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('button', { name: TRANSPOSED_BADGE })).toBeVisible();
});
