/**
 * "Is this pasted text just a URL?" detection (task D1, mvp-spec.md F2:
 * "would be nice if just the URL can be pasted and it would crawl itself").
 * Used by the add page's main paste textarea to auto-trigger the same
 * grab flow `GrabInput` uses, without also catching a multi-line paste that
 * merely *contains* a URL somewhere (e.g. a chart with a source-credit link
 * in it) — those are meant to fall through to the normal paste-and-parse
 * path instead.
 */

import { safeHttpUrl } from './fetcher';

/**
 * True when `text`, trimmed, is a single line that parses as a bare
 * `http(s)` URL and nothing else. Any internal whitespace (including a
 * newline) disqualifies it — this is meant to catch "the user pasted just a
 * link", not "there happens to be a link somewhere in this paste".
 */
export function isBareUrl(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed || /\s/.test(trimmed)) return false;
	return safeHttpUrl(trimmed) !== undefined;
}

/**
 * Gate for the main paste textarea's `onpaste` handler (review fix, PR #19):
 * a bare-URL paste should only auto-trigger the grab flow when the paste box
 * is still effectively empty. Pasting a URL over/into existing chart text
 * (e.g. the user is mid-edit, or added a source-credit link to an
 * already-pasted chart) must insert normally instead of silently blowing
 * away what's already there.
 */
export function shouldAutoGrabPastedUrl(currentText: string, pastedText: string): boolean {
	return currentText.trim() === '' && isBareUrl(pastedText);
}

/** Result of classifying Android `ACTION_SEND` shared text — see `resolveSharedText`. */
export interface SharedTextResolution {
	/** Set when a grabbable URL was found — either the whole text, or one found embedded in it. */
	url?: string;
	/** Set when there's no URL to grab; the raw text to prefill the paste box with instead. */
	text?: string;
}

/**
 * First `http(s)` URL substring found in `text`, trimmed of any trailing
 * punctuation a sentence would tack on ("...see https://example.com/song."
 * shouldn't grab a trailing '.'). Not exported — `resolveSharedText` is the
 * public entry point; this is just its embedded-URL search step.
 */
function findEmbeddedUrl(text: string): string | undefined {
	const match = text.match(/https?:\/\/\S+/);
	if (!match) return undefined;
	// Strip trailing characters that are almost always sentence punctuation
	// rather than part of the URL, one at a time (handles "(link)." style
	// wrapping without needing to balance brackets).
	let candidate = match[0];
	while (candidate.length > 0 && /[).,;:!?\]}'"]$/.test(candidate)) {
		candidate = candidate.slice(0, -1);
	}
	return safeHttpUrl(candidate);
}

/**
 * Classify Android's `ACTION_SEND` `EXTRA_TEXT` payload (task F2,
 * docs/PLAN-v0.4.md — the native share-to-app entry point) into the same
 * `{ url, text }` shape the PWA's web share-target route already produces
 * (`src/lib/addedit/shareTarget.ts`), so both paths hand off to `/add`
 * identically.
 *
 * Unlike `isBareUrl` (deliberately strict — it gates auto-grabbing a paste
 * *over* existing paste-box text, where being wrong would silently destroy
 * the user's work), this is deliberately lenient: a native share's
 * `EXTRA_TEXT` is the *entirety* of what the user chose to share, so a URL
 * anywhere in it ("Check this out: https://pnwchords.com/song") is worth
 * grabbing — there's no existing content it could clobber. Falls back to
 * treating the whole trimmed text as chart-paste text when no URL is found;
 * `deriveChartParseState` (`src/lib/addedit/parseState.ts`) already runs
 * noisy-paste region extraction on that, so a raw page-text share still
 * lands on a useful preview.
 */
export function resolveSharedText(raw: string): SharedTextResolution {
	const trimmed = raw.trim();
	if (!trimmed) return {};
	const url = safeHttpUrl(trimmed) ?? findEmbeddedUrl(trimmed);
	return url ? { url } : { text: trimmed };
}
