import { beforeEach, describe, expect, it } from 'vitest';
import type { LyreStore } from './store';
import { createTestStore } from './store';
import { createSong, deleteSong, savePattern, setPreferredPattern } from './repo';
import {
	addSongToCollection,
	createCollection,
	deleteCollection,
	getCollectionWithSongs,
	listCollections,
	listCollectionsForSong,
	removeSongFromCollection,
	reorderCollection,
	updateCollection
} from './collections';
import { exportLibrary, importLibrary } from './exportImport';
import type { SongRecord, ChartRecord } from '$lib/theory/types';

let store: LyreStore;

beforeEach(() => {
	store = createTestStore();
});

function songInput(overrides: Partial<Omit<SongRecord, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
	return {
		title: 'Amazing Grace',
		aliases: [],
		authors: ['John Newton'],
		defaultKey: 'Ab',
		topics: [],
		...overrides
	};
}

function chartInput(
	overrides: Partial<Omit<ChartRecord, 'id' | 'songId' | 'createdAt' | 'updatedAt'>> = {}
) {
	return {
		name: 'Default',
		chordproSource: '{title: Amazing Grace}\n[G]Amazing grace how sweet the sound',
		sourceKey: 'Ab',
		...overrides
	};
}

async function makeSong(title: string) {
	return createSong({ song: songInput({ title }), chart: chartInput() }, store);
}

describe('createCollection / updateCollection / deleteCollection', () => {
	it('creates an empty, named collection', async () => {
		const collection = await createCollection({ name: 'Sunday Set', description: 'AM' }, store);
		expect(collection.id).toBeTruthy();
		expect(collection.name).toBe('Sunday Set');
		expect(collection.description).toBe('AM');

		const summaries = await listCollections(store);
		expect(summaries).toEqual([{ collection, songCount: 0 }]);
	});

	it('updates name/description and bumps updatedAt', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await updateCollection(collection.id, { name: 'Sunday AM' }, store);

		const [summary] = await listCollections(store);
		expect(summary.collection.name).toBe('Sunday AM');
		expect(summary.collection.updatedAt).not.toBe(collection.updatedAt);
	});

	it('is a silent no-op for a missing id', async () => {
		await expect(updateCollection('nonexistent', { name: 'x' }, store)).resolves.toBeUndefined();
		await expect(deleteCollection('nonexistent', store)).resolves.toBeUndefined();
	});

	it('deleting a collection deletes its items but never its songs', async () => {
		const { song } = await makeSong('Amazing Grace');
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		await addSongToCollection(collection.id, song.id, store);

		await deleteCollection(collection.id, store);

		expect(await getCollectionWithSongs(collection.id, store)).toBeUndefined();
		expect(store.read((doc) => doc.collectionItems)).toEqual([]);
		// The song itself must survive.
		expect(store.read((doc) => doc.songs.find((s) => s.id === song.id))).toBeDefined();
	});
});

describe('listCollections', () => {
	it('sorts alphabetically by name and reports song counts', async () => {
		const zebra = await createCollection({ name: 'Zebra Set' }, store);
		const apple = await createCollection({ name: 'Apple Set' }, store);
		const { song } = await makeSong('Amazing Grace');
		await addSongToCollection(apple.id, song.id, store);

		const summaries = await listCollections(store);
		expect(summaries.map((s) => s.collection.id)).toEqual([apple.id, zebra.id]);
		expect(summaries.find((s) => s.collection.id === apple.id)?.songCount).toBe(1);
		expect(summaries.find((s) => s.collection.id === zebra.id)?.songCount).toBe(0);
	});
});

describe('addSongToCollection', () => {
	it('appends at the end and is idempotent', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('Amazing Grace');
		const b = await makeSong('Second Song');

		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);
		// Re-adding the same song must not create a duplicate row or move it.
		await addSongToCollection(collection.id, a.song.id, store);

		const detail = await getCollectionWithSongs(collection.id, store);
		expect(detail?.items.map((i) => i.song.id)).toEqual([a.song.id, b.song.id]);
		expect(detail?.items.map((i) => i.item.position)).toEqual([0, 1]);
	});

	it('is a silent no-op for a missing collection or song id', async () => {
		const { song } = await makeSong('Amazing Grace');
		await expect(addSongToCollection('nonexistent', song.id, store)).resolves.toBeUndefined();

		const collection = await createCollection({ name: 'Sunday Set' }, store);
		await expect(addSongToCollection(collection.id, 'nonexistent', store)).resolves.toBeUndefined();
		expect((await getCollectionWithSongs(collection.id, store))?.items).toEqual([]);
	});
});

