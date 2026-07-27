/**
 * Whole-library export/import (task A3, mvp-spec.md F5 "Data safety").
 *
 * Format: a zip (via `fflate`) containing
 *   - `manifest.json`  — schemaVersion, songs, charts (sans chordproSource),
 *                         patterns
 *   - `charts/<chartId>.chordpro` — one file per chart's ChordPro source
 *
 * Import merge strategy: same song id already present → skip that song (and
 * its charts/patterns); otherwise insert. Round-trip (export → import into a
 * fresh db) must be lossless.
 */

import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import type { LyreDatabase } from './schema';
import { db as defaultDb } from './schema';
import type { SongRecord, ChartRecord, PatternRecord } from '$lib/theory/types';

export const SCHEMA_VERSION = 1;

type ManifestChart = Omit<ChartRecord, 'chordproSource'> & { chordproFile: string };

interface Manifest {
	schemaVersion: number;
	songs: SongRecord[];
	charts: ManifestChart[];
	patterns: PatternRecord[];
}

function chartFileName(chartId: string): string {
	return `charts/${chartId}.chordpro`;
}

/** Export the whole library to a zip archive (as `Uint8Array`). */
export async function exportLibrary(database: LyreDatabase = defaultDb): Promise<Uint8Array> {
	const [songs, charts, patterns] = await Promise.all([
		database.songs.toArray(),
		database.charts.toArray(),
		database.patterns.toArray()
	]);

	const manifest: Manifest = {
		schemaVersion: SCHEMA_VERSION,
		songs,
		charts: charts.map((chart) => {
			const rest: Partial<ChartRecord> = { ...chart };
			delete rest.chordproSource;
			return { ...rest, chordproFile: chartFileName(chart.id) } as ManifestChart;
		}),
		patterns
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
 * id already exists in the target database are skipped entirely (along with
 * their charts/patterns); all others are inserted.
 */
export async function importLibrary(
	zipData: Uint8Array,
	database: LyreDatabase = defaultDb
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

	return database.transaction(
		'rw',
		database.songs,
		database.charts,
		database.patterns,
		async () => {
			const existingIds = new Set(await database.songs.toCollection().primaryKeys());

			const songsToInsert = manifest.songs.filter((song) => !existingIds.has(song.id));
			const songIdsToInsert = new Set(songsToInsert.map((song) => song.id));

			const chartsToInsert = manifest.charts.filter((chart) => songIdsToInsert.has(chart.songId));
			const chartIdsToInsert = new Set(chartsToInsert.map((chart) => chart.id));

			const patternsToInsert = manifest.patterns.filter((pattern) =>
				chartIdsToInsert.has(pattern.chartId)
			);

			if (songsToInsert.length > 0) {
				await database.songs.bulkAdd(songsToInsert);
			}
			if (chartsToInsert.length > 0) {
				const fullCharts: ChartRecord[] = chartsToInsert.map((chart) => {
					const { chordproFile, ...rest } = chart;
					const bytes = files[chordproFile];
					if (!bytes) {
						throw new Error(`importLibrary: zip is missing chart file ${chordproFile}`);
					}
					return { ...rest, chordproSource: strFromU8(bytes) };
				});
				await database.charts.bulkAdd(fullCharts);
			}
			if (patternsToInsert.length > 0) {
				await database.patterns.bulkAdd(patternsToInsert);
			}

			return {
				songsImported: songsToInsert.length,
				songsSkipped: manifest.songs.length - songsToInsert.length
			};
		}
	);
}
