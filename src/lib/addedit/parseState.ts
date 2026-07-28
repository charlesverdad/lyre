/**
 * Pure parse-state helpers shared by the add (paste) and edit flows
 * (mvp-spec.md F2). Wraps `src/lib/chart` so the two routes don't duplicate
 * "how do I re-derive a ChartDoc when the user edits text or overrides the
 * key picker" logic.
 */

import {
	detectFormat,
	parseChart,
	parseChordPro,
	parsePlaintextChart,
	resolveNoisyPaste
} from '$lib/chart';
import type { ChartDoc, KeyName, Pattern } from '$lib/theory/types';

export interface ChartParseState {
	doc: ChartDoc;
	/** The chart's shape key as parsed/overridden — always equals `doc.sourceKey`. */
	sourceKey: KeyName;
	/** Initial pattern to prefill/save, if the pasted text's header stated a complete triple. */
	initialPattern?: Pattern;
	/** True when nothing chord/lyric-shaped was found (mvp-spec.md F2 empty state). */
	isEmpty: boolean;
	/**
	 * True when the input looked like a noisy page dump (select-all off a
	 * chord site: nav/search/footer chrome around the chart) and region
	 * extraction (`$lib/chart/extractRegion.ts`) trimmed it down before
	 * parsing. Lets the paste UI show a "trimmed page noise" hint.
	 */
	trimmedNoise: boolean;
}

/**
 * Parse `text` into a `ChartParseState`. When `sourceKeyOverride` is given
 * (the user picked a different key than what was inferred), the chart is
 * re-parsed against that key rather than merely relabeled — since chords are
 * stored key-relative (`degree = root - sourceKey`), reparsing is what makes
 * the *same typed letters* round-trip back out under the corrected key,
 * rather than silently transposing the chart (domain-model.md §3).
 */
export function deriveChartParseState(text: string, sourceKeyOverride?: KeyName): ChartParseState {
	const { chartText: effectiveText, trimmedNoise } = resolveNoisyPaste(text);
	const parsed = parseChart(effectiveText);
	const headerPattern = initialPatternFromHeader(parsed.header);

	if (sourceKeyOverride === undefined || sourceKeyOverride === parsed.doc.sourceKey) {
		return {
			doc: parsed.doc,
			sourceKey: parsed.doc.sourceKey,
			initialPattern: headerPattern,
			isEmpty: parsed.doc.sections.length === 0,
			trimmedNoise
		};
	}

	const doc =
		detectFormat(effectiveText) === 'chordpro'
			? parseChordPro(effectiveText, { sourceKey: sourceKeyOverride })
			: parsePlaintextChart(parsed.header.remainingText, sourceKeyOverride);

	return {
		doc,
		sourceKey: doc.sourceKey,
		initialPattern: headerPattern,
		isEmpty: doc.sections.length === 0,
		trimmedNoise
	};
}

/** A pattern header only counts as a prefillable pattern once all three parts are known. */
function initialPatternFromHeader(header: {
	soundingKey?: KeyName;
	shapeKey?: KeyName;
	capo?: number;
}): Pattern | undefined {
	if (
		header.soundingKey === undefined ||
		header.shapeKey === undefined ||
		header.capo === undefined
	) {
		return undefined;
	}
	return { soundingKey: header.soundingKey, shapeKey: header.shapeKey, capo: header.capo };
}

/** Save is only enabled once a title is entered and the paste parsed into at least one section. */
export function canSaveChart(title: string, state: ChartParseState | undefined): boolean {
	return title.trim().length > 0 && state !== undefined && !state.isEmpty;
}
