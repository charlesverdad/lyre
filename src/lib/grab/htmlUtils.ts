/**
 * Tiny HTML text-extraction helpers shared by adapters. Deliberately not a
 * full HTML parser (no DOM dependency) — the grabber library must work in
 * vitest's node environment as well as the browser, and a real browser
 * `fetch` of a chart page just needs "get me the text of this one block."
 *
 * DOM usage (for accurate entity decoding) is isolated behind a feature
 * check so the same code path degrades gracefully under Node.
 */

/** Common numeric/named HTML entities chord sites emit (curly quotes, dashes, ampersand, nbsp). */
const ENTITY_MAP: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	'#8211': '–', // en dash
	'#8212': '—', // em dash
	'#8216': '‘', // left single quote
	'#8217': '’', // right single quote (the common "&#8217;" apostrophe)
	'#8220': '“', // left double quote
	'#8221': '”', // right double quote
	'#8230': '…' // ellipsis
};

function decodeEntitiesFallback(s: string): string {
	return s.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
		if (entity[0] === '#') {
			const known = ENTITY_MAP[entity];
			if (known !== undefined) return known;
			const codePoint =
				entity[1] === 'x' || entity[1] === 'X'
					? parseInt(entity.slice(2), 16)
					: parseInt(entity.slice(1), 10);
			if (Number.isFinite(codePoint)) {
				try {
					return String.fromCodePoint(codePoint);
				} catch {
					return match;
				}
			}
			return match;
		}
		return ENTITY_MAP[entity.toLowerCase()] ?? match;
	});
}

/** True when running in an environment with a working `DOMParser` (browser, not vitest/node). */
function hasDomParser(): boolean {
	return typeof DOMParser !== 'undefined';
}

/**
 * Decode HTML entities in `s`. Uses `DOMParser` when available (handles the
 * full named-entity table correctly); otherwise falls back to a small map of
 * the entities chord sites actually emit plus generic numeric/hex entities.
 */
export function decodeHtmlEntities(s: string): string {
	if (hasDomParser()) {
		try {
			const doc = new DOMParser().parseFromString(s, 'text/html');
			return doc.documentElement.textContent ?? s;
		} catch {
			// Fall through to the manual decoder.
		}
	}
	return decodeEntitiesFallback(s);
}

/** Strip HTML tags from `html`, decoding entities in what remains. Collapses `<br>`/block tags to newlines. */
export function htmlToText(html: string): string {
	const withBreaks = html
		.replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
		.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
	const stripped = withBreaks.replace(/<[^>]+>/g, '');
	return decodeHtmlEntities(stripped);
}

/**
 * Extract the inner HTML of the first `<TAG ...attrs...>...</TAG>` matching
 * `tag`, optionally requiring a specific attribute to be present. Returns
 * null if not found. Not a general HTML parser — assumes non-nested tags of
 * the same name (true for `<pre>`, which never nests).
 */
export function extractFirstTagContent(
	html: string,
	tag: string,
	opts: { requireAttr?: string } = {}
): { content: string; attrs: string } | null {
	const openRe = new RegExp(`<${tag}\\b([^>]*)>`, 'i');
	const openMatch = openRe.exec(html);
	if (!openMatch) return null;
	if (opts.requireAttr && !new RegExp(`\\b${opts.requireAttr}\\b`, 'i').test(openMatch[1])) {
		// Look for a later occurrence that does have the attribute.
		const re = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
		let m: RegExpExecArray | null;
		while ((m = re.exec(html))) {
			if (new RegExp(`\\b${opts.requireAttr}\\b`, 'i').test(m[1])) {
				const closeIdx = html.slice(re.lastIndex).search(new RegExp(`</${tag}\\s*>`, 'i'));
				if (closeIdx === -1) return null;
				return { content: html.slice(re.lastIndex, re.lastIndex + closeIdx), attrs: m[1] };
			}
		}
		return null;
	}
	const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
	const rest = html.slice(openMatch.index + openMatch[0].length);
	const closeMatch = closeRe.exec(rest);
	if (!closeMatch) return null;
	return { content: rest.slice(0, closeMatch.index), attrs: openMatch[1] };
}

/** Extract the value of `<meta property|name="key" content="...">`. */
export function extractMetaContent(html: string, key: string): string | undefined {
	const re = new RegExp(
		`<meta\\s+[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>`,
		'i'
	);
	const m = re.exec(html);
	if (m) return decodeHtmlEntities(m[1]);
	// content before property/name (attribute order varies).
	const re2 = new RegExp(
		`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["'][^>]*>`,
		'i'
	);
	const m2 = re2.exec(html);
	return m2 ? decodeHtmlEntities(m2[1]) : undefined;
}

/** Extract `<title>...</title>` text content. */
export function extractTitleTag(html: string): string | undefined {
	const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	return m ? decodeHtmlEntities(m[1]).trim() : undefined;
}

/**
 * Find all `<script type="application/ld+json" ...>...</script>` blocks and
 * return their parsed JSON, skipping any that fail to parse.
 */
export function extractJsonLdBlocks(html: string): unknown[] {
	const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	const results: unknown[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		try {
			results.push(JSON.parse(m[1]));
		} catch {
			// Malformed JSON-LD — skip it rather than fail the whole extraction.
		}
	}
	return results;
}
