/**
 * Best-effort extractor for unknown "chords above lyrics" sites
 * (docs/mvp-spec.md F2: "a generic best-effort extractor for other
 * chords-above-lyrics pages"). No site-specific knowledge — just structural
 * heuristics, so it's the fallback the registry hands anything that isn't
 * pnwchords (and isn't Ultimate Guitar, which is excluded entirely).
 */

import { isChordLine } from '$lib/chart';
import type { AdapterExtract, SiteAdapter } from '../types';
import { extractMetaContent, extractTitleTag, htmlToText } from '../htmlUtils';

/** Minimum fraction of non-blank lines that must be chord lines for a text block to "look like" a chart. */
const MIN_CHORD_LINE_RATIO = 0.15;
/** Minimum absolute count of chord lines, so a single stray chord-looking token doesn't qualify a block. */
const MIN_CHORD_LINES = 2;

function nonBlankLines(text: string): string[] {
	return text.split('\n').filter((l) => l.trim() !== '');
}

/** True when `text`'s lines plausibly form a chord chart per the chart-parser's chord-line heuristic. */
function looksLikeChart(text: string): boolean {
	const lines = nonBlankLines(text);
	if (lines.length === 0) return false;
	const chordLines = lines.filter(isChordLine).length;
	return chordLines >= MIN_CHORD_LINES && chordLines / lines.length >= MIN_CHORD_LINE_RATIO;
}

/** Extract the content of every `<pre>...</pre>` block, tags stripped. */
function allPreBlocks(html: string): string[] {
	const re = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
	const blocks: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		blocks.push(htmlToText(m[1]).trim());
	}
	return blocks;
}

/**
 * Split whole-page text (tags already stripped) into paragraph-ish blocks on
 * runs of blank lines, for sites that don't use `<pre>` at all.
 */
function splitIntoBlocks(text: string): string[] {
	return text
		.split(/\n{2,}/)
		.map((b) => b.trim())
		.filter(Boolean);
}

function titleArtistFromMeta(html: string): { title?: string; artist?: string } {
	const ogTitle = extractMetaContent(html, 'og:title');
	const title = ogTitle ?? extractTitleTag(html);
	return { title };
}

function extractGeneric(html: string): AdapterExtract | null {
	const preBlocks = allPreBlocks(html);
	let chartText: string | undefined;

	if (preBlocks.length > 0) {
		// Prefer the largest <pre> block if any exist, regardless of whether it
		// "looks like" a chart — a page author who used <pre> for the chart is
		// a strong enough signal on its own.
		chartText = preBlocks.reduce((a, b) => (b.length > a.length ? b : a));
	} else {
		const bodyText = htmlToText(html);
		const candidates = splitIntoBlocks(bodyText).filter(looksLikeChart);
		if (candidates.length > 0) {
			chartText = candidates.reduce((a, b) => (b.length > a.length ? b : a));
		}
	}

	if (!chartText || !chartText.trim()) return null;

	const { title, artist } = titleArtistFromMeta(html);
	return { title, artist, chartText };
}

export const genericAdapter: SiteAdapter = {
	// The generic adapter has no fixed domain list — the registry falls back
	// to it for any domain not otherwise handled (and not excluded).
	domains: [],
	extract: extractGeneric
};
