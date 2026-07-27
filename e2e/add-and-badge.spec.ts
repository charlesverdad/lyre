import { expect, test } from '@playwright/test';
import {
	AMAZING_GRACE_AUTHOR,
	AMAZING_GRACE_CHART,
	AMAZING_GRACE_TITLE
} from './fixtures/amazing-grace';

// mvp-spec.md acceptance walkthrough, step 2 (adapted to the paste flow —
// grabbing a live URL isn't reproducible in CI): paste a chart whose header
// states "Original in Ab. Capo 1, play in G." → preview appears → save →
// lands on /song/<id> with the header pattern as the initial badge.
test('paste flow: preview, save, and the resulting badge', async ({ page }) => {
	await page.goto('/add');

	await page.getByPlaceholder(/paste a chart/i).fill(AMAZING_GRACE_CHART);

	// Preview renders the parsed chart before any metadata is filled in.
	await expect(page.getByText('Preview', { exact: true })).toBeVisible();
	await expect(page.getByText('Amazing grace, how sweet the sound')).toBeVisible();

	// The pasted header ("Original in Ab. Capo 1, play in G.") prefills the
	// pattern chip next to the key picker before save (formatPatternSummary,
	// src/lib/library/format.ts — a different string shape than the play-mode
	// badge, which uses formatBadge instead).
	await expect(page.getByText('G shapes · capo 1 · Ab')).toBeVisible();

	await page.getByPlaceholder('Song title').fill(AMAZING_GRACE_TITLE);
	await page.getByPlaceholder(/comma-separated/i).fill(AMAZING_GRACE_AUTHOR);

	const saveButton = page.getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();

	await page.waitForURL(/\/song\//);
	await expect(page.getByRole('heading', { name: AMAZING_GRACE_TITLE })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Capo 1 · G shapes · sounds in Ab' })
	).toBeVisible();
});
