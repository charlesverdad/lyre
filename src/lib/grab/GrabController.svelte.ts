/**
 * Shared grab-outcome state machine, factored out of `GrabInput.svelte`
 * (task D1) so the add page's main paste textarea can drive the exact same
 * "fetch a URL -> success prefill / CORS fallback opens the guided-paste
 * sheet" flow when a bare URL gets pasted there, instead of duplicating
 * `GrabInput`'s logic. `GrabInput.svelte` owns the instance (so its inputs
 * stay in sync with its own Sheet UI); the add page reaches into the same
 * instance via a prop to trigger `grab()` from the main textarea's paste
 * handler.
 */

import { grabFromHtml, grabUrl, type GrabFailureReason } from './fetcher';
import type { GrabResult } from './types';

function httpStatusMessage(detail: string | undefined): string {
	const code = detail?.match(/HTTP (\d+)/)?.[1];
	return code
		? `Page not found (HTTP ${code}) — check the link.`
		: 'Page not found — check the link.';
}

/** Per-failure-reason copy shown to the user (shared by the URL field's inline error and the paste sheet's). */
export function messageFor(reason: GrabFailureReason, detail: string | undefined): string {
	switch (reason) {
		case 'http-error':
			return httpStatusMessage(detail);
		case 'unsupported-site':
			return detail ?? 'This site is not supported for grabbing.';
		case 'no-chart-found':
			return "Couldn't find a chart on that page — check the link, or paste the chart text below.";
		case 'cors-or-network':
			return "Couldn't fetch that page automatically — paste it in below instead.";
		case 'invalid-url':
			return "That doesn't look like a web address — paste an http(s) link.";
	}
}

export class GrabController {
	url = $state('');
	grabbing = $state(false);
	errorReason = $state<GrabFailureReason | undefined>();
	errorDetail = $state<string | undefined>();

	pasteSheetOpen = $state(false);
	pastedHtml = $state('');
	pasteError = $state<string | undefined>();

	constructor(private onGrabbed: (result: GrabResult) => void) {}

	private resetError() {
		this.errorReason = undefined;
		this.errorDetail = undefined;
	}

	private accept(result: GrabResult) {
		this.resetError();
		this.pasteSheetOpen = false;
		this.pastedHtml = '';
		this.pasteError = undefined;
		this.onGrabbed(result);
	}

	/**
	 * Fetch `urlOverride ?? this.url` and run the grab pipeline. Passing
	 * `urlOverride` also sets `this.url` to it, so the URL field and paste
	 * sheet's "Open the page" link stay correct when this is triggered from
	 * somewhere other than the URL field itself (the main textarea's bare-URL
	 * paste detection).
	 */
	async grab(urlOverride?: string): Promise<void> {
		if (urlOverride !== undefined) this.url = urlOverride;
		const trimmed = this.url.trim();
		if (!trimmed || this.grabbing) return;
		this.grabbing = true;
		this.resetError();
		try {
			const outcome = await grabUrl(trimmed);
			if (outcome.ok) {
				this.accept(outcome.result);
				return;
			}
			this.errorReason = outcome.reason;
			this.errorDetail = outcome.detail;
			if (outcome.reason === 'cors-or-network') {
				this.pasteSheetOpen = true;
			}
		} finally {
			this.grabbing = false;
		}
	}

	openPasteSheet(): void {
		this.pasteError = undefined;
		this.pasteSheetOpen = true;
	}

	submitPaste(): void {
		const outcome = grabFromHtml(this.pastedHtml, this.url.trim());
		if (outcome.ok) {
			this.accept(outcome.result);
			return;
		}
		this.pasteError = messageFor(outcome.reason, outcome.detail);
	}
}
