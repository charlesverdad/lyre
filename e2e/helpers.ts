import type { Locator, Page } from '@playwright/test';
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

/**
 * Locate a `ListItem` row by its exact title, scoped to exclude any button
 * nested inside a `<dialog>` — a `Sheet`'s content stays mounted (just
 * CSS-hidden) while closed, so an unscoped text/role locator can silently
 * match a *closed* sheet's copy of the same row instead of the real,
 * on-page one (e.g. a song that also appears in the collection screen's
 * "Add songs" sheet, or a collection whose rename/delete sheet shares its
 * name) — see `.claude/LEARNINGS.md`'s task E3 notes on this exact hazard.
 * Use this for every library/collection row lookup outside a sheet, and
 * `dialogRowByTitle` below for rows *inside* the currently-open sheet.
 */
export function rowByTitle(page: Page, title: string): Locator {
	return page.locator(
		`xpath=//button[not(ancestor::dialog)][.//span[normalize-space(text())=${JSON.stringify(title)}]]`
	);
}

/** Same idea as `rowByTitle`, but scoped to the currently-open sheet (e.g. the "Add songs" checklist). */
export function dialogRowByTitle(page: Page, title: string): Locator {
	return page
		.locator('dialog[open]')
		.locator(`xpath=.//button[.//span[normalize-space(text())=${JSON.stringify(title)}]]`);
}

/** The currently-open `Sheet`, scoped so a click can never silently land on a closed one. */
export function openDialog(page: Page): Locator {
	return page.locator('dialog[open]');
}
