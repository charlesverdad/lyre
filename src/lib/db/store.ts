/**
 * localStorage-backed store of record (task E1, docs/PLAN-v0.3.md §E1).
 *
 * Replaces IndexedDB/Dexie: the whole library lives under one localStorage
 * key (`lyre:library:v1`) as a single JSON document. This buys a
 * synchronous, atomically-written store with no schema migrations or
 * transaction plumbing — the cost is a hard ~5MB origin quota, so every
 * mutation must detect `QuotaExceededError` and roll back rather than lose a
 * save (see `StorageQuotaError` below).
 */

import type {
	SongRecord,
	ChartRecord,
	PatternRecord,
	CollectionRecord,
	CollectionItemRecord
} from '$lib/theory/types';

export const LIBRARY_STORAGE_KEY = 'lyre:library:v1';

/**
 * The whole library as one document. `collections`/`collectionItems` are
 * defined here (task E1) but always empty until task E2 adds CRUD for them
 * — carrying the arrays through now keeps E2 purely additive (no doc-shape
 * migration needed).
 */
export interface LibraryDoc {
	schemaVersion: 2;
	songs: SongRecord[];
	charts: ChartRecord[];
	patterns: PatternRecord[];
	collections: CollectionRecord[];
	collectionItems: CollectionItemRecord[];
	/**
	 * ISO timestamp of the most recent failed IndexedDB→localStorage
	 * migration attempt (task E1 review fix), or absent if none is pending.
	 * Lives inside the doc (not a separate storage key) so it stays atomic
	 * with every other write; deliberately NOT part of the export/import
	 * manifest (`exportImport.ts` only copies the fields it lists) since it's
	 * a local recovery concern, not library content. `migrateFromIndexedDb.ts`
	 * sets it on failure so the root layout can show a retry banner instead
	 * of only logging, and clears it on a successful migration.
	 */
	migrationFailedAt?: string;
}

function emptyDoc(): LibraryDoc {
	return {
		schemaVersion: 2,
		songs: [],
		charts: [],
		patterns: [],
		collections: [],
		collectionItems: []
	};
}

/**
 * Defensively fills in fields a parsed doc might be missing (e.g. a future
 * corrupt/partial write, or — once E2 ships — an E1-era doc that predates
 * the collections arrays) rather than trusting `JSON.parse`'s output shape.
 */
function normalizeDoc(raw: unknown): LibraryDoc {
	const doc = (raw && typeof raw === 'object' ? raw : {}) as Partial<LibraryDoc>;
	return {
		schemaVersion: 2,
		songs: Array.isArray(doc.songs) ? doc.songs : [],
		charts: Array.isArray(doc.charts) ? doc.charts : [],
		patterns: Array.isArray(doc.patterns) ? doc.patterns : [],
		collections: Array.isArray(doc.collections) ? doc.collections : [],
		collectionItems: Array.isArray(doc.collectionItems) ? doc.collectionItems : [],
		migrationFailedAt: typeof doc.migrationFailedAt === 'string' ? doc.migrationFailedAt : undefined
	};
}

/** Thrown by `LyreStore.mutate` when a write hits the origin's storage quota. */
export class StorageQuotaError extends Error {
	constructor(message = 'Storage is full — export your library and remove some songs.') {
		super(message);
		this.name = 'StorageQuotaError';
	}
}

function isQuotaExceededError(err: unknown): boolean {
	// Firefox uses NS_ERROR_DOM_QUOTA_REACHED (name) / code 1014; most others
	// (Chrome, Safari, Node's experimental Storage polyfill) use the standard
	// QuotaExceededError name / legacy code 22. Check both rather than
	// trusting `instanceof DOMException`, which Node's polyfill may not use.
	if (!err || typeof err !== 'object') return false;
	const name = 'name' in err ? String((err as { name: unknown }).name) : '';
	const code = 'code' in err ? (err as { code: unknown }).code : undefined;
	return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22;
}

/**
 * Minimal in-memory `Storage` implementation, used when `localStorage` isn't
 * available (SSR/prerender, or privacy modes that block Storage entirely) so
 * the app can still render instead of throwing at import time.
 */
export class InMemoryStorage implements Storage {
	#data = new Map<string, string>();

