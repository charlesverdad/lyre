/**
 * Repository functions over the localStorage `LyreStore` (task A3, rewritten
 * task E1 off Dexie/IndexedDB onto docs/PLAN-v0.3.md §E1's single-document
 * store).
 *
 * These are the only sanctioned way the rest of the app touches
 * songs/charts/patterns — they own the cross-table invariants documented in
 * docs/domain-model.md §5:
 *
 *   - Exactly one preferred pattern per chart.
 *   - Deleting a song cascades to its charts and patterns.
 *   - `Pattern`: `(shapeKey + capo) mod 12 == soundingKey` is a theory-engine
 *     concern (task A1); this layer stores whatever pattern it's given.
 *
 * Every export keeps its name, signature shape, and `async`/`Promise`
 * return, even though the store itself is synchronous — the trailing
 * optional `database: LyreDatabase` param is now a trailing optional
 * `store: LyreStore`, so no call site needed logic changes beyond the type.
 */

import type { LyreStore, LibraryDoc } from './store';
import { defaultStore } from './store';
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

/** Non-mutating sort matching F1's three library orders. */
function sortSongsBy(songs: readonly SongRecord[], sort: SongSort): SongRecord[] {
	const copy = [...songs];
	switch (sort) {
		case 'alpha':
			return copy.sort((a, b) => a.title.localeCompare(b.title));
		case 'recentlyAdded':
			return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		case 'recentlyPlayed':
			return copy.sort((a, b) => {
				const aPlayed = a.lastPlayedAt ?? '';
				const bPlayed = b.lastPlayedAt ?? '';
				if (aPlayed !== bPlayed) return bPlayed.localeCompare(aPlayed);
				// Songs never played sort after played ones, newest-added first.
				return b.createdAt.localeCompare(a.createdAt);
			});
	}
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
	store: LyreStore = defaultStore
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

	store.mutate((doc) => {
		doc.songs.push(song);
		doc.charts.push(chart);
		if (pattern) doc.patterns.push(pattern);
	});

	return { song, chart, pattern };
}

/** Patch a song's fields, bumping `updatedAt`. */
export async function updateSong(
	id: string,
	patch: Partial<Omit<SongRecord, 'id' | 'createdAt'>>,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const song = doc.songs.find((s) => s.id === id);
		if (!song) return; // Matches Dexie's `update`: a missing id is a silent no-op.
		Object.assign(song, patch, { updatedAt: nowIso() });
	});
}

/** Patch a chart's fields, bumping `updatedAt`. */
export async function updateChart(
	id: string,
	patch: Partial<Omit<ChartRecord, 'id' | 'songId' | 'createdAt'>>,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const chart = doc.charts.find((c) => c.id === id);
		if (!chart) return;
		Object.assign(chart, patch, { updatedAt: nowIso() });
	});
}

export interface UpdateSongAndChartInput {
	songId: string;
	songPatch: Partial<Omit<SongRecord, 'id' | 'createdAt'>>;
	chartId: string;
	chartPatch: Partial<Omit<ChartRecord, 'id' | 'songId' | 'createdAt'>>;
}

/**
 * Patch a song and one of its charts in a single commit (review fix, task
 * E1). The edit screen used to call `updateSong` then `updateChart` as two
 * separate `store.mutate`s — a `StorageQuotaError` on the second write
 * (typically the chart, since it carries the larger ChordPro source) would
 * persist the metadata patch but silently drop the chart edit while telling
 * the user the save failed outright. One `mutate` call is atomic: either
 * both patches land, or (on any error, including quota) neither does.
 */
export async function updateSongAndChart(
	input: UpdateSongAndChartInput,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const timestamp = nowIso();
		const song = doc.songs.find((s) => s.id === input.songId);
		if (song) Object.assign(song, input.songPatch, { updatedAt: timestamp });
		const chart = doc.charts.find((c) => c.id === input.chartId);
		if (chart) Object.assign(chart, input.chartPatch, { updatedAt: timestamp });
	});
}

/** Delete a song, cascading to its charts, their patterns, and (task E2) its collection items. */
export async function deleteSong(id: string, store: LyreStore = defaultStore): Promise<void> {
	store.mutate((doc) => {
		const chartIds = new Set(
			doc.charts.filter((chart) => chart.songId === id).map((chart) => chart.id)
		);
		doc.patterns = doc.patterns.filter((pattern) => !chartIds.has(pattern.chartId));
		doc.charts = doc.charts.filter((chart) => chart.songId !== id);
		doc.songs = doc.songs.filter((song) => song.id !== id);

		// docs/PLAN-v0.3.md §E2: deleting a song deletes its collection items
		// (the reverse of deleting a collection, which never touches songs).
		// Resequence every collection that lost an item so positions stay
		// contiguous 0..n-1, matching the invariant every collections.ts
		// mutator enforces.
		const affectedCollectionIds = new Set(
			doc.collectionItems.filter((item) => item.songId === id).map((item) => item.collectionId)
		);
		if (affectedCollectionIds.size > 0) {
			doc.collectionItems = doc.collectionItems.filter((item) => item.songId !== id);
			for (const collectionId of affectedCollectionIds) {
				const remaining = doc.collectionItems
					.filter((item) => item.collectionId === collectionId)
					.sort((a, b) => a.position - b.position);
				remaining.forEach((item, index) => {
					item.position = index;
				});
			}
		}
	});
}

