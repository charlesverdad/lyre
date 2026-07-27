/**
 * Public entry point for the grabber library (docs/PLAN-v0.1.md task B4).
 *
 * Pipeline glue: adapter `extract()` output -> `parseChart` (src/lib/chart)
 * for header/sourceKey -> assembled `GrabResult` (see `pipeline.ts`, used by
 * both this module's `grabResultToSongInput` and `fetcher.ts`). Also
 * exposes `grabResultToSongInput`, mapping a `GrabResult` to the shape
 * `src/lib/db/repo.ts`'s `createSong` expects — the last step before a grab
 * lands in the library (task C1 wires the add-song route up to this).
 */

import { chartDocToChordPro, parseChart } from '$lib/chart';
import type { ChartDoc } from '$lib/theory/types';
import type { CreateSongInput } from '$lib/db/repo';
import type { GrabResult } from './types';

export * from './types';
export * from './registry';
export * from './pipeline';
export * from './fetcher';
export { pnwchordsAdapter } from './adapters/pnwchords';
export { genericAdapter } from './adapters/generic';

/**
 * The chart's initial preferred pattern: the header's fully-derived pattern
 * when the page stated one ("Original in Ab. Capo 1, play in G." and
 * friends), else the no-capo default of playing the chart exactly as
 * written (`shapeKey = soundingKey = sourceKey`, capo 0).
 */
function initialPattern(
	doc: ChartDoc,
	header: GrabResult['header']
): { soundingKey: string; shapeKey: string; capo: number } {
	if (
		header.soundingKey !== undefined &&
		header.shapeKey !== undefined &&
		header.capo !== undefined
	) {
		return { soundingKey: header.soundingKey, shapeKey: header.shapeKey, capo: header.capo };
	}
	return { soundingKey: doc.sourceKey, shapeKey: doc.sourceKey, capo: 0 };
}

/**
 * Map a `GrabResult` to `createSong`'s input shape (src/lib/db/repo.ts):
 * chart stored as ChordPro (task A2 serializer), `rawGrabbedText` preserves
 * the original grabbed text verbatim so edits stay an overlay, and the
 * initial pattern prefers the page's stated header over the chart's raw
 * source key.
 */
export function grabResultToSongInput(result: GrabResult): CreateSongInput {
	// Re-parse: `GrabResult` intentionally doesn't carry the full `ChartDoc`
	// (it's a flat, serializable preview shape), so we reconstruct it here
	// from the preserved `chartText` — deterministic, since `parseChart` is
	// pure.
	const { doc } = parseChart(result.chartText);
	const chordproSource = chartDocToChordPro(doc);
	const pattern = initialPattern(doc, result.header);

	const sourceAttribution = result.artist
		? `${result.artist} — via ${result.sourceSite}`
		: `via ${result.sourceSite}`;

	return {
		song: {
			title: result.title ?? doc.title ?? 'Untitled',
			aliases: [],
			authors: result.artist ? [result.artist] : [],
			defaultKey: pattern.soundingKey,
			topics: []
		},
		chart: {
			name: 'Default',
			chordproSource,
			sourceKey: doc.sourceKey,
			sourceUrl: result.sourceUrl,
			sourceSite: result.sourceSite,
			fetchedAt: result.fetchedAt,
			rawGrabbedText: result.chartText,
			sourceAttribution
		},
		pattern: {
			...pattern,
			label: 'Default'
		}
	};
}
