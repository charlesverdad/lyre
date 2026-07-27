/**
 * Repository functions over the Dexie schema (task A3).
 *
 * These are the only sanctioned way the rest of the app touches
 * songs/charts/patterns — they own the cross-table invariants documented in
 * docs/domain-model.md §5:
 *
 *   - Exactly one preferred pattern per chart.
 *   - Deleting a song cascades to its charts and patterns.
 *   - `Pattern`: `(shapeKey + capo) mod 12 == soundingKey` is a theory-engine
 *     concern (task A1); this layer stores whatever pattern it's given.
 */

import type { LyreDatabase } from './schema';
import { db as defaultDb } from './schema';
import type { SongRecord, ChartRecord, PatternRecord } from '$lib/theory/types';

export type SongSort = 'recentlyPlayed' | 'recentlyAdded' | 'alpha';

export interface SongWithDetails {
	song: SongRecord;
	charts: (ChartRecord & { patterns: PatternRecord[] })[];
}

function newId(): string {
	return crypto.randomUUID();
}

function nowIso(): string {
	return new Date().toISOString();
}

export interface CreateSongInput {
	song: Omit<SongRecord, 'id' | 'createdAt' | 'updatedAt'>;
	chart: Omit<ChartRecord, 'id' | 'songId' | 'createdAt' | 'updatedAt'>;
	/** Optional initial pattern; forced preferred since it's the only one. */
	pattern?: Omit<PatternRecord, 'id' | 'chartId' | 'isPreferred'>;
}

export interface CreateSongResult {
	song: SongRecord;
	chart: ChartRecord;
	pattern?: PatternRecord;
}

/** Create a song + its first chart (+ optional initial pattern) atomically. */
export async function createSong(
	input: CreateSongInput,
	database: LyreDatabase = defaultDb
): Promise<CreateSongResult> {
	const timestamp = nowIso();

	const song: SongRecord = {
		...input.song,
		id: newId(),
		createdAt: timestamp,
		updatedAt: timestamp
	};

	const chart: ChartRecord = {
		...input.chart,
		id: newId(),
		songId: song.id,
		createdAt: timestamp,
		updatedAt: timestamp
	};

	let pattern: PatternRecord | undefined;
	if (input.pattern) {
		pattern = {
			...input.pattern,
			id: newId(),
			chartId: chart.id,
			isPreferred: true
		};
	}

	await database.transaction('rw', database.songs, database.charts, database.patterns, async () => {
		await database.songs.add(song);
		await database.charts.add(chart);
		if (pattern) {
			await database.patterns.add(pattern);
		}
	});

	return { song, chart, pattern };
}

/** Patch a song's fields, bumping `updatedAt`. */
export async function updateSong(
	id: string,
	patch: Partial<Omit<SongRecord, 'id' | 'createdAt'>>,
	database: LyreDatabase = defaultDb
): Promise<void> {
	await database.songs.update(id, { ...patch, updatedAt: nowIso() });
}

/** Patch a chart's fields, bumping `updatedAt`. */
export async function updateChart(
	id: string,
	patch: Partial<Omit<ChartRecord, 'id' | 'songId' | 'createdAt'>>,
	database: LyreDatabase = defaultDb
): Promise<void> {
	await database.charts.update(id, { ...patch, updatedAt: nowIso() });
}

/** Delete a song, cascading to its charts and their patterns. */
export async function deleteSong(id: string, database: LyreDatabase = defaultDb): Promise<void> {
	await database.transaction('rw', database.songs, database.charts, database.patterns, async () => {
		const chartIds = (await database.charts.where('songId').equals(id).primaryKeys()) as string[];
		if (chartIds.length > 0) {
			await database.patterns.where('chartId').anyOf(chartIds).delete();
			await database.charts.bulkDelete(chartIds);
		}
		await database.songs.delete(id);
	});
}

/** List all songs, sorted per F1 (recently played | recently added | alpha). */
export async function listSongs(
	sort: SongSort = 'alpha',
	database: LyreDatabase = defaultDb
): Promise<SongRecord[]> {
	const songs = await database.songs.toArray();

	switch (sort) {
		case 'alpha':
			return songs.sort((a, b) => a.title.localeCompare(b.title));
		case 'recentlyAdded':
			return songs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		case 'recentlyPlayed':
			return songs.sort((a, b) => {
				const aPlayed = a.lastPlayedAt ?? '';
				const bPlayed = b.lastPlayedAt ?? '';
				if (aPlayed !== bPlayed) return bPlayed.localeCompare(aPlayed);
				// Songs never played sort after played ones, newest-added first.
				return b.createdAt.localeCompare(a.createdAt);
			});
	}
}

export interface SongListEntry {
	song: SongRecord;
	/** The chart the library row summarizes: named "Default", else the earliest-created chart. */
	defaultChart?: ChartRecord;
	/** `defaultChart`'s preferred pattern, if it has one yet. */
	preferredPattern?: PatternRecord;
}

/**
 * List songs (per `sort`) alongside each one's default chart and that
 * chart's preferred pattern — everything the Library row needs (F1: title,
 * authors, pattern summary like "G shapes · capo 2 · A").
 *
 * Batched in a fixed number of queries regardless of library size (one
 * `listSongs` scan + one `anyOf` chart lookup + one `anyOf` pattern lookup)
 * rather than querying per song, so the row list stays cheap as the library
 * grows.
 */
