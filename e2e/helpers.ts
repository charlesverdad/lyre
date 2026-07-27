import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Drive the paste flow (src/routes/(app)/add/+page.svelte) end to end: fill
 * in the paste textarea + required title, wait for the preview to render,
 * and save. Returns once the app has navigated to `/song/<id>`.
 */
export async function addSongViaPaste(
	page: Page,
	options: { title: string; authors?: string; chartText: string }
): Promise<void> {
	await page.goto('/add');
	await page.getByPlaceholder(/paste a chart/i).fill(options.chartText);

	// The preview + metadata form only render once the paste parses.
	await expect(page.getByText('Preview', { exact: true })).toBeVisible();

	await page.getByPlaceholder('Song title').fill(options.title);
	if (options.authors) {
		await page.getByPlaceholder(/comma-separated/i).fill(options.authors);
	}
	await expect(page.getByPlaceholder('Song title')).toHaveValue(options.title);

	const saveButton = page.getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();

	await page.waitForURL(/\/song\//);
}