	get length(): number {
		return this.#data.size;
	}
	key(index: number): string | null {
		return [...this.#data.keys()][index] ?? null;
	}
	getItem(key: string): string | null {
		return this.#data.has(key) ? this.#data.get(key)! : null;
	}
	setItem(key: string, value: string): void {
		this.#data.set(key, value);
	}
	removeItem(key: string): void {
		this.#data.delete(key);
	}
	clear(): void {
		this.#data.clear();
	}
}

/**
 * A real write/delete round-trip, not just "does `setItem` exist" — some
 * browsers expose a `localStorage` object that only throws once you actually
 * write to it (e.g. Safari private browsing historically; some
 * enterprise-policy lockdowns).
 */
function probesAsWritable(storage: Storage): boolean {
	const probeKey = `${LIBRARY_STORAGE_KEY}.__probe__`;
	try {
		storage.setItem(probeKey, '1');
		storage.removeItem(probeKey);
		return true;
	} catch {
		return false;
	}
}

/**
 * Exported for direct test coverage of the privacy-mode/SecurityError
 * fallback (review fix, task E1) — real usage is only the constructor's
 * default parameter below.
 */
export function defaultStorage(): Storage {
	// `localStorage` is a *declared* global, not a conditionally-defined one —
	// merely referencing it (even via `typeof localStorage`) runs its getter,
	// which throws a `SecurityError` (not just returns `undefined`) when
	// storage is blocked: Chrome "block all cookies", a third-party-blocked
	// iframe, Firefox `dom.storage.enabled=false`, some enterprise lockdowns.
	// SvelteKit's SSR/prerender pass (no `window` at all) is a different case
	// covered by the same try/catch. Either way, this must never throw — it
	// runs at module evaluation via `export const defaultStore = new
	// LyreStore()`, and an uncaught throw there fails the whole bundle to
	// evaluate (blank screen, no error UI) rather than degrading gracefully.
	try {
		const storage = localStorage;
		if (probesAsWritable(storage)) return storage;
	} catch {
		// Fall through to the in-memory fallback below.
	}
	return new InMemoryStorage();
}

/**
 * Store of record for the whole library. Lazily loads and caches the doc in
 * memory; every mutation is applied to a private draft and only committed
 * (cache swap + persist + notify) if it completes without throwing — so a
 * mutator that throws, or a write that hits the quota, leaves both the
 * persisted value and the in-memory cache untouched.
 */
export class LyreStore {
	#storage: Storage;
	#key: string;
	#cache: LibraryDoc | undefined;
	#listeners = new Set<() => void>();
	#storageListenerAttached = false;

	constructor(storage: Storage = defaultStorage(), key: string = LIBRARY_STORAGE_KEY) {
		this.#storage = storage;
		this.#key = key;
		// Attached unconditionally here, not lazily in `subscribe()` (review
		// fix, task E1): cache correctness must not depend on whether anyone
		// is observing this store. A tab that never calls `subscribe()` (e.g.
		// one sitting on the edit screen, or the settings screen mid export —
		// note this is *not* the song play screen since task E3: its "Add to
		// collection" sheet mounts a live query unconditionally on load, so it
		// does subscribe) still needs its `#cache` invalidated by another
		// tab's write — otherwise its next `mutate()` clones the *stale*
		// cache and overwrites the whole single-key document, silently
		// reverting whatever the other tab wrote.
		this.#attachStorageListener();
	}

	/**
	 * True if the raw key has ever been written — a corrupt/degenerate value
	 * (unparseable JSON, or valid JSON that normalizes to an empty doc, e.g.
	 * `"null"`) still counts. Not what migration gating should use (see
	 * `hasSeededLibrary`) — kept as a cheap, allocation-free existence check
	 * for callers that only care "did `mutate` ever run".
	 */
	hasPersistedDoc(): boolean {
		return this.#storage.getItem(this.#key) !== null;
	}

	/**
	 * True if the *parsed* doc has any real content — any song, chart,
	 * pattern, collection, or collection item. Forces a load (so corrupt JSON
	 * gets quarantined first) rather than trusting raw key presence, which is
	 * the point: a corrupt or degenerate persisted value (`hasPersistedDoc()`
	 * true, but nothing usable in it) must not permanently lock out the
	 * IndexedDB migration (review fix, task E1 — see `migrateFromIndexedDb.ts`).
	 */
	hasSeededLibrary(): boolean {
		const doc = this.#ensureLoaded();
		return (
			doc.songs.length > 0 ||
			doc.charts.length > 0 ||
			doc.patterns.length > 0 ||
			doc.collections.length > 0 ||
			doc.collectionItems.length > 0
		);
	}

