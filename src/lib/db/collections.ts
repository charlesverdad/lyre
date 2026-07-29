/**
 * Repository functions for the collections domain (task E2,
 * docs/PLAN-v0.3.md §E2) — the second half of `docs/domain-model.md` §5's
 * `Collection`/membership records.
 *
 * These own the cross-record invariants the plan calls out:
 *
 *   - A song appears at most once per collection (`addSongToCollection` is
 *     idempotent).
 *   - `CollectionItemRecord.position` stays contiguous `0..n-1` and is
 *     resequenced on every mutation that can open a gap or change order.
 *   - Deleting a collection deletes its items, never its songs.
 *   - Deleting a song deletes its collection items — that half of the
 *     cascade lives in `repo.ts`'s `deleteSong` (it owns the songs table),
 *     not here.
 *
 * Same house convention as `repo.ts`: every export is `async`/returns a
 * `Promise` even though the store is synchronous, with an optional trailing
 * `store: LyreStore = defaultStore` parameter.
 */

import type { LyreStore } from './store';
import { defaultStore } from './store';
import { resolveDefaultChartsAndPatterns } from './repo';
import type {
	CollectionRecord,
	CollectionItemRecord,
	SongRecord,
	ChartRecord,
	PatternRecord
} from '$lib/theory/types';

function newId(): string {
	return crypto.randomUUID();
}

function nowIso(): string {
	return new Date().toISOString();
}

/** Resequences `items` in place to contiguous positions `0..n-1`, in their current array order. */
function resequence(items: CollectionItemRecord[]): void {
	items.forEach((item, index) => {
		item.position = index;
	});
}

export interface CollectionSummary {
	collection: CollectionRecord;
	songCount: number;
}

export interface CollectionDetailItem {
	item: CollectionItemRecord;
	song: SongRecord;
	defaultChart?: ChartRecord;
	preferredPattern?: PatternRecord;
}

export interface CollectionDetail {
	collection: CollectionRecord;
	/** Ordered by `item.position`. */
	items: CollectionDetailItem[];
}

export interface CreateCollectionInput {
	name: string;
	description?: string;
}

/** Create an empty, named collection. */
export async function createCollection(
	input: CreateCollectionInput,
	store: LyreStore = defaultStore
): Promise<CollectionRecord> {
	const timestamp = nowIso();
	const collection: CollectionRecord = {
		id: newId(),
		name: input.name,
		description: input.description,
		createdAt: timestamp,
		updatedAt: timestamp
	};
	store.mutate((doc) => {
		doc.collections.push(collection);
	});
	return collection;
}

export interface UpdateCollectionPatch {
	name?: string;
	description?: string;
}

/** Patch a collection's name/description, bumping `updatedAt`. Missing id is a silent no-op (matches `repo.ts`'s `updateSong`). */
export async function updateCollection(
	id: string,
	patch: UpdateCollectionPatch,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const collection = doc.collections.find((c) => c.id === id);
		if (!collection) return;
		Object.assign(collection, patch, { updatedAt: nowIso() });
	});
}

/** Delete a collection and its membership rows. Never touches the songs those rows reference. */
export async function deleteCollection(id: string, store: LyreStore = defaultStore): Promise<void> {
	store.mutate((doc) => {
		doc.collectionItems = doc.collectionItems.filter((item) => item.collectionId !== id);
		doc.collections = doc.collections.filter((c) => c.id !== id);
	});
}

/** List every collection, alpha by name, with each one's song count. */
export async function listCollections(
	store: LyreStore = defaultStore
): Promise<CollectionSummary[]> {
	return store.read((doc) => {
		const counts = new Map<string, number>();
		for (const item of doc.collectionItems) {
			counts.set(item.collectionId, (counts.get(item.collectionId) ?? 0) + 1);
		}
		return [...doc.collections]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((collection) => ({
				collection,
				songCount: counts.get(collection.id) ?? 0
			}));
	});
}

/**
 * A collection with its member songs resolved in position order, each
 * carrying its default chart + preferred pattern (same rule and same
 * batched, no-per-song-lookup shape as `repo.ts`'s
 * `listSongsWithDefaultPattern`, via the shared `resolveDefaultChartsAndPatterns`
 * helper).
 *
 * A membership row whose song no longer exists is skipped rather than
 * thrown on — `deleteSong`'s cascade should make this impossible in
 * practice, but this stays defensive against any future direct doc
 * manipulation (e.g. a hand-edited import) rather than crashing a screen.
 */
