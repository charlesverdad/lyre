/**
 * Shape-picker chip model for the transpose sheet (task D3, mvp-spec.md F3:
 * "Shape picker (C, D, E, G, A, + full chromatic list)"), redesigned around
 * the "play in key X, with shape Y, tell me the capo" mental model
 * (domain-model.md §1).
 *
 * Comfort-order shapes (G, C, D, A, E by default) come first, then the
 * remaining chromatic keys in canonical pitch-class order. Every option's
 * capo is computed up front (keeping `soundingKey` fixed, per
 * domain-model.md §1 intent 2) so every chip can show its capo inline —
 * "G · capo 2" — instead of hiding the math behind a separate suggestion
 * list. Options requiring an unplayable capo (> `maxCapo`, default 9) are
 * shown disabled with the capo number still visible rather than hidden
 * outright.
 */

import { derivePattern, DEFAULT_COMFORT_ORDER, suggestPatterns } from '$lib/theory/pattern';
import { allCanonicalKeyNames } from '$lib/theory/notes';

export interface ShapeOption {
	shapeKey: string;
	capo: number;
	/** True when `capo` exceeds `maxCapo` — render disabled with a "capo N" hint. */
	disabled: boolean;
	/**
	 * True on the single chip `suggestPatterns` ranks best for this sounding
	 * key (comfort order, then lowest capo) — the transpose sheet tags this
	 * chip "Suggested" so switching keys still surfaces the best shape at a
	 * glance, without a separate suggestion list (domain-model.md §4).
	 */
	suggested: boolean;
}

export interface ShapeOptionsParams {
	soundingKey: string;
	comfortOrder?: readonly string[];
	maxCapo?: number;
}

/** Ordered shape options for a fixed sounding key: comfort shapes first, then the rest. */
export function shapeOptions(params: ShapeOptionsParams): ShapeOption[] {
	const comfortOrder = params.comfortOrder ?? DEFAULT_COMFORT_ORDER;
	const maxCapo = params.maxCapo ?? 9;

	const rest = allCanonicalKeyNames().filter((key) => !comfortOrder.includes(key));
	const ordered = [...comfortOrder, ...rest];

	const best = suggestPatterns(params.soundingKey, { comfortOrder, maxCapo })[0];

	return ordered.map((shapeKey) => {
		const { capo } = derivePattern({ soundingKey: params.soundingKey, shapeKey });
		return { shapeKey, capo, disabled: capo > maxCapo, suggested: best?.shapeKey === shapeKey };
	});
}

export interface KeyOption {
	key: string;
	/**
	 * True when `key` is the chart's *original sounding key* — `song.defaultKey`
	 * (set from the initial grabbed/entered pattern's `soundingKey`), **not**
	 * `chart.sourceKey` (the shape key the chords are written in — those two
	 * only coincide when the chart was entered at capo 0). Getting this wrong
	 * tags the wrong "Play in key" chip "Original" (task D3 review fix).
	 */
	isOriginal: boolean;
}

/** All 12 sounding-key chips for the "Play in key" picker, original key tagged. */
export function keyOptions(originalSoundingKey: string): KeyOption[] {
	return allCanonicalKeyNames().map((key) => ({ key, isOriginal: key === originalSoundingKey }));
}