	#ensureLoaded(): LibraryDoc {
		if (this.#cache) return this.#cache;

		const raw = this.#storage.getItem(this.#key);
		if (raw === null) {
			this.#cache = emptyDoc();
			return this.#cache;
		}

		try {
			this.#cache = normalizeDoc(JSON.parse(raw));
		} catch (err) {
			// Never wipe a corrupt value silently — quarantine it under a
			// `.corrupt-<n>` sibling key (never overwriting an earlier
			// quarantine) so it stays inspectable/recoverable, then start empty.
			console.error(
				`LyreStore: ${this.#key} contains unparseable JSON, quarantining and starting empty`,
				err
			);
			this.#quarantine(raw);
			this.#cache = emptyDoc();
		}
		return this.#cache;
	}

	#quarantine(raw: string): void {
		let n = 1;
		while (this.#storage.getItem(`${this.#key}.corrupt-${n}`) !== null) n++;
		try {
			this.#storage.setItem(`${this.#key}.corrupt-${n}`, raw);
			this.#storage.removeItem(this.#key);
		} catch (err) {
			// Best-effort: if even the quarantine write fails (e.g. quota already
			// full), leave the original corrupt value in place rather than lose
			// it, and still boot with an empty in-memory doc.
			console.error(`LyreStore: failed to quarantine corrupt value at ${this.#key}`, err);
		}
	}

	/**
	 * Read from the current doc. `fn` receives a deep clone, so mutating the
	 * returned records (or arrays) can never corrupt the store's cache
	 * outside of `mutate` — matching Dexie's old behavior of always handing
	 * back freshly deserialized objects.
	 */
	read<T>(fn: (doc: LibraryDoc) => T): T {
		return fn(structuredClone(this.#ensureLoaded()));
	}

	/**
	 * Apply `fn` to a draft cloned from the current doc, then persist +
	 * commit only if `fn` returns normally and the write succeeds. A
	 * `QuotaExceededError` on write rolls the draft back (the cache is never
	 * touched until the persisted write succeeds) and throws
	 * `StorageQuotaError` instead — callers that save user content must
	 * surface that as a readable message.
	 */
	mutate<T>(fn: (doc: LibraryDoc) => T): T {
		const draft = structuredClone(this.#ensureLoaded());
		const result = fn(draft); // throws here → cache/storage untouched.

		try {
			this.#storage.setItem(this.#key, JSON.stringify(draft));
		} catch (err) {
			if (isQuotaExceededError(err)) {
				throw new StorageQuotaError();
			}
			throw err;
		}

		this.#cache = draft;
		this.#notify();
		return result;
	}

	/**
	 * Fired after every committed mutation (this tab) and after any
	 * `storage` event for this key (another tab writing the same origin's
	 * localStorage — cache invalidation for that is wired up unconditionally
	 * in the constructor, not here, so it works even with zero subscribers).
	 * Returns an unsubscribe function.
	 */
	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	#notify(): void {
		for (const listener of this.#listeners) listener();
	}

	#attachStorageListener(): void {
		if (this.#storageListenerAttached) return;
		if (typeof window === 'undefined') return; // SSR/prerender: no cross-tab sync possible.
		this.#storageListenerAttached = true;
		window.addEventListener('storage', (event: StorageEvent) => {
			// `event.key === null` means the whole storage area was cleared
			// (e.g. devtools "Clear site data"); anything else that isn't our
			// key is a different app-level entry and doesn't concern us.
			if (event.key !== null && event.key !== this.#key) return;
			// Drop the cache and re-read on next access rather than
			// eagerly re-parsing here, so a corrupt cross-tab write goes
			// through the same quarantine path as a normal boot.
			this.#cache = undefined;
			this.#notify();
		});
	}
}

/** Shared singleton instance used by the repository layer. */
export const defaultStore = new LyreStore();

/** Create a fresh, independent store over in-memory storage (tests only). */
export function createTestStore(): LyreStore {
	return new LyreStore(new InMemoryStorage());
}

/**
 * Best-effort request that the browser not evict this origin's storage under
 * pressure (docs/PLAN-v0.3.md §E1). Never blocks boot: missing API, a
 * rejected promise, or a browser that doesn't support it are all silently
 * ignored — this is a nice-to-have, not a correctness requirement (export is
 * still the real backup story, mvp-spec.md F5).
 */
export function requestPersistentStorage(): void {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
	navigator.storage.persist().catch(() => {
		// Ignored — best effort.
	});
}