describe('removeSongFromCollection', () => {
	it('resequences remaining positions to stay contiguous', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		const c = await makeSong('C');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);
		await addSongToCollection(collection.id, c.song.id, store);

		await removeSongFromCollection(collection.id, b.song.id, store);

		const detail = await getCollectionWithSongs(collection.id, store);
		expect(detail?.items.map((i) => i.song.id)).toEqual([a.song.id, c.song.id]);
		expect(detail?.items.map((i) => i.item.position)).toEqual([0, 1]);
	});

	it('is a silent no-op when the song is not a member', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const { song } = await makeSong('Amazing Grace');
		await expect(removeSongFromCollection(collection.id, song.id, store)).resolves.toBeUndefined();
	});
});

describe('reorderCollection', () => {
	it('reorders to match the requested order', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		const c = await makeSong('C');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);
		await addSongToCollection(collection.id, c.song.id, store);

		await reorderCollection(collection.id, [c.song.id, a.song.id, b.song.id], store);

		const detail = await getCollectionWithSongs(collection.id, store);
		expect(detail?.items.map((i) => i.song.id)).toEqual([c.song.id, a.song.id, b.song.id]);
		expect(detail?.items.map((i) => i.item.position)).toEqual([0, 1, 2]);
	});

	it('ignores foreign ids not in the collection', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		const foreign = await makeSong('Not in this set');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);

		await reorderCollection(collection.id, [b.song.id, foreign.song.id, a.song.id], store);

		const detail = await getCollectionWithSongs(collection.id, store);
		expect(detail?.items.map((i) => i.song.id)).toEqual([b.song.id, a.song.id]);
	});

	it('preserves an existing member omitted from a partial list, appending it rather than dropping it', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		const c = await makeSong('C');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);
		await addSongToCollection(collection.id, c.song.id, store);

		// Caller only knows about b and a (e.g. a filtered view) — c must
		// survive the reorder, not be silently dropped from the set.
		await reorderCollection(collection.id, [b.song.id, a.song.id], store);

		const detail = await getCollectionWithSongs(collection.id, store);
		expect(detail?.items.map((i) => i.song.id)).toEqual([b.song.id, a.song.id, c.song.id]);
		expect(detail?.items.map((i) => i.item.position)).toEqual([0, 1, 2]);
	});

	it('is a silent no-op for a missing collection id', async () => {
		await expect(reorderCollection('nonexistent', [], store)).resolves.toBeUndefined();
	});

	// Regression test (review fix, task E2): a duplicate id in the caller's
	// list used to map to the *same* CollectionItemRecord object twice —
	// pushed into doc.collectionItems twice, then `resequence` stomped that
	// shared object's `position` on each pass. The persisted doc ended up
	// with two rows sharing one id and one position, position 0 missing, and
	// the at-most-once-per-collection invariant silently broken. E3's
	// move-up/move-down handler rebuilding an array from a stale snapshot is
	// a realistic way to produce a duplicate id, so this must be defensive
	// against it, same as it already is against foreign ids.
	it('collapses a duplicate id in the requested order to its first occurrence, never duplicating the row', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);

		await reorderCollection(collection.id, [a.song.id, a.song.id, b.song.id], store);

		const detail = await getCollectionWithSongs(collection.id, store);
		expect(detail?.items.map((i) => i.song.id)).toEqual([a.song.id, b.song.id]);
		expect(detail?.items.map((i) => i.item.position)).toEqual([0, 1]);
		// No duplicate rows (same id or same position) got written to the doc.
		const rawItems = store.read((doc) =>
			doc.collectionItems.filter((item) => item.collectionId === collection.id)
		);
		expect(rawItems).toHaveLength(2);
		expect(new Set(rawItems.map((item) => item.id)).size).toBe(2);
		const summaries = await listCollections(store);
		expect(summaries.find((s) => s.collection.id === collection.id)?.songCount).toBe(2);
	});
});

