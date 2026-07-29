/**
 * Whole-library export/import (task A3, mvp-spec.md F5 "Data safety";
 * rewritten task E1 onto the localStorage store; collections merge added
 * task E2, docs/PLAN-v0.3.md §E2).
 *
 * Format: a zip (via `fflate`) containing
 *   - `manifest.json`  — schemaVersion, songs, charts (sans chordproSource),
 *                         patterns, collections, collectionItems
 *   - `charts/<chartId>.chordpro` — one file per chart's ChordPro source
 *
 * `SCHEMA_VERSION` is 2 as of task E2 (collections/collectionItems now carry
 * real data). Import still accepts **v1 archives** — both the pre-E1 shape
 * (no `collections`/`collectionItems` fields at all) and the E1 shape (the
 * fields present but always `[]`) — the owner has real v1 backups and losing
 * the ability to restore them is not acceptable. Missing arrays read as
 * empty.
 *
 * Import merge strategy, songs and collections alike: id already present in
 * the target → skip that record (and, for songs, its charts/patterns; for
 * collections, its items); otherwise insert. Collection items referencing a
 * song that isn't present in the target library *after* the song merge are
 * dropped rather than left dangling, and every collection that loses items
 * this way gets its positions resequenced to stay contiguous. Round-trip
 * (export → import into a fresh store) must be lossless.
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

export const SCHEMA_VERSION = 2;

/** Schema versions this importer accepts, oldest first. */
const SUPPORTED_IMPORT_VERSIONS = [1, 2];

type ManifestChart = Omit<ChartRecord, 'chordproSource'> & { chordproFile: string };

interface Manifest {
	schemaVersion: number;
	songs: SongRecord[];
	charts: ManifestChart[];
	patterns: PatternRecord[];
	// Optional, not just possibly-empty: genuine v1 archives (pre task E1)
	// don't have these keys in their JSON at all.
	collections?: CollectionRecord[];
	collectionItems?: CollectionItemRecord[];
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
	collectionsImported: number;
	collectionsSkipped: number;
}

/**
 * Import a library zip previously produced by `exportLibrary`. Songs whose
 * id already exists in the target store are skipped entirely (along with
 * their charts/patterns); all others are inserted. Same rule for
 * collections: an id already present in the target is skipped along with
 * its items. Accepts v1 archives that predate (or, E1, always-empty) the
 * `collections`/`collectionItems` manifest fields — the owner has real v1
 * backups.
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
	if (!SUPPORTED_IMPORT_VERSIONS.includes(manifest.schemaVersion)) {
		throw new Error(
			`importLibrary: unsupported schemaVersion ${manifest.schemaVersion} (expected one of ${SUPPORTED_IMPORT_VERSIONS.join(', ')})`
		);
	}
	const manifestCollections = manifest.collections ?? [];
	const manifestCollectionItems = manifest.collectionItems ?? [];

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

		// Collections merge (task E2): id already present in the target →
		// skip that collection and its items, same rule as songs above.
		const existingCollectionIds = new Set(doc.collections.map((collection) => collection.id));
		const collectionsToInsert = manifestCollections.filter(
			(collection) => !existingCollectionIds.has(collection.id)
		);
		const collectionIdsToInsert = new Set(collectionsToInsert.map((collection) => collection.id));
		doc.collections.push(...collectionsToInsert);

		// A membership row belongs to an inserted collection AND its song must
		// actually exist in the target library post-merge — a song can be
		// absent either because the archive is inconsistent, or (importantly)
		// because that song was itself skipped as already-present *under a
		// different id space than expected*. Either way, a dangling reference
		// must be dropped, not carried in silently broken.
		const songIdsInTarget = new Set(doc.songs.map((song) => song.id));
		const itemsToInsert = manifestCollectionItems.filter(
			(item) => collectionIdsToInsert.has(item.collectionId) && songIdsInTarget.has(item.songId)
		);
		doc.collectionItems.push(...itemsToInsert);

		// Dropped items can open a gap in a collection's positions — resequence
		// every newly-inserted collection so 0..n-1 stays contiguous, matching
		// the invariant every collections.ts mutator enforces.
		for (const collectionId of collectionIdsToInsert) {
			const items = doc.collectionItems
				.filter((item) => item.collectionId === collectionId)
				.sort((a, b) => a.position - b.position);
			items.forEach((item, index) => {
				item.position = index;
			});
		}

		return {
			songsImported: songsToInsert.length,
			songsSkipped: manifest.songs.length - songsToInsert.length,
			collectionsImported: collectionsToInsert.length,
			collectionsSkipped: manifestCollections.length - collectionsToInsert.length
		};
	});
}
