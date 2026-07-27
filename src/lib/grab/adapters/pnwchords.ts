/**
 * pnwchords.com adapter (docs/mvp-spec.md F2, docs/licensing-and-content.md).
 *
 * Page structure (verified against a real captured page, structure only —
 * see task notes, no lyrics committed to the repo):
 *  - The chart text lives inside the first `<pre data-key="...">...</pre>`.
 *  - A `<script type="application/ld+json">` (no wrapping `@graph`) declares
 *    `{"@type":"MusicRecording","name":"...","byArtist":{"name":"..."}}`.
 *  - `<title>`/`og:title` is typically "Song - Artist" as a fallback when the
 *    MusicRecording block is missing, occasionally suffixed "- pnwchords".
 */

import type { AdapterExtract, SiteAdapter } from '../types';
import {
	extractFirstTagContent,
	extractJsonLdBlocks,
	extractMetaContent,
	extractTitleTag,
	htmlToText
} from '../htmlUtils';

interface MusicRecordingLike {
	name?: string;
	byArtist?: { name?: string } | { name?: string }[];
}

/** Recursively search parsed JSON-LD (possibly `@graph`-wrapped) for a MusicRecording node. */
function findMusicRecording(nodes: unknown[]): MusicRecordingLike | null {
	for (const node of nodes) {
		if (node === null || typeof node !== 'object') continue;
		const obj = node as Record<string, unknown>;
		const type = obj['@type'];
		const isMusicRecording =
			type === 'MusicRecording' || (Array.isArray(type) && type.includes('MusicRecording'));
		if (isMusicRecording) return obj as MusicRecordingLike;
		if (Array.isArray(obj['@graph'])) {
			const found = findMusicRecording(obj['@graph'] as unknown[]);
			if (found) return found;
		}
	}
	return null;
}

function artistNameOf(byArtist: MusicRecordingLike['byArtist']): string | undefined {
	if (!byArtist) return undefined;
	if (Array.isArray(byArtist)) return byArtist[0]?.name;
	return byArtist.name;
}

/**
 * Fall back to `<title>`/og:title parsing: pnwchords titles are typically
 * "Song - Artist" or "Song - Artist - pnwchords". We can't reliably tell
 * song from artist by position alone, but pnwchords always puts the song
 * first, so split on " - " and treat the first segment as title, the next
 * (if not a "pnwchords" site-name suffix) as artist.
 */
function titleArtistFromTitleTag(html: string): { title?: string; artist?: string } {
	const raw = extractMetaContent(html, 'og:title') ?? extractTitleTag(html);
	if (!raw) return {};
	const parts = raw
		.split(' - ')
		.map((p) => p.trim())
		.filter(Boolean);
	if (parts.length === 0) return {};
	// Drop a trailing site-name segment like "pnwchords".
	const last = parts[parts.length - 1];
	if (parts.length > 1 && /pnwchords/i.test(last)) parts.pop();
	if (parts.length === 1) return { title: parts[0] };
	return { title: parts[0], artist: parts.slice(1).join(' - ') };
}

function extractPnwchords(html: string): AdapterExtract | null {
	const pre = extractFirstTagContent(html, 'pre', { requireAttr: 'data-key' });
	if (!pre) return null;

	const chartText = htmlToText(pre.content).replace(/^\n+|\s+$/g, '');
	if (!chartText.trim()) return null;

	const jsonLd = extractJsonLdBlocks(html);
	const musicRecording = findMusicRecording(jsonLd);

	let title = musicRecording?.name;
	let artist = artistNameOf(musicRecording?.byArtist);

	if (!title || !artist) {
		const fallback = titleArtistFromTitleTag(html);
		title = title ?? fallback.title;
		artist = artist ?? fallback.artist;
	}

	return { title, artist, chartText };
}

export const pnwchordsAdapter: SiteAdapter = {
	domains: ['pnwchords.com'],
	extract: extractPnwchords
};
