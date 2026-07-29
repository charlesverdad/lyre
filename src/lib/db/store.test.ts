import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	InMemoryStorage,
	LyreStore,
	StorageQuotaError,
	LIBRARY_STORAGE_KEY,
	defaultStorage
} from './store';

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

	// Review fix (task E1, critical #2): cache invalidation used to be wired
	// up lazily inside `subscribe()`, so a store nobody ever subscribed to
	// (e.g. a tab sitting on a song's play screen — none of those screens use
	// `createLiveQuery`) never installed the `storage` listener at all. Its
	// `#cache` stayed stale forever, so its next `mutate()` cloned the *stale*
	// doc and overwrote the single shared key, silently reverting whatever
	// another tab had written in the meantime.
	it('invalidates its cache on a cross-tab write even when subscribe() was never called', () => {
		const storage = new InMemoryStorage();
		// Two `LyreStore` instances over the same backing storage, standing in
		// for two tabs of the same origin.
		const tabA = new LyreStore(storage);
		const tabB = new LyreStore(storage);

		// Tab A loads and caches the (empty) doc, but — this is the point —
		// never calls `subscribe()`.
		tabA.read((doc) => doc);

		// Tab B adds three songs.
		tabB.mutate((doc) => {
			for (const title of ['Song 1', 'Song 2', 'Song 3']) {
				doc.songs.push({
					id: crypto.randomUUID(),
					title,
					aliases: [],
					authors: [],
					defaultKey: 'C',
					topics: [],
					createdAt: 'a',
					updatedAt: 'a'
				});
			}
		});

		// The platform fires `storage` on every other same-origin window
		// automatically; simulate that for tab A's window.
		fakeWindow.dispatchEvent(fakeStorageEvent(LIBRARY_STORAGE_KEY));

		// Tab A now saves a pattern (any unrelated write). If its cache were
		// still stale, this `mutate` would clone the pre-tabB-write doc and
		// wipe out tab B's three songs when it persists.
		tabA.mutate((doc) => {
			doc.patterns.push({
				id: 'p1',
				chartId: 'c1',
				label: 'x',
				soundingKey: 'C',
				shapeKey: 'C',
				capo: 0,
				isPreferred: true
			});
		});

		const finalSongs = tabB.read((doc) => doc.songs);
		expect(finalSongs).toHaveLength(3);
	});
});

describe('defaultStorage privacy-mode fallback', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Review fix (task E1, critical #1): `localStorage` is a *declared*
	// global whose getter throws `SecurityError` (not `undefined`) when
	// storage is blocked — merely referencing it runs the getter. The old
	// `typeof localStorage === 'undefined'` check still evaluates that
	// reference and so still throws, and since `defaultStorage()` runs at
	// module evaluation (`export const defaultStore = new LyreStore()`), an
	// uncaught throw here fails the whole bundle to evaluate.
	it('falls back to an in-memory store when the localStorage getter throws', () => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new DOMException('storage is disabled', 'SecurityError');
			}
		});

		let storage: Storage | undefined;
		expect(() => {
			storage = defaultStorage();
		}).not.toThrow();
		expect(storage).toBeInstanceOf(InMemoryStorage);

		Reflect.deleteProperty(globalThis, 'localStorage');
	});

	// The other half of the same bug class: a browser can expose a
	// `localStorage` object that *looks* usable (the getter doesn't throw)
	// but throws once you actually write to it — a `typeof`-only check would
	// wrongly trust it.
	it('falls back to an in-memory store when localStorage exists but setItem throws', () => {
		const throwingStorage: Storage = {
			length: 0,
			key: () => null,
			getItem: () => null,
			setItem: () => {
				throw new DOMException('write blocked', 'SecurityError');
			},
			removeItem: () => {},
			clear: () => {}
		};
		vi.stubGlobal('localStorage', throwingStorage);

		const storage = defaultStorage();
		expect(storage).toBeInstanceOf(InMemoryStorage);
	});

	it('uses the real localStorage when the write/delete round-trip succeeds', () => {
		const workingStorage: Storage = new InMemoryStorage();
		vi.stubGlobal('localStorage', workingStorage);

		const storage = defaultStorage();
		expect(storage).toBe(workingStorage);
		// The probe write must clean up after itself — no leftover probe key.
		expect(storage.getItem(`${LIBRARY_STORAGE_KEY}.__probe__`)).toBeNull();
	});
});
