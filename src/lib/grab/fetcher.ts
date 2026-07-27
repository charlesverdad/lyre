/**
 * Fetch pipeline (docs/PLAN-v0.1.md task B4; docs/mvp-spec.md F2's CORS
 * note; docs/PLAN-v0.1.md "Grab-flow MVP decision"): direct client `fetch`
 * first, no proxy/relay — the v0.1 policy is stateless-or-nothing, and a
 * relay isn't stateless enough to be worth building yet. On CORS failure
 * (the *only* way a browser signals it: `fetch` rejects with a `TypeError`
 * and no distinguishing detail) the caller falls back to the guided-paste
 * flow, which reuses this same module's `grabFromHtml`.
 *
 * `cors-or-network` is reserved strictly for that caught-`TypeError` case.
 * A response that comes back non-2xx (404, 500, …) means the request itself
 * succeeded — CORS didn't block it — so it's reported as `http-error`
 * instead; routing a typo'd/broken link to "try pasting the page instead"
 * would be misleading, since pasting won't fix a 404.
 *
 * Rate-gentleness (docs/licensing-and-content.md item 3): one fetch per
 * `grabUrl` call, no retries. We don't spoof a `User-Agent` — browsers
 * control that header and reject attempts to set it from `fetch`; the
 * honest option is to just not try.
 */

import { buildGrabResult } from './pipeline';
import { resolveAdapter } from './registry';
import type { GrabResult } from './types';

export type GrabFailureReason =
	'cors-or-network' | 'http-error' | 'unsupported-site' | 'no-chart-found' | 'invalid-url';

export type GrabOutcome =
	{ ok: true; result: GrabResult } | { ok: false; reason: GrabFailureReason; detail?: string };

export type FetchImpl = typeof fetch;

export interface GrabUrlOptions {
	/** Injectable `fetch` for tests; defaults to the global `fetch`. */
	fetchImpl?: FetchImpl;
}

function nowIso(): string {
	return new Date().toISOString();
}

/**
 * Security gate (task SEC1 — javascript:-scheme URL XSS): `url` back only if
 * it parses and its scheme is `http:`/`https:`, else `undefined`. Anything
 * else — `javascript:`, `data:`, `vbscript:`, a bare string that isn't a URL
 * at all — must never reach a `fetch` call, an adapter, or (defense in
 * depth) an `<a href>` in the UI: a `javascript:` URL typed into the grab
 * box would previously fail `fetch` with a `TypeError` (mapped to
 * `cors-or-network`), which auto-opened the guided-paste sheet's "Open the
 * page" link — clicking it ran attacker script in-origin, full IndexedDB
 * access. Exported so `GrabInput.svelte`/`add/+page.svelte` can gate their
 * `<a href>`s with the exact same rule `grabUrl`/`grabFromHtml` enforce.
 */
export function safeHttpUrl(url: string): string | undefined {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined;
}

/**
 * Run the shared extract -> parse -> assemble pipeline against already-fetched
 * `html`. Returns `no-chart-found` when the resolved adapter can't locate a
 * chart in the page.
 */
function extractOutcome(html: string, url: string): GrabOutcome {
	const lookup = resolveAdapter(url);
	if (lookup.kind === 'excluded') {
		return { ok: false, reason: lookup.error.reason, detail: lookup.error.message };
	}

	const extract = lookup.adapter.extract(html, url);
	if (!extract || !extract.chartText.trim()) {
		return { ok: false, reason: 'no-chart-found' };
	}

	let sourceSite: string;
	try {
		sourceSite = new URL(url).hostname;
	} catch {
		sourceSite = url;
	}

	const result = buildGrabResult(extract, { sourceUrl: url, sourceSite, fetchedAt: nowIso() });
	return { ok: true, result };
}

/**
 * Fetch `url` and run it through the grab pipeline. Direct fetch only, no
 * proxy — a `fetch` `TypeError` (the CORS failure signature browsers give)
 * is reported as `cors-or-network` so callers can route to the paste flow.
 * A non-2xx response (the request succeeded, the server said no) is
 * reported as `http-error` instead — CORS/network already worked, so the
 * paste-flow suggestion wouldn't help.
 */
export async function grabUrl(url: string, opts: GrabUrlOptions = {}): Promise<GrabOutcome> {
	if (!safeHttpUrl(url)) {
		return { ok: false, reason: 'invalid-url' };
	}

	const lookup = resolveAdapter(url);
	if (lookup.kind === 'excluded') {
		return { ok: false, reason: lookup.error.reason, detail: lookup.error.message };
	}

	const doFetch = opts.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await doFetch(url, { headers: { Accept: 'text/html' } });
	} catch (err) {
		// A browser `fetch` rejects with `TypeError: Failed to fetch` (or
		// equivalent) for both CORS blocks and genuine network failures —
		// there's no way to tell them apart from the client, hence the
		// combined reason.
		if (err instanceof TypeError) {
			return { ok: false, reason: 'cors-or-network', detail: err.message };
		}
		throw err;
	}

	if (!response.ok) {
		return {
			ok: false,
			reason: 'http-error',
			detail: `HTTP ${response.status} ${response.statusText}`
		};
	}

	const html = await response.text();
	return extractOutcome(html, url);
}

/**
 * Same pipeline as `grabUrl` minus the fetch — for the guided-paste
 * fallback, where the user pastes either the page's HTML source or just the
 * copied chart text directly. If `html` has no HTML tags at all, it's
 * treated as raw chart text (skips adapter extraction entirely, since
 * there's no markup to extract from).
 */
export function grabFromHtml(html: string, url: string): GrabOutcome {
	if (!safeHttpUrl(url)) {
		return { ok: false, reason: 'invalid-url' };
	}

	const looksLikeHtml = /<[a-z!][^>]*>/i.test(html);
	if (!looksLikeHtml) {
		// Raw pasted chart text, not markup — this *is* the sanctioned paste
		// flow (docs/licensing-and-content.md item 4's escape hatch for sites
		// like Ultimate Guitar that get no adapter), so the site-exclusion
		// check below (which guards against running an adapter over excluded
		// sites' HTML) doesn't apply here: there's no HTML to run an adapter
		// against, just the text the user chose to type or paste in.
		let sourceSite: string;
		try {
			sourceSite = new URL(url).hostname;
		} catch {
			sourceSite = url;
		}
		if (!html.trim()) return { ok: false, reason: 'no-chart-found' };
		const result = buildGrabResult(
			{ chartText: html },
			{ sourceUrl: url, sourceSite, fetchedAt: nowIso() }
		);
		return { ok: true, result };
	}

	return extractOutcome(html, url);
}
