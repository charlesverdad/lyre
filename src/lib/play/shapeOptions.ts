/**
 * Shape-picker option list for the transpose sheet (task B3, mvp-spec.md F3:
 * "Shape picker (C, D, E, G, A, + full chromatic list)").
 *
 * Comfort-order shapes (G, C, D, A, E by default) come first, then the
 * remaining chromatic keys in canonical pitch-class order. Every option's
 * capo is computed up front (keeping `soundingKey` fixed, per
 * domain-model.md §1 intent 2) so options requiring an unplayable capo
 * (> `maxCapo`, default 9) can be shown disabled with a hint rather than
 * hidden outright.
 */

import { derivePattern, DEFAULT_COMFORT_ORDER } from '$lib/theory/pattern';
import { allCanonicalKeyNames } from '$lib/theory/notes';

export interface ShapeOption {
	shapeKey: string;
	capo: number;
	/** True when `capo` exceeds `maxCapo` — render disabled with a "capo N" hint. */
	disabled: boolean;
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

	return ordered.map((shapeKey) => {
		const { capo } = derivePattern({ soundingKey: params.soundingKey, shapeKey });
		return { shapeKey, capo, disabled: capo > maxCapo };
	});
}
