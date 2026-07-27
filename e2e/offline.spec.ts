import { expect, test } from '@playwright/test';

// mvp-spec.md: "Fully offline after grab" / F3 "Works fully offline"
// (src/service-worker.ts). After the service worker has installed and
// claimed the page, going offline and reloading should still render the
// app shell from cache instead of a browser error page.
test('offline: app shell still renders after the first load', async ({ page, context }) => {
	await page.goto('/library');

	// Wait for the SW to actually control this page (registered onMount in
	// +layout.svelte; `clients.claim()` in the worker's `activate` handler
	// claims already-open clients without needing a second navigation).
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
		timeout: 15_000
	});

	// One more navigation while online so the network-first navigation
	// handler populates the cache for this exact URL, then the offline
	// reload below has something to serve.
	await page.reload();
	await page.waitForLoadState('networkidle');

	await context.setOffline(true);
	await page.reload();

	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
});