describe('deleteSong cascade into collection items', () => {
	it('removes the song from every collection it was in and resequences positions', async () => {
		const setA = await createCollection({ name: 'Set A' }, store);
		const setB = await createCollection({ name: 'Set B' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		await addSongToCollection(setA.id, a.song.id, store);
		await addSongToCollection(setA.id, b.song.id, store);
		await addSongToCollection(setB.id, b.song.id, store);

		await deleteSong(b.song.id, store);

		const detailA = await getCollectionWithSongs(setA.id, store);
		expect(detailA?.items.map((i) => i.song.id)).toEqual([a.song.id]);
		expect(detailA?.items.map((i) => i.item.position)).toEqual([0]);

		const detailB = await getCollectionWithSongs(setB.id, store);
		expect(detailB?.items).toEqual([]);
	});
});

describe('getCollectionWithSongs', () => {
	it('returns undefined for a missing id', async () => {
		expect(await getCollectionWithSongs('nonexistent', store)).toBeUndefined();
	});

	it('orders items by position and resolves each song default chart + preferred pattern with no per-song lookups', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await createSong(
			{
				song: songInput({ title: 'A' }),
				chart: chartInput({ name: 'Default' }),
				pattern: { label: 'Usual', soundingKey: 'G', shapeKey: 'G', capo: 0 }
			},
			store
		);
		// A second, non-preferred pattern on the same chart to prove the
		// resolver picks the preferred one, not just "some" pattern.
		await savePattern(
			{ chartId: a.chart.id, label: 'Other', soundingKey: 'A', shapeKey: 'A', capo: 0 },
			store
		);
		await setPreferredPattern(a.pattern!.id, store);

		const b = await createSong({ song: songInput({ title: 'B' }), chart: chartInput() }, store);

		await addSongToCollection(collection.id, b.song.id, store);
		await addSongToCollection(collection.id, a.song.id, store);
		await reorderCollection(collection.id, [a.song.id, b.song.id], store);

		const detail = await getCollectionWithSongs(collection.id, store);
		expect(detail?.items.map((i) => i.song.title)).toEqual(['A', 'B']);
		expect(detail?.items[0].defaultChart?.id).toBe(a.chart.id);
		expect(detail?.items[0].preferredPattern?.id).toBe(a.pattern!.id);
		expect(detail?.items[1].defaultChart?.id).toBe(b.chart.id);
		expect(detail?.items[1].preferredPattern).toBeUndefined();
	});
});

describe('listCollectionsForSong', () => {
	it('lists only the collections a song belongs to, alpha by name', async () => {
		const zebra = await createCollection({ name: 'Zebra Set' }, store);
		const apple = await createCollection({ name: 'Apple Set' }, store);
		const other = await createCollection({ name: 'Other Set' }, store);
		const { song } = await makeSong('Amazing Grace');
		await addSongToCollection(zebra.id, song.id, store);
		await addSongToCollection(apple.id, song.id, store);

		const collections = await listCollectionsForSong(song.id, store);
		expect(collections.map((c) => c.id)).toEqual([apple.id, zebra.id]);
		void other;
	});

	it('returns an empty array for a song in no collections', async () => {
		const { song } = await makeSong('Amazing Grace');
		expect(await listCollectionsForSong(song.id, store)).toEqual([]);
	});
});

describe('export / import for collections (task E2)', () => {
	it('round-trips collections and collectionItems losslessly', async () => {
		const collection = await createCollection({ name: 'Sunday Set', description: 'AM' }, store);
		const a = await makeSong('Amazing Grace');
		const b = await makeSong('Second Song');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);

		const zip = await exportLibrary(store);
		const target = createTestStore();
		const result = await importLibrary(zip, target);

		expect(result.collectionsImported).toBe(1);
		expect(result.collectionsSkipped).toBe(0);

		const detail = await getCollectionWithSongs(collection.id, target);
		expect(detail?.collection).toEqual(collection);
		expect(detail?.items.map((i) => i.song.id)).toEqual([a.song.id, b.song.id]);
	});

	it('skips a collection whose id already exists in the target, along with its items', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const { song } = await makeSong('Amazing Grace');
		await addSongToCollection(collection.id, song.id, store);
		const zip = await exportLibrary(store);

		const target = createTestStore();
		target.mutate((doc) => {
			doc.collections.push({ ...collection, name: 'Edited Locally' });
			doc.songs.push({ ...song });
		});

		const result = await importLibrary(zip, target);
		expect(result.collectionsImported).toBe(0);
		expect(result.collectionsSkipped).toBe(1);

		const targetCollection = target.read((doc) =>
			doc.collections.find((c) => c.id === collection.id)
		);
		expect(targetCollection?.name).toBe('Edited Locally');
		// The pre-existing collection's items must not be touched or duplicated
		// by the skipped import.
		expect(target.read((doc) => doc.collectionItems)).toEqual([]);
	});

	it('drops collection items whose song is not present in the target after import, resequencing what remains', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		const c = await makeSong('C');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);
		await addSongToCollection(collection.id, c.song.id, store);
		const zip = await exportLibrary(store);

		// Target already has song b under the same id — importLibrary skips
		// re-inserting it, but it's still present, so only a dangling
		// reference (one with no matching song at all) should get dropped.
		// Simulate that by stripping song c's chart/song data from the
		// archive's manifest so its collection item references a song id
		// that will never exist in the target.
		const { unzipSync, strFromU8, strToU8, zipSync } = await import('fflate');
		const files = unzipSync(zip);
		const manifest = JSON.parse(strFromU8(files['manifest.json']));
		manifest.songs = manifest.songs.filter((s: { id: string }) => s.id !== c.song.id);
		manifest.charts = manifest.charts.filter((ch: { songId: string }) => ch.songId !== c.song.id);
		files['manifest.json'] = strToU8(JSON.stringify(manifest));
		const trimmedZip = zipSync(files, { level: 0 });

		const target = createTestStore();
		await importLibrary(trimmedZip, target);

		const detail = await getCollectionWithSongs(collection.id, target);
		expect(detail?.items.map((i) => i.song.id)).toEqual([a.song.id, b.song.id]);
		expect(detail?.items.map((i) => i.item.position)).toEqual([0, 1]);
	});

	// Regression test (review fix, task E2): import is the one place data
	// from an older/buggy/untrusted origin enters the store, so a manifest
	// with two membership rows for the same (collectionId, songId) pair —
	// e.g. a backup taken while the reorderCollection duplicate-id bug above
	// was still live — must not be laundered into a doc that *looks* valid.
	// Before this fix, the resequence step handed both rows distinct
	// contiguous positions, hiding the at-most-once violation instead of
	// surfacing it.
	it('dedupes duplicate (collectionId, songId) membership rows in the manifest on import', async () => {
		const collection = await createCollection({ name: 'Sunday Set' }, store);
		const a = await makeSong('A');
		const b = await makeSong('B');
		await addSongToCollection(collection.id, a.song.id, store);
		await addSongToCollection(collection.id, b.song.id, store);
		const zip = await exportLibrary(store);

		const { unzipSync, strFromU8, strToU8, zipSync } = await import('fflate');
		const files = unzipSync(zip);
		const manifest = JSON.parse(strFromU8(files['manifest.json']));
		// Simulate a corrupt archive: duplicate the membership row for `a`
		// (same collectionId/songId, different item id — mirrors what the
		// reorderCollection bug used to persist).
		const originalItem = manifest.collectionItems.find(
			(item: { songId: string }) => item.songId === a.song.id
		);
		manifest.collectionItems.push({ ...originalItem, id: crypto.randomUUID() });
		files['manifest.json'] = strToU8(JSON.stringify(manifest));
		const corruptZip = zipSync(files, { level: 0 });

		const target = createTestStore();
		await importLibrary(corruptZip, target);

		const detail = await getCollectionWithSongs(collection.id, target);
		expect(detail?.items.map((i) => i.song.id)).toEqual([a.song.id, b.song.id]);
		expect(detail?.items.map((i) => i.item.position)).toEqual([0, 1]);
		const summaries = await listCollections(target);
		expect(summaries.find((s) => s.collection.id === collection.id)?.songCount).toBe(2);
	});
});