/** List all songs, sorted per F1 (recently played | recently added | alpha). */
export async function listSongs(
	sort: SongSort = 'alpha',
	store: LyreStore = defaultStore
): Promise<SongRecord[]> {
	return store.read((doc) => sortSongsBy(doc.songs, sort));
}

export interface SongListEntry {
	song: SongRecord;
	/** The chart the library row summarizes: named "Default", else the earliest-created chart. */
	defaultChart?: ChartRecord;
	/** `defaultChart`'s preferred pattern, if it has one yet. */
	preferredPattern?: PatternRecord;
}

/**
 * Picks the chart a song's rows/summaries should use: the one named
 * "Default", else the earliest-created chart. Single source of truth for
 * this rule (task E2 review note: previously inlined only in
 * `listSongsWithDefaultPattern`) — `collections.ts`'s
 * `getCollectionWithSongs` must resolve the exact same chart per song or the
 * library row and the collection row for the same song could show different
 * pattern summaries.
 */
function selectDefaultChart(charts: readonly ChartRecord[]): ChartRecord | undefined {
	if (charts.length === 0) return undefined;
	return (
		charts.find((chart) => chart.name === 'Default') ??
		[...charts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
	);
}

/**
 * Batched (no per-song query) resolution of each song's default chart and
 * that chart's preferred pattern, for every id in `songIds`. Shared by
 * `listSongsWithDefaultPattern` (below) and `collections.ts`'s
 * `getCollectionWithSongs` — both need "the whole library already lives in
 * memory, so resolve everything in one pass" instead of one query per song.
 */
export function resolveDefaultChartsAndPatterns(
	doc: LibraryDoc,
	songIds: Iterable<string>
): {
	defaultChartBySong: Map<string, ChartRecord>;
	preferredPatternBySong: Map<string, PatternRecord>;
} {
	const idSet = new Set(songIds);
	const chartsBySong = new Map<string, ChartRecord[]>();
	for (const chart of doc.charts) {
		if (!idSet.has(chart.songId)) continue;
		const existing = chartsBySong.get(chart.songId);
		if (existing) existing.push(chart);
		else chartsBySong.set(chart.songId, [chart]);
	}

	const defaultChartBySong = new Map<string, ChartRecord>();
	for (const [songId, songCharts] of chartsBySong) {
		const defaultChart = selectDefaultChart(songCharts);
		if (defaultChart) defaultChartBySong.set(songId, defaultChart);
	}

	const defaultChartIds = new Set([...defaultChartBySong.values()].map((chart) => chart.id));
	const preferredByChart = new Map<string, PatternRecord>();
	for (const pattern of doc.patterns) {
		if (pattern.isPreferred && defaultChartIds.has(pattern.chartId)) {
			preferredByChart.set(pattern.chartId, pattern);
		}
	}

	const preferredPatternBySong = new Map<string, PatternRecord>();
	for (const [songId, chart] of defaultChartBySong) {
		const preferred = preferredByChart.get(chart.id);
		if (preferred) preferredPatternBySong.set(songId, preferred);
	}

	return { defaultChartBySong, preferredPatternBySong };
}

/**
 * List songs (per `sort`) alongside each one's default chart and that
 * chart's preferred pattern — everything the Library row needs (F1: title,
 * authors, pattern summary like "G shapes · capo 2 · A").
 *
 * The whole library already lives in memory (that's the point of the
 * single-document store), so this resolves everything in one `store.read`
 * call rather than one query per song — the same "no N+1" guarantee the old
 * Dexie-batched version made, just trivially true now instead of needing
 * `anyOf` lookups to get there.
 */
export async function listSongsWithDefaultPattern(
	sort: SongSort = 'alpha',
	store: LyreStore = defaultStore
): Promise<SongListEntry[]> {
	return store.read((doc) => {
		const songs = sortSongsBy(doc.songs, sort);
		if (songs.length === 0) return [];

		const { defaultChartBySong, preferredPatternBySong } = resolveDefaultChartsAndPatterns(
			doc,
			songs.map((song) => song.id)
		);

		return songs.map((song) => ({
			song,
			defaultChart: defaultChartBySong.get(song.id),
			preferredPattern: preferredPatternBySong.get(song.id)
		}));
	});
}

/**
 * Client-side substring search over title/authors/lyrics (F1: "instant
 * client-side search"). Case-insensitive. Lyrics search reads each song's
 * charts' `chordproSource`.
 */
export async function searchSongs(
	query: string,
	store: LyreStore = defaultStore
): Promise<SongRecord[]> {
	const needle = query.trim().toLowerCase();
	if (!needle) return listSongs('alpha', store);

	return store.read((doc) => {
		const chartTextBySongId = new Map<string, string>();
		for (const chart of doc.charts) {
			const existing = chartTextBySongId.get(chart.songId) ?? '';
			chartTextBySongId.set(chart.songId, `${existing}\n${chart.chordproSource}`);
		}

		const matches = doc.songs.filter((song) => {
			if (song.title.toLowerCase().includes(needle)) return true;
			if (song.authors.some((author) => author.toLowerCase().includes(needle))) return true;
			const lyrics = chartTextBySongId.get(song.id);
			if (lyrics && lyrics.toLowerCase().includes(needle)) return true;
			return false;
		});
		return sortSongsBy(matches, 'alpha');
	});
}

/** Fetch a song with all its charts and each chart's patterns. */
export async function getSongWithDetails(
	songId: string,
	store: LyreStore = defaultStore
): Promise<SongWithDetails | undefined> {
	return store.read((doc) => {
		const song = doc.songs.find((s) => s.id === songId);
		if (!song) return undefined;

		const charts = doc.charts.filter((chart) => chart.songId === songId);
		const chartsWithPatterns = charts.map((chart) => ({
			...chart,
			patterns: doc.patterns.filter((pattern) => pattern.chartId === chart.id)
		}));

		return { song, charts: chartsWithPatterns };
	});
}

/**
 * Mark a pattern as the chart's preferred one, unsetting any previous
 * preferred pattern on the same chart in one commit
 * (domain-model.md §5: "exactly one preferred pattern per chart").
 */
export async function setPreferredPattern(
	patternId: string,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const pattern = doc.patterns.find((p) => p.id === patternId);
		if (!pattern) throw new Error(`setPreferredPattern: no pattern with id ${patternId}`);

		for (const sibling of doc.patterns) {
			if (sibling.chartId === pattern.chartId && sibling.id !== patternId && sibling.isPreferred) {
				sibling.isPreferred = false;
			}
		}
		pattern.isPreferred = true;
	});
}

