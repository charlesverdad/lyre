import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryStorage, LyreStore, StorageQuotaError, LIBRARY_STORAGE_KEY } from './store';

function makeQuotaError(): DOMException {
	// Matches the shape browsers throw from `Storage.setItem` when the
	// origin's quota is exceeded — `store.ts`'s `isQuotaExceededError` checks
	// `name`/`code`, not `instanceof`, so a plain object would do too, but
	// this is closer to the real thing.
	return new DOMException('quota exceeded', 'QuotaExceededError');
}

describe('LyreStore read/mutate', () => {
	it('starts from an empty doc when the key is absent', () => {
		const store = new LyreStore(new InMemoryStorage());
		expect(store.read((doc) => doc)).toEqual({
			schemaVersion: 2,
			songs: [],
			charts: [],
			patterns: [],
			collections: [],
			collectionItems: []
		});
		expect(store.hasPersistedDoc()).toBe(false);
	});

	it('mutate persists synchronously and read sees it back', () => {
		const store = new LyreStore(new InMemoryStorage());
		store.mutate((doc) => {
			doc.songs.push({
				id: 's1',
				title: 'Amazing Grace',
				aliases: [],
				authors: [],
				defaultKey: 'C',
				topics: [],
				createdAt: 'a',
				updatedAt: 'a'
			});
		});
		expect(store.hasPersistedDoc()).toBe(true);
		expect(store.read((doc) => doc.songs)).toHaveLength(1);
	});

	it('read hands back a clone: mutating the result never corrupts the cache', () => {
		const store = new LyreStore(new InMemoryStorage());
		store.mutate((doc) => {
			doc.songs.push({
				id: 's1',
				title: 'Original',
				aliases: [],
				authors: [],
				defaultKey: 'C',
				topics: [],
				createdAt: 'a',
				updatedAt: 'a'
			});
		});

		const songs = store.read((doc) => doc.songs);
		songs[0].title = 'Mutated by caller';

		expect(store.read((doc) => doc.songs[0].title)).toBe('Original');
	});

	it('a throwing mutator writes nothing', () => {
		const storage = new InMemoryStorage();
		const store = new LyreStore(storage);
		expect(() =>
			store.mutate((doc) => {
				doc.songs.push({
					id: 's1',
					title: 'x',
					aliases: [],
					authors: [],
					defaultKey: 'C',
					topics: [],
					createdAt: 'a',
					updatedAt: 'a'
				});
				throw new Error('boom');
			})
		).toThrow('boom');

		expect(store.hasPersistedDoc()).toBe(false);
		expect(store.read((doc) => doc.songs)).toHaveLength(0);
	});
});

describe('LyreStore quota handling', () => {
	it('rolls back the in-memory doc and throws StorageQuotaError when the write fails', () => {
		const storage = new InMemoryStorage();
		const store = new LyreStore(storage);

		// Seed one song so we can prove the rollback keeps *this*, not the
		// failed mutation's addition.
		store.mutate((doc) => {
			doc.songs.push({
				id: 's1',
				title: 'Kept',
				aliases: [],
				authors: [],
				defaultKey: 'C',
				topics: [],
				createdAt: 'a',
				updatedAt: 'a'
			});
		});

		const setItemSpy = vi.spyOn(storage, 'setItem').mockImplementation(() => {
			throw makeQuotaError();
		});

		expect(() =>
			store.mutate((doc) => {
				doc.songs.push({
					id: 's2',
					title: 'Should not persist',
					aliases: [],
					authors: [],
					defaultKey: 'C',
					topics: [],
					createdAt: 'b',
					updatedAt: 'b'
				});
			})
		).toThrow(StorageQuotaError);

		setItemSpy.mockRestore();

		const songs = store.read((doc) => doc.songs);
		expect(songs).toHaveLength(1);
		expect(songs[0].id).toBe('s1');
	});

	it('a non-quota storage error propagates as-is, not as StorageQuotaError', () => {
		const storage = new InMemoryStorage();
		const store = new LyreStore(storage);
		vi.spyOn(storage, 'setItem').mockImplementation(() => {
			throw new Error('disk on fire');
		});

		expect(() => store.mutate((doc) => doc.songs.push())).toThrow('disk on fire');
	});
});

