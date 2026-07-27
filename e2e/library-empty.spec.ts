import { expect, test } from '@playwright/test';

// mvp-spec.md acceptance walkthrough, step 1:
// "Open Lyre for the first time → empty library with an 'Add your first
// song' prompt."
test('fresh app redirects to /library and shows the empty state', async ({ page }) => {
	await page.goto('/');
	await page.waitForURL(/\/library/);

	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	// The empty state only renders once Dexie's live query resolves (`loaded`
	// in +page.svelte) — a cold IndexedDB open on a fresh context can take a
	// beat longer than the default 5s assertion timeout.
	await expect(page.locator('p', { hasText: 'Add your first song' })).toBeVisible({
		timeout: 10_000
	});
	await expect(
		page.getByRole('button', { name: 'Add your first song', exact: true })
	).toBeVisible();
});
