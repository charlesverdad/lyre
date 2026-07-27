/**
 * Pure "which chart/pattern does play mode open" selection helpers (task B3).
 *
 * Mirrors the same tie-breaking `src/lib/db/repo.ts`'s
 * `listSongsWithDefaultPattern` uses internally (named "Default" chart, else
 * earliest-created; that chart's preferred pattern), pulled out here so the
 * play-mode route can apply it to a `SongWithDetails` without re-querying.
 */

import type { ChartRecord, PatternRecord } from '$lib/theory/types';

/** Pick a song's default chart: named "Default", else the earliest-created. */
export function pickDefaultChart<T extends Pick<ChartRecord, 'name' | 'createdAt'>>(
	charts: readonly T[]
): T | undefined {
	if (charts.length === 0) return undefined;
	return (
		charts.find((chart) => chart.name === 'Default') ??
		[...charts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
	);
}

/** Pick a chart's preferred pattern. */
export function pickPreferredPattern<T extends Pick<PatternRecord, 'isPreferred'>>(
	patterns: readonly T[]
): T | undefined {
	return patterns.find((pattern) => pattern.isPreferred);
}