export interface SavePatternInput {
	/**
	 * When set and it matches an existing pattern's id, that pattern is
	 * updated in place instead of inserting a new row — the upsert path used
	 * by "Save as my pattern" (task B3) so repeatedly re-saving over the same
	 * preferred pattern doesn't accumulate orphaned rows. Omit (or pass an id
	 * that doesn't exist yet) to insert a genuinely new pattern.
	 */
	id?: string;
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
 * Insert a new pattern for a chart, or update one in place when `input.id`
 * matches an existing pattern (upsert). If `isPreferred` is set (or this is
 * the chart's first pattern), enforces the exactly-one-preferred invariant.
 */
export async function savePattern(
	input: SavePatternInput,
	store: LyreStore = defaultStore
): Promise<PatternRecord> {
	return store.mutate((doc) => {
		const siblings = doc.patterns.filter((p) => p.chartId === input.chartId);
		const existing = input.id ? (siblings.find((s) => s.id === input.id) ?? null) : null;

		// A chart's first pattern is always preferred, regardless of what the
		// caller passes — otherwise the chart would have zero preferred
		// patterns, violating the exactly-one-preferred invariant. An upsert
		// that's already the only pattern (updating itself) counts as "no
		// other siblings" for this purpose too.
		const otherSiblings = existing ? siblings.filter((s) => s.id !== existing.id) : siblings;
		const shouldBePreferred = otherSiblings.length === 0 ? true : (input.isPreferred ?? false);

		const pattern: PatternRecord = {
			id: existing?.id ?? newId(),
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
			for (const sibling of otherSiblings) {
				if (sibling.isPreferred) sibling.isPreferred = false;
			}
		}

		if (existing) {
			Object.assign(existing, pattern);
		} else {
			doc.patterns.push(pattern);
		}
		return pattern;
	});
}

/** Stamp a song's `lastPlayedAt` to now (F1 "recently played" sort). */
export async function touchLastPlayed(
	songId: string,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const song = doc.songs.find((s) => s.id === songId);
		if (song) song.lastPlayedAt = nowIso();
	});
}
