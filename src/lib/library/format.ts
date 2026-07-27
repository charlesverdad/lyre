/**
 * Presentation helpers for the Library screen (task B1, mvp-spec.md F1).
 *
 * UI-free string formatting only — no DB access, no Svelte. Kept separate
 * from `src/lib/db/repo.ts` so the repository layer stays free of
 * display-copy concerns.
 */

import type { PatternRecord } from '$lib/theory/types';

/**
 * Render a pattern the way the library row wants it, e.g.
 * "G shapes · capo 2 · A" (mvp-spec.md F1). `capo: 0` reads as "no capo"
 * rather than "capo 0".
 */
export function formatPatternSummary(
	pattern: Pick<PatternRecord, 'shapeKey' | 'capo' | 'soundingKey'>
): string {
	const capoText = pattern.capo === 0 ? 'no capo' : `capo ${pattern.capo}`;
	return `${pattern.shapeKey} shapes · ${capoText} · ${pattern.soundingKey}`;
}

/**
 * Combine a song's authors and (optional) pattern summary into the library
 * row subtitle: "authors · pattern summary". Falls back gracefully when
 * either half is missing (no authors listed, or no preferred pattern yet).
 */
export function formatSongSubtitle(authors: string[], patternSummary?: string): string {
	const authorsLine = authors.join(', ');
	if (!patternSummary) return authorsLine;
	if (!authorsLine) return patternSummary;
	return `${authorsLine} · ${patternSummary}`;
}