export async function listSongsWithDefaultPattern(
	sort: SongSort = 'alpha',
	database: LyreDatabase = defaultDb
): Promise<SongListEntry[]> {
	const songs = await listSongs(sort, database);
	if (songs.length === 0) return [];

	const songIds = songs.map((song) => song.id);
	const charts = await database.charts.where('songId').anyOf(songIds).toArray();

	const chartsBySong = new Map<string, ChartRecord[]>();
	for (const chart of charts) {
		const existing = chartsBySong.get(chart.songId);
		if (existing) existing.push(chart);
		else chartsBySong.set(chart.songId, [chart]);
	}

	const defaultChartBySong = new Map<string, ChartRecord>();
	for (const [songId, songCharts] of chartsBySong) {
		const defaultChart =
			songCharts.find((chart) => chart.name === 'Default') ??
			[...songCharts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
		defaultChartBySong.set(songId, defaultChart);
	}

	const defaultChartIds = [...defaultChartBySong.values()].map((chart) => chart.id);
	const patterns =
		defaultChartIds.length > 0
			? await database.patterns.where('chartId').anyOf(defaultChartIds).toArray()
			: [];
	const preferredByChart = new Map(
		patterns.filter((pattern) => pattern.isPreferred).map((pattern) => [pattern.chartId, pattern])
	);

	return songs.map((song) => {
		const defaultChart = defaultChartBySong.get(song.id);
		const preferredPattern = defaultChart ? preferredByChart.get(defaultChart.id) : undefined;
		return { song, defaultChart, preferredPattern };
	});
}

/**
 * Client-side substring search over title/authors/lyrics (F1: "instant
 * client-side search"). Case-insensitive. Lyrics search reads each song's
 * charts' `chordproSource`.
 */
export async function searchSongs(
	query: string,
	database: LyreDatabase = defaultDb
): Promise<SongRecord[]> {
	const needle = query.trim().toLowerCase();
	if (!needle) return listSongs('alpha', database);

	const [songs, charts] = await Promise.all([database.songs.toArray(), database.charts.toArray()]);

	const chartTextBySongId = new Map<string, string>();
	for (const chart of charts) {
		const existing = chartTextBySongId.get(chart.songId) ?? '';
		chartTextBySongId.set(chart.songId, `${existing}\n${chart.chordproSource}`);
	}

	return songs
		.filter((song) => {
			if (song.title.toLowerCase().includes(needle)) return true;
			if (song.authors.some((author) => author.toLowerCase().includes(needle))) return true;
			const lyrics = chartTextBySongId.get(song.id);
			if (lyrics && lyrics.toLowerCase().includes(needle)) return true;
			return false;
		})
		.sort((a, b) => a.title.localeCompare(b.title));
}

/** Fetch a song with all its charts and each chart's patterns. */
export async function getSongWithDetails(
	songId: string,
	database: LyreDatabase = defaultDb
): Promise<SongWithDetails | undefined> {
	const song = await database.songs.get(songId);
	if (!song) return undefined;

	const charts = await database.charts.where('songId').equals(songId).toArray();
	const chartsWithPatterns = await Promise.all(
		charts.map(async (chart) => ({
			...chart,
			patterns: await database.patterns.where('chartId').equals(chart.id).toArray()
		}))
	);

	return { song, charts: chartsWithPatterns };
}

/**
 * Mark a pattern as the chart's preferred one, unsetting any previous
 * preferred pattern on the same chart in one transaction
 * (domain-model.md §5: "exactly one preferred pattern per chart").
 */
export async function setPreferredPattern(
	patternId: string,
	database: LyreDatabase = defaultDb
): Promise<void> {
	await database.transaction('rw', database.patterns, async () => {
		const pattern = await database.patterns.get(patternId);
		if (!pattern) throw new Error(`setPreferredPattern: no pattern with id ${patternId}`);

		const siblings = await database.patterns.where('chartId').equals(pattern.chartId).toArray();
		await Promise.all(
			siblings
				.filter((sibling) => sibling.id !== patternId && sibling.isPreferred)
				.map((sibling) => database.patterns.update(sibling.id, { isPreferred: false }))
		);
		await database.patterns.update(patternId, { isPreferred: true });
	});
}

export interface SavePatternInput {
	chartId: string;
	label: string;
	soundingKey: string;
	shapeKey: string;
	capo: number;
	fontScale?: number;
	autoscrollSpeed?: number;
	/** If true, this becomes the chart's preferred pattern. */
	isPreferred?: boolean;
}

/**
 * Insert a new pattern for a chart. If `isPreferred` is set (or this is the
 * chart's first pattern), enforces the exactly-one-preferred invariant.
 */
export async function savePattern(
	input: SavePatternInput,
	database: LyreDatabase = defaultDb
): Promise<PatternRecord> {
	return database.transaction('rw', database.patterns, async () => {
		const siblings = await database.patterns.where('chartId').equals(input.chartId).toArray();
		// A chart's first pattern is always preferred, regardless of what the
		// caller passes — otherwise the chart would have zero preferred
		// patterns, violating the exactly-one-preferred invariant.
		const shouldBePreferred = siblings.length === 0 ? true : (input.isPreferred ?? false);

		const pattern: PatternRecord = {
			id: newId(),
			chartId: input.chartId,
			label: input.label,
			soundingKey: input.soundingKey,
			shapeKey: input.shapeKey,
			capo: input.capo,
			fontScale: input.fontScale,
			autoscrollSpeed: input.autoscrollSpeed,
			isPreferred: shouldBePreferred
		};

		if (shouldBePreferred) {
			await Promise.all(
				siblings
					.filter((sibling) => sibling.isPreferred)
					.map((sibling) => database.patterns.update(sibling.id, { isPreferred: false }))
			);
		}

		await database.patterns.add(pattern);
		return pattern;
	});
}

/** Stamp a song's `lastPlayedAt` to now (F1 "recently played" sort). */
export async function touchLastPlayed(
	songId: string,
	database: LyreDatabase = defaultDb
): Promise<void> {
	await database.songs.update(songId, { lastPlayedAt: nowIso() });
}
