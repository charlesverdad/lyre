import { expect, test } from '@playwright/test';

// mvp-spec.md F5: "One-tap export of the whole library to a zip of ChordPro
// files + a JSON manifest." (src/routes/(app)/settings/+page.svelte `doExport`).
test('settings: export library triggers a .zip download', async ({ page }) => {
	await page.goto('/settings');

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export library' }).click();
	const download = await downloadPromise;

	expect(download.suggestedFilename()).toMatch(/^lyre-library-\d{4}-\d{2}-\d{2}\.zip$/);
});
