/**
 * Presentation helpers for play mode (task B3, mvp-spec.md F3).
 *
 * UI-free string formatting only — no DB access, no Svelte.
 */

import type { Pattern } from '$lib/theory/types';

/**
 * Render the pinned badge strip text, e.g. "Capo 2 · G shapes · sounds in A"
 * (mvp-spec.md F3). When `capo` is 0, `shapeKey` always equals `soundingKey`
 * (domain-model.md §1: `soundingKey = shapeKey + capo`), so the "shapes"
 * segment is redundant and dropped — matching the acceptance walkthrough's
 * "No capo · sounds in G" (mvp-spec.md, walkthrough step 5).
 */
export function formatBadge(pattern: Pick<Pattern, 'shapeKey' | 'capo' | 'soundingKey'>): string {
	if (pattern.capo === 0) {
		return `No capo · sounds in ${pattern.soundingKey}`;
	}
	return `Capo ${pattern.capo} · ${pattern.shapeKey} shapes · sounds in ${pattern.soundingKey}`;
}

/** Render a transpose-sheet suggestion row, e.g. "G shapes · capo 4". */
export function formatSuggestion(suggestion: Pick<Pattern, 'shapeKey' | 'capo'>): string {
	const capoText = suggestion.capo === 0 ? 'no capo' : `capo ${suggestion.capo}`;
	return `${suggestion.shapeKey} shapes · ${capoText}`;
}

/** Render the shape-picker disabled hint for an unplayable capo, e.g. "capo 11". */
export function formatCapoHint(capo: number): string {
	return `capo ${capo}`;
}

/**
 * Render the transpose sheet's big answer-line headline (task D3): "Capo 2",
 * or "No capo" when `capo` is 0.
 */
export function formatAnswerHeadline(pattern: Pick<Pattern, 'capo'>): string {
	return pattern.capo === 0 ? 'No capo' : `Capo ${pattern.capo}`;
}

/**
 * Render the transpose sheet's answer-line subline (task D3), e.g.
 * "G shapes · sounds in A". Drops the redundant "shapes" segment at capo 0,
 * same as `formatBadge`, since `shapeKey === soundingKey` in that case.
 */
export function formatAnswerSubline(
	pattern: Pick<Pattern, 'shapeKey' | 'capo' | 'soundingKey'>
): string {
	if (pattern.capo === 0) {
		return `sounds in ${pattern.soundingKey}`;
	}
	return `${pattern.shapeKey} shapes · sounds in ${pattern.soundingKey}`;
}

/** Render a shape chip's inline capo hint, e.g. "capo 2" or "no capo" at capo 0. */
export function formatChipCapo(capo: number): string {
	return capo === 0 ? 'no capo' : `capo ${capo}`;
}
