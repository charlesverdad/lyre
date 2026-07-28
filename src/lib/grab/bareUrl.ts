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
