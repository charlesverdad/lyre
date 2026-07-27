/**
 * Pattern math: soundingKey/shapeKey/capo derivation and shape-ranking
 * suggestions (domain-model.md §1, §4 "Shape ranking").
 */

import type { KeyName, PitchClass, Pattern } from './types';
import { keyNameToPitchClass, pitchClassToKeyName } from './notes';

function mod12(n: number): number {
	return ((n % 12) + 12) % 12;
}

function requirePitchClass(key: KeyName, label: string): PitchClass {
	const pc = keyNameToPitchClass(key);
	if (pc === null) throw new Error(`derivePattern: unrecognized ${label} "${key}"`);
	return pc;
}

/** Input to `derivePattern`: exactly two of the three fields must be set. */
export type PatternInput =
	| { soundingKey: KeyName; shapeKey: KeyName; capo?: undefined }
	| { soundingKey: KeyName; capo: number; shapeKey?: undefined }
	| { shapeKey: KeyName; capo: number; soundingKey?: undefined };

/**
 * Derive the missing third of `{soundingKey, shapeKey, capo}` from the
 * other two, enforcing the invariant `(shapeKey + capo) mod 12 ==
 * soundingKey`, `0 <= capo <= 11` (domain-model.md §5).
 */
export function derivePattern(input: PatternInput): Pattern {
	if ('shapeKey' in input && input.shapeKey !== undefined && typeof input.capo === 'number') {
		const shapePc = requirePitchClass(input.shapeKey, 'shapeKey');
		const capo = mod12(input.capo);
		const soundingPc = mod12(shapePc + capo);
		return {
			soundingKey: pitchClassToKeyName(soundingPc as PitchClass),
			shapeKey: input.shapeKey,
			capo
		};
	}
	if ('soundingKey' in input && input.soundingKey !== undefined && typeof input.capo === 'number') {
		const soundingPc = requirePitchClass(input.soundingKey, 'soundingKey');
		const capo = mod12(input.capo);
		const shapePc = mod12(soundingPc - capo);
		return {
			soundingKey: input.soundingKey,
			shapeKey: pitchClassToKeyName(shapePc as PitchClass),
			capo
		};
	}
	if (
		'soundingKey' in input &&
		input.soundingKey !== undefined &&
		'shapeKey' in input &&
		input.shapeKey !== undefined
	) {
		const soundingPc = requirePitchClass(input.soundingKey, 'soundingKey');
		const shapePc = requirePitchClass(input.shapeKey, 'shapeKey');
		const capo = mod12(soundingPc - shapePc);
		return { soundingKey: input.soundingKey, shapeKey: input.shapeKey, capo };
	}
	throw new Error('derivePattern: exactly two of {soundingKey, shapeKey, capo} are required');
}

/** Default comfort order for shape-family ranking (domain-model.md §4). */
export const DEFAULT_COMFORT_ORDER: readonly string[] = ['G', 'C', 'D', 'A', 'E'];

export type CapoTier = 'ideal' | 'acceptable' | 'lastResort' | 'unavailable';

export interface PatternSuggestion {
	soundingKey: KeyName;
	shapeKey: KeyName;
	capo: number;
	tier: CapoTier;
	/** False when `capo` exceeds `opts.maxCapo`. */
	available: boolean;
}

export interface SuggestPatternsOptions {
	/** Shape-family preference order, most comfortable first. */
	comfortOrder?: readonly string[];
	/** Highest capo considered playable; higher is excluded (or marked unavailable). */
	maxCapo?: number;
	/** Include capos beyond `maxCapo`, marked `available: false`, instead of dropping them. */
	includeUnavailable?: boolean;
}

function capoTier(capo: number): CapoTier {
	if (capo <= 5) return 'ideal';
	if (capo <= 7) return 'acceptable';
	if (capo <= 9) return 'lastResort';
	return 'unavailable';
}

/**
 * Rank candidate `(shapeKey, capo)` pairs for playing `target` as the
 * sounding key (domain-model.md §4 "Shape ranking"):
 *  1. Shapes in `comfortOrder` are preferred as a group over all others.
 *  2. Within each group, lower capo positions are preferred.
 *  3. By default, capos above 9 are excluded (guitarists rarely capo past
 *     fret 9-10); pass `includeUnavailable` to keep them, flagged.
 */
export function suggestPatterns(
	target: KeyName,
	opts: SuggestPatternsOptions = {}
): PatternSuggestion[] {
	const targetPc = requirePitchClass(target, 'target');
	const comfortOrder = opts.comfortOrder ?? DEFAULT_COMFORT_ORDER;
	const maxCapo = opts.maxCapo ?? 9;
	const includeUnavailable = opts.includeUnavailable ?? false;

	const comfortPcs = comfortOrder
		.map((name) => keyNameToPitchClass(name))
		.filter((pc): pc is PitchClass => pc !== null);

	const soundingKey = pitchClassToKeyName(targetPc);

	const all: PatternSuggestion[] = [];
	for (let shapePc = 0; shapePc < 12; shapePc++) {
		const capo = mod12(targetPc - shapePc);
		const tier = capoTier(capo);
		const available = capo <= maxCapo;
		all.push({
			soundingKey,
			shapeKey: pitchClassToKeyName(shapePc as PitchClass),
			capo,
			tier,
			available
		});
	}

	const filtered = includeUnavailable ? all : all.filter((s) => s.available);

	const isComfort = (s: PatternSuggestion) =>
		comfortPcs.includes(keyNameToPitchClass(s.shapeKey) as PitchClass);

	filtered.sort((a, b) => {
		const aComfort = isComfort(a) ? 0 : 1;
		const bComfort = isComfort(b) ? 0 : 1;
		if (aComfort !== bComfort) return aComfort - bComfort;
		return a.capo - b.capo;
	});

	return filtered;
}
