import { expect, test } from '@playwright/test';

// mvp-spec.md acceptance walkthrough, step 1:
// "Open Lyre for the first time → empty library with an 'Add your first
// song' prompt."
test('fresh app redirects to /library and shows the empty state', async ({ page }) => {
	await page.goto('/');
	await page.waitForURL(/\/library/);

	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	// The empty state only renders once the library live query resolves
	// (`loaded` in +page.svelte), which itself waits on the root layout's
	// one-shot IndexedDB→localStorage migration check (task E1) — give it
	// a beat longer than the default 5s assertion timeout.
	await expect(page.locator('p', { hasText: 'Add your first song' })).toBeVisible({
		timeout: 10_000
	});
	await expect(
		page.getByRole('button', { name: 'Add your first song', exact: true })
	).toBeVisible();
});
