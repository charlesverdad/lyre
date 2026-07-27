/**
 * Core extract -> parse -> assemble glue, factored out of `index.ts` so
 * `fetcher.ts` can use it without an import cycle (both `index.ts` and
 * `fetcher.ts` import from here; neither imports the other). `index.ts`
 * re-exports everything here as the library's public surface.
 */

import { parseChart } from '$lib/chart';
import type { AdapterExtract, GrabResult } from './types';

export interface GrabResultMeta {
	sourceUrl: string;
	sourceSite: string;
	fetchedAt: string;
}

/**
 * Turn an adapter's raw extraction into a full `GrabResult` by running the
 * chart text through `parseChart` (src/lib/chart, task A2) to get the
 * pattern header (`Original in Ab. Capo 1, play in G.`) and the chart's
 * source key.
 */
export function buildGrabResult(extract: AdapterExtract, meta: GrabResultMeta): GrabResult {
	const { doc, header } = parseChart(extract.chartText);
	return {
		title: extract.title,
		artist: extract.artist,
		chartText: extract.chartText,
		sourceKey: doc.sourceKey,
		header: {
			soundingKey: header.soundingKey,
			shapeKey: header.shapeKey,
			capo: header.capo
		},
		sourceUrl: meta.sourceUrl,
		sourceSite: meta.sourceSite,
		fetchedAt: meta.fetchedAt
	};
}