export async function getCollectionWithSongs(
	id: string,
	store: LyreStore = defaultStore
): Promise<CollectionDetail | undefined> {
	return store.read((doc) => {
		const collection = doc.collections.find((c) => c.id === id);
		if (!collection) return undefined;

		const items = doc.collectionItems
			.filter((item) => item.collectionId === id)
			.sort((a, b) => a.position - b.position);

		const songById = new Map(doc.songs.map((song) => [song.id, song]));
		const { defaultChartBySong, preferredPatternBySong } = resolveDefaultChartsAndPatterns(
			doc,
			items.map((item) => item.songId)
		);

		const resolvedItems: CollectionDetailItem[] = [];
		for (const item of items) {
			const song = songById.get(item.songId);
			if (!song) continue;
			resolvedItems.push({
				item,
				song,
				defaultChart: defaultChartBySong.get(song.id),
				preferredPattern: preferredPatternBySong.get(song.id)
			});
		}

		return { collection, items: resolvedItems };
	});
}

/** Add a song to a collection, appended at the end. Idempotent: already-present song is a no-op. Missing collection/song id is a silent no-op. */
export async function addSongToCollection(
	collectionId: string,
	songId: string,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const collection = doc.collections.find((c) => c.id === collectionId);
		if (!collection) return;
		if (!doc.songs.some((song) => song.id === songId)) return;

		const existing = doc.collectionItems.filter((item) => item.collectionId === collectionId);
		if (existing.some((item) => item.songId === songId)) return; // Already a member — idempotent.

		const newItem: CollectionItemRecord = {
			id: newId(),
			collectionId,
			songId,
			position: existing.length
		};
		doc.collectionItems.push(newItem);
		collection.updatedAt = nowIso();
	});
}

/** Remove a song from a collection, resequencing the remaining items' positions. Not a member is a silent no-op. */
export async function removeSongFromCollection(
	collectionId: string,
	songId: string,
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const collection = doc.collections.find((c) => c.id === collectionId);
		const forCollection = doc.collectionItems.filter((item) => item.collectionId === collectionId);
		const remaining = forCollection
			.filter((item) => item.songId !== songId)
			.sort((a, b) => a.position - b.position);

		if (remaining.length === forCollection.length) return; // Song wasn't a member — no-op.

		resequence(remaining);
		doc.collectionItems = [
			...doc.collectionItems.filter((item) => item.collectionId !== collectionId),
			...remaining
		];
		if (collection) collection.updatedAt = nowIso();
	});
}

/**
 * Reorder a collection's songs to match `orderedSongIds`. Defensive on both
 * sides of the list, since this is driven by UI state that can be stale or
 * partial:
 *
 *   - Ids in `orderedSongIds` that aren't actually members (foreign ids,
 *     already-removed songs) are ignored — reordering can never create
 *     membership.
 *   - Existing members `orderedSongIds` omits are **not** dropped: they're
 *     appended after the requested order, preserving their relative order.
 *     A UI that reorders a partial view of the collection (e.g. a filtered
 *     "add songs" sheet) must never silently lose a song from the set —
 *     that's a data-loss bug, not just a display quirk.
 */
export async function reorderCollection(
	collectionId: string,
	orderedSongIds: string[],
	store: LyreStore = defaultStore
): Promise<void> {
	store.mutate((doc) => {
		const collection = doc.collections.find((c) => c.id === collectionId);
		if (!collection) return;

		const current = doc.collectionItems.filter((item) => item.collectionId === collectionId);
		const bySongId = new Map(current.map((item) => [item.songId, item]));

		const requestedOrder = orderedSongIds.filter((songId) => bySongId.has(songId));
		const requestedSet = new Set(requestedOrder);

		const omitted = current
			.filter((item) => !requestedSet.has(item.songId))
			.sort((a, b) => a.position - b.position);

		const newOrder = [...requestedOrder.map((songId) => bySongId.get(songId)!), ...omitted];
		resequence(newOrder);

		doc.collectionItems = [
			...doc.collectionItems.filter((item) => item.collectionId !== collectionId),
			...newOrder
		];
		collection.updatedAt = nowIso();
	});
}

/** List every collection a song belongs to, alpha by name. */
export async function listCollectionsForSong(
	songId: string,
	store: LyreStore = defaultStore
): Promise<CollectionRecord[]> {
	return store.read((doc) => {
		const collectionIds = new Set(
			doc.collectionItems.filter((item) => item.songId === songId).map((item) => item.collectionId)
		);
		return doc.collections
			.filter((collection) => collectionIds.has(collection.id))
			.sort((a, b) => a.name.localeCompare(b.name));
	});
}
