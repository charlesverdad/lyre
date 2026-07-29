/**
 * Whole-library export/import (task A3, mvp-spec.md F5 "Data safety";
 * rewritten task E1 onto the localStorage store — zip format unchanged).
 *
 * Format: a zip (via `fflate`) containing
 *   - `manifest.json`  — schemaVersion, songs, charts (sans chordproSource),
 *                         patterns, collections, collectionItems
 *   - `charts/<chartId>.chordpro` — one file per chart's ChordPro source
 *
 * `collections`/`collectionItems` are carried through the manifest starting
 * this task (task E1, docs/PLAN-v0.3.md §E1) so task E2's real CRUD is
 * purely additive here — they're always empty arrays until E2, and import
 * doesn't merge them yet (nothing to merge: the target's arrays are always
 * empty too). `SCHEMA_VERSION` stays 1 in E1 ("zip format unchanged"); E2
 * bumps it once these arrays carry real data and defines the merge rule.
 *
 * Import merge strategy: same song id already present → skip that song (and
 * its charts/patterns); otherwise insert. Round-trip (export → import into a
 * fresh store) must be lossless.
 */

import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import type { LyreStore } from './store';
import { defaultStore } from './store';
import type {
	SongRecord,
	ChartRecord,
	PatternRecord,
	CollectionRecord,
	CollectionItemRecord
} from '$lib/theory/types';

export const SCHEMA_VERSION = 1;

type ManifestChart = Omit<ChartRecord, 'chordproSource'> & { chordproFile: string };

interface Manifest {
	schemaVersion: number;
	songs: SongRecord[];
	charts: ManifestChart[];
	patterns: PatternRecord[];
	collections: CollectionRecord[];
	collectionItems: CollectionItemRecord[];
}

function chartFileName(chartId: string): string {
	return `charts/${chartId}.chordpro`;
}

/** Export the whole library to a zip archive (as `Uint8Array`). */
export async function exportLibrary(store: LyreStore = defaultStore): Promise<Uint8Array> {
	const { songs, charts, patterns, collections, collectionItems } = store.read((doc) => doc);

	const manifest: Manifest = {
		schemaVersion: SCHEMA_VERSION,
		songs,
		charts: charts.map((chart) => {
			const rest: Partial<ChartRecord> = { ...chart };
			delete rest.chordproSource;
			return { ...rest, chordproFile: chartFileName(chart.id) } as ManifestChart;
		}),
		patterns,
		// Always empty in E1 (see file doc comment) — carried through so E2
		// doesn't need to touch this export path at all.
		collections,
		collectionItems
	};

	const files: Record<string, Uint8Array> = {
		'manifest.json': strToU8(JSON.stringify(manifest, null, 2))
	};
	for (const chart of charts) {
		files[chartFileName(chart.id)] = strToU8(chart.chordproSource);
	}

	return zipSync(files, { level: 0 });
}

export interface ImportResult {
	songsImported: number;
	songsSkipped: number;
}

/**
 * Import a library zip previously produced by `exportLibrary`. Songs whose
 * id already exists in the target store are skipped entirely (along with
 * their charts/patterns); all others are inserted. Accepts v1 archives that
 * predate the `collections`/`collectionItems` manifest fields (read as
 * empty) — the owner has v1 backups.
 */
export async function importLibrary(
	zipData: Uint8Array,
	store: LyreStore = defaultStore
): Promise<ImportResult> {
	const files = unzipSync(zipData);
	const manifestBytes = files['manifest.json'];
	if (!manifestBytes) {
		throw new Error('importLibrary: zip is missing manifest.json');
	}
	const manifest = JSON.parse(strFromU8(manifestBytes)) as Manifest;
	if (manifest.schemaVersion !== SCHEMA_VERSION) {
		throw new Error(
			`importLibrary: unsupported schemaVersion ${manifest.schemaVersion} (expected ${SCHEMA_VERSION})`
		);
	}

	return store.mutate((doc) => {
		const existingIds = new Set(doc.songs.map((song) => song.id));

		const songsToInsert = manifest.songs.filter((song) => !existingIds.has(song.id));
		const songIdsToInsert = new Set(songsToInsert.map((song) => song.id));

		const chartsToInsert = manifest.charts.filter((chart) => songIdsToInsert.has(chart.songId));
		const chartIdsToInsert = new Set(chartsToInsert.map((chart) => chart.id));

		const patternsToInsert = manifest.patterns.filter((pattern) =>
			chartIdsToInsert.has(pattern.chartId)
		);

		doc.songs.push(...songsToInsert);
		if (chartsToInsert.length > 0) {
			const fullCharts: ChartRecord[] = chartsToInsert.map((chart) => {
				const { chordproFile, ...rest } = chart;
				const bytes = files[chordproFile];
				if (!bytes) {
					throw new Error(`importLibrary: zip is missing chart file ${chordproFile}`);
				}
				return { ...rest, chordproSource: strFromU8(bytes) };
			});
			doc.charts.push(...fullCharts);
		}
		doc.patterns.push(...patternsToInsert);

		// Nothing to merge yet for collections/collectionItems (E1: both the
		// manifest's and the target's arrays are always empty) — task E2 owns
		// the id-skip + dangling-item-drop merge rule described in
		// docs/PLAN-v0.3.md §E2.

		return {
			songsImported: songsToInsert.length,
			songsSkipped: manifest.songs.length - songsToInsert.length
		};
	});
}
