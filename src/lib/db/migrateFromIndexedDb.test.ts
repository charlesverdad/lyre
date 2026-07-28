import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// `migrateFromIndexedDb.ts` (like the browser) reads the ambient global
// `indexedDB`, not a module import — this file does the same so seeding and
// migrating always talk to the same factory instance, including after
// `beforeEach` below swaps it out for a fresh one.
import { migrateFromIndexedDbOnce } from './migrateFromIndexedDb';
import { InMemoryStorage, LyreStore } from './store';
import type { SongRecord, ChartRecord, PatternRecord } from '$lib/theory/types';

// fake-indexeddb's `indexedDB` is a shared module-level singleton — reset it
// between tests (a fresh `IDBFactory`) so one test's Dexie-shaped `lyre` db
// can't leak into the next, mirroring how each test would see a fresh
// browser profile.
beforeEach(() => {
	vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const song: SongRecord = {
	id: 'song-1',
	title: 'Amazing Grace',
	aliases: [],
	authors: ['John Newton'],
	defaultKey: 'C',
	topics: [],
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
};

const chart: ChartRecord = {
	id: 'chart-1',
	songId: 'song-1',
	name: 'Default',
	chordproSource: '[C]Amazing [F]grace, how [C]sweet the sound',
	sourceKey: 'C',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z'
};

const pattern: PatternRecord = {
	id: 'pattern-1',
	chartId: 'chart-1',
	label: 'My usual',
	soundingKey: 'C',
	shapeKey: 'C',
	capo: 0,
	isPreferred: true
};

/** Seeds a Dexie-shaped `lyre` database directly via raw IndexedDB (no Dexie dependency in this task's tests, matching the migration code itself). */
function seedLegacyDatabase(rows: {
	songs?: SongRecord[];
	charts?: ChartRecord[];
	patterns?: PatternRecord[];
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('lyre', 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			db.createObjectStore('songs', { keyPath: 'id' });
			db.createObjectStore('charts', { keyPath: 'id' });
			db.createObjectStore('patterns', { keyPath: 'id' });
		};
		request.onsuccess = () => {
			const db = request.result;
			const tx = db.transaction(['songs', 'charts', 'patterns'], 'readwrite');
			for (const s of rows.songs ?? []) tx.objectStore('songs').put(s);
			for (const c of rows.charts ?? []) tx.objectStore('charts').put(c);
			for (const p of rows.patterns ?? []) tx.objectStore('patterns').put(p);
			tx.oncomplete = () => {
				db.close();
				resolve();
			};
			tx.onerror = () => reject(tx.error);
		};
		request.onerror = () => reject(request.error);
	});
}

describe('migrateFromIndexedDbOnce', () => {
	it('seeds the store from an existing Dexie-shaped IndexedDB library', async () => {
		await seedLegacyDatabase({ songs: [song], charts: [chart], patterns: [pattern] });

		const store = new LyreStore(new InMemoryStorage());
		await migrateFromIndexedDbOnce(store);

		const doc = store.read((d) => d);
		expect(doc.songs).toEqual([song]);
		expect(doc.charts).toEqual([chart]);
		expect(doc.patterns).toEqual([pattern]);
		expect(store.hasPersistedDoc()).toBe(true);
	});

	it('never deletes the legacy IndexedDB database', async () => {
		await seedLegacyDatabase({ songs: [song], charts: [chart], patterns: [pattern] });

		const store = new LyreStore(new InMemoryStorage());
		await migrateFromIndexedDbOnce(store);

		const databases = await indexedDB.databases();
		expect(databases.some((d) => d.name === 'lyre')).toBe(true);
	});

	it('is a no-op when the store already has a persisted doc', async () => {
		await seedLegacyDatabase({ songs: [song], charts: [chart], patterns: [pattern] });

		const store = new LyreStore(new InMemoryStorage());
		// Simulate "already migrated" / "user already has local data" by
		// writing something before migration ever runs.
		store.mutate((doc) => {
			doc.songs.push({ ...song, id: 'already-here' });
		});

		await migrateFromIndexedDbOnce(store);

		const doc = store.read((d) => d);
		expect(doc.songs).toHaveLength(1);
		expect(doc.songs[0].id).toBe('already-here');
	});

	it('boots empty (and leaves the store unwritten) when there is no legacy database', async () => {
		const store = new LyreStore(new InMemoryStorage());
		await migrateFromIndexedDbOnce(store);

		expect(store.read((d) => d.songs)).toEqual([]);
		expect(store.hasPersistedDoc()).toBe(false);
	});

	it('boots empty when indexedDB itself is unavailable (e.g. a locked-down browser)', async () => {
		vi.stubGlobal('indexedDB', undefined);
		const store = new LyreStore(new InMemoryStorage());

		await expect(migrateFromIndexedDbOnce(store)).resolves.toBeUndefined();
		expect(store.read((d) => d.songs)).toEqual([]);
		expect(store.hasPersistedDoc()).toBe(false);
	});

	it('boots empty (no throw) when a `lyre` database exists but lacks the expected object stores', async () => {
		// Some other, unrelated use of the `lyre` name (or a half-created
		// database) — must be read as "nothing to migrate", not crash.
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('lyre', 1);
			request.onupgradeneeded = () => {
				request.result.createObjectStore('unrelated', { keyPath: 'id' });
			};
			request.onsuccess = () => {
				request.result.close();
				resolve();
			};
			request.onerror = () => reject(request.error);
		});

		const store = new LyreStore(new InMemoryStorage());
		await expect(migrateFromIndexedDbOnce(store)).resolves.toBeUndefined();
		expect(store.read((d) => d.songs)).toEqual([]);
		expect(store.hasPersistedDoc()).toBe(false);
	});

	it('logs and leaves the key unset (retry next boot) when reading the legacy database throws', async () => {
		await seedLegacyDatabase({ songs: [song], charts: [chart], patterns: [pattern] });

		// Simulate a read failure partway through (e.g. a browser-specific
		// IndexedDB quirk) by making `transaction()` throw for the last of the
		// three parallel `getAll` calls — migrateFromIndexedDbOnce must catch
		// this rather than let it bubble up and brick the app.
		const originalTransaction = IDBDatabase.prototype.transaction;
		const transactionSpy = vi
			.spyOn(IDBDatabase.prototype, 'transaction')
			.mockImplementation(function (
				this: IDBDatabase,
				...args: Parameters<typeof originalTransaction>
			) {
				if (args[0] === 'patterns') throw new Error('simulated IndexedDB failure');
				return originalTransaction.apply(this, args);
			});

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = new LyreStore(new InMemoryStorage());

		await expect(migrateFromIndexedDbOnce(store)).resolves.toBeUndefined();
		expect(store.hasPersistedDoc()).toBe(false);
		expect(consoleSpy).toHaveBeenCalled();

		transactionSpy.mockRestore();
		consoleSpy.mockRestore();
	});
});