describe('LyreStore corrupt JSON quarantine', () => {
	it('quarantines unparseable JSON instead of wiping it, and starts empty', () => {
		const storage = new InMemoryStorage();
		storage.setItem(LIBRARY_STORAGE_KEY, '{not valid json');
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const store = new LyreStore(storage);
		expect(store.read((doc) => doc.songs)).toEqual([]);

		expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBeNull();
		expect(storage.getItem(`${LIBRARY_STORAGE_KEY}.corrupt-1`)).toBe('{not valid json');
		expect(consoleSpy).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});

	it('never overwrites an earlier quarantine on repeated corruption', () => {
		const storage = new InMemoryStorage();
		storage.setItem(`${LIBRARY_STORAGE_KEY}.corrupt-1`, 'first corrupt value');
		storage.setItem(LIBRARY_STORAGE_KEY, 'second corrupt value');
		vi.spyOn(console, 'error').mockImplementation(() => {});

		new LyreStore(storage).read((doc) => doc);

		expect(storage.getItem(`${LIBRARY_STORAGE_KEY}.corrupt-1`)).toBe('first corrupt value');
		expect(storage.getItem(`${LIBRARY_STORAGE_KEY}.corrupt-2`)).toBe('second corrupt value');

		vi.restoreAllMocks();
	});
});

// No jsdom/happy-dom in this project's vitest config (node environment
// only, see vite.config.ts) — same approach as theme.test.ts: stub a
// minimal `window` with a real `EventTarget` so `addEventListener`/
// `dispatchEvent` behave exactly like the browser contract `store.ts`'s
// cross-tab sync relies on, without pulling in a DOM test environment.
function fakeStorageEvent(key: string | null): Event {
	const event = new Event('storage') as StorageEvent;
	Object.defineProperty(event, 'key', { value: key });
	return event;
}

describe('LyreStore cross-tab sync', () => {
	let fakeWindow: EventTarget;

	beforeEach(() => {
		fakeWindow = new EventTarget();
		vi.stubGlobal('window', fakeWindow);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('re-reads and notifies subscribers on a storage event for its key', () => {
		const storage = new InMemoryStorage();
		const store = new LyreStore(storage);
		store.read((doc) => doc); // Force the initial (empty) load into the cache.

		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);

		// Simulate another tab writing the same key: the event fires on
		// `window` (the platform contract), not through this store's own
		// `mutate` — so write storage directly, bypassing this instance.
		storage.setItem(
			LIBRARY_STORAGE_KEY,
			JSON.stringify({
				schemaVersion: 2,
				songs: [
					{
						id: 'from-other-tab',
						title: 'Written elsewhere',
						aliases: [],
						authors: [],
						defaultKey: 'C',
						topics: [],
						createdAt: 'a',
						updatedAt: 'a'
					}
				],
				charts: [],
				patterns: [],
				collections: [],
				collectionItems: []
			})
		);
		fakeWindow.dispatchEvent(fakeStorageEvent(LIBRARY_STORAGE_KEY));

		expect(listener).toHaveBeenCalledTimes(1);
		expect(store.read((doc) => doc.songs)).toHaveLength(1);
		expect(store.read((doc) => doc.songs[0].id)).toBe('from-other-tab');

		unsubscribe();
	});

	it('ignores storage events for unrelated keys', () => {
		const storage = new InMemoryStorage();
		const store = new LyreStore(storage);
		store.read((doc) => doc);

		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);

		fakeWindow.dispatchEvent(fakeStorageEvent('some-other-app-key'));

		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});

	it('unsubscribe stops further notifications', () => {
		const storage = new InMemoryStorage();
		const store = new LyreStore(storage);
		store.read((doc) => doc);

		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);
		unsubscribe();

		fakeWindow.dispatchEvent(fakeStorageEvent(LIBRARY_STORAGE_KEY));
		expect(listener).not.toHaveBeenCalled();
	});
});
