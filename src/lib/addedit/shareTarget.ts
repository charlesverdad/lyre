/**
 * Handoff for the PWA share target (task D1, mvp-spec.md F2: "share the page
 * to Lyre from the browser"). `/share` (`src/routes/(app)/share/+page.ts`)
 * receives the OS share sheet's GET params, stashes whatever it got here,
 * and immediately redirects to `/add`; the add page consumes the stash on
 * mount to auto-trigger the grab flow (a shared `url`) or prefill the paste
 * box (shared `text`, e.g. a browser's "share selected text").
 *
 * `sessionStorage` (not a query param) carries the payload across that
 * redirect: it survives exactly one navigation within the tab, which is all
 * a share hand-off needs, without leaking the shared URL/text into `/add`'s
 * own address bar history.
 */

const URL_KEY = 'lyre:share-url';
const TEXT_KEY = 'lyre:share-text';

export interface ShareTargetPayload {
	url?: string;
	text?: string;
}

/** Stash a share payload for `/add` to pick up after redirect. Silently a no-op if `sessionStorage` is unavailable. */
export function stashShareTarget(payload: ShareTargetPayload): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		if (payload.url) sessionStorage.setItem(URL_KEY, payload.url);
		if (payload.text) sessionStorage.setItem(TEXT_KEY, payload.text);
	} catch {
		// Storage unavailable (private browsing, quota) — the add page just
		// won't auto-prefill; share still works as a plain "open the app" tap.
	}
}

/** Read and clear any stashed share payload. Returns `{}` if none is pending or storage is unavailable. */
export function consumeShareTarget(): ShareTargetPayload {
	if (typeof sessionStorage === 'undefined') return {};
	try {
		const url = sessionStorage.getItem(URL_KEY) ?? undefined;
		const text = sessionStorage.getItem(TEXT_KEY) ?? undefined;
		sessionStorage.removeItem(URL_KEY);
		sessionStorage.removeItem(TEXT_KEY);
		return { url, text };
	} catch {
		return {};
	}
}
