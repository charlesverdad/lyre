/**
 * One-shot migration off the pre-v0.3.0 Dexie-shaped `lyre` IndexedDB
 * database onto the new localStorage store (task E1, docs/PLAN-v0.3.md §E1).
 *
 * Runs once at boot, awaited before any screen renders library data (see the
 * root `+layout.ts` load). Deliberately raw-IndexedDB, not Dexie (removed
 * this task) — this is the one place still allowed to know that shape.
 *
 * Rules this file exists to uphold:
 *   - Never delete the IndexedDB database — it stays as a safety net.
 *   - A failure here must never brick the app, and must never be
 *     unrecoverable (review fix): log loudly, record `doc.migrationFailedAt`
 *     so the root layout can show a retry banner instead of only a console
 *     line, and retry automatically on every later boot for as long as the
 *     store's doc stays empty (`hasSeededLibrary()`, not raw key presence —
 *     a corrupt/degenerate persisted value must not lock migration out
 *     forever either).
 */

import type { SongRecord, ChartRecord, PatternRecord } from '$lib/theory/types';
import type { LyreStore } from './store';
import { defaultStore } from './store';

const LEGACY_DB_NAME = 'lyre';
const LEGACY_STORES = ['songs', 'charts', 'patterns'] as const;

interface LegacyLibrary {
	songs: SongRecord[];
	charts: ChartRecord[];
	patterns: PatternRecord[];
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly');
		const request = tx.objectStore(storeName).getAll();
		request.onsuccess = () => resolve(request.result as T[]);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Best-effort "does the database already exist" check via `indexedDB.databases()`
 * where supported, so a fresh install doesn't leave behind an empty stub
 * database just from probing. Where unsupported, returns `true` (permissive)
 * — `openLegacyDatabase` below still verifies real object stores exist
 * before treating the result as "found an existing library".
 */
async function legacyDatabaseMayExist(): Promise<boolean> {
	const databases = indexedDB.databases;
	if (typeof databases !== 'function') return true;
	try {
		const list = await databases.call(indexedDB);
		return list.some((entry) => entry.name === LEGACY_DB_NAME);
	} catch {
		return true;
	}
}

/**
 * Opens the legacy database without specifying a version (connects at
 * whatever version Dexie left it at). Opening a name that doesn't exist yet
 * creates an empty v1 stub as an unavoidable side effect of the platform API
 * — `onupgradeneeded` firing is exactly how we detect that case, so we can
 * report "nothing to migrate" instead of misreading the stub as real data.
 */
function openLegacyDatabase(): Promise<IDBDatabase | undefined> {
	return new Promise((resolve) => {
		let settled = false;
		let wasCreatedNow = false;

		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(LEGACY_DB_NAME);
		} catch {
			resolve(undefined);
			return;
		}

		request.onupgradeneeded = () => {
			wasCreatedNow = true;
		};
		request.onsuccess = () => {
			if (settled) return;
			settled = true;
			const db = request.result;
			const hasLegacyStores = LEGACY_STORES.every((name) => db.objectStoreNames.contains(name));
			if (wasCreatedNow || !hasLegacyStores) {
				db.close();
				resolve(undefined);
				return;
			}
			resolve(db);
		};
		request.onerror = () => {
			if (settled) return;
			settled = true;
			resolve(undefined);
		};
		request.onblocked = () => {
			if (settled) return;
			settled = true;
			resolve(undefined);
		};
	});
}

async function readLegacyLibrary(): Promise<LegacyLibrary | undefined> {
	if (typeof indexedDB === 'undefined') return undefined;
	if (!(await legacyDatabaseMayExist())) return undefined;

	const db = await openLegacyDatabase();
	if (!db) return undefined;

	try {
		const [songs, charts, patterns] = await Promise.all([
			getAllFromStore<SongRecord>(db, 'songs'),
			getAllFromStore<ChartRecord>(db, 'charts'),
			getAllFromStore<PatternRecord>(db, 'patterns')
		]);
		return { songs, charts, patterns };
	} finally {
		db.close();
	}
}

/**
 * Migrates the legacy IndexedDB library into `store` if (and only if) the
 * store has no real content yet (`hasSeededLibrary()` — the *parsed* doc,
 * not raw key presence, so a corrupt/degenerate persisted value doesn't
 * permanently block this). Safe to call on every boot: a no-op once the
 * store has any songs/charts/patterns/collections/items, whether from a
 * prior successful migration or from the user just using the app.
 *
 * Also the retry entry point for the root layout's failure banner — calling
 * it again after a failure is exactly "retry".
 */
export async function migrateFromIndexedDbOnce(store: LyreStore = defaultStore): Promise<void> {
	if (store.hasSeededLibrary()) return;

	try {
		const legacy = await readLegacyLibrary();
		if (!legacy) {
			// No IndexedDB database (or nothing usable in it) — nothing to
			// migrate, not a failure. Clear any earlier failure marker so a
			// stale retry banner doesn't linger once there's truly nothing left
			// to retry.
			clearMigrationFailure(store);
			return;
		}

		store.mutate((doc) => {
			doc.songs = legacy.songs;
			doc.charts = legacy.charts;
			doc.patterns = legacy.patterns;
			doc.migrationFailedAt = undefined;
		});
	} catch (err) {
		// Never brick the app on a migration failure: log loudly, leave the
		// store's library content untouched (empty), and record a marker so
		// this both retries automatically on the next boot (`hasSeededLibrary`
		// is still false) and drives a dismissible retry banner in the UI —
		// unlike a bare `console.error`, the user has an in-app way back.
		console.error('migrateFromIndexedDbOnce: migration failed, will retry', err);
		recordMigrationFailure(store);
	}
}

function recordMigrationFailure(store: LyreStore): void {
	try {
		store.mutate((doc) => {
			doc.migrationFailedAt = new Date().toISOString();
		});
	} catch (err) {
		// If even recording the failure fails (e.g. quota), the automatic
		// retry-on-next-boot path (gated on `hasSeededLibrary`, not this flag)
		// still applies — only the UI banner is lost for this session.
		console.error('migrateFromIndexedDbOnce: failed to record migration failure', err);
	}
}

/**
 * ISO timestamp of the most recent failed migration attempt, or `undefined`
 * if none is pending — what the root layout's retry banner watches.
 */
export function getMigrationFailure(store: LyreStore = defaultStore): string | undefined {
	return store.read((doc) => doc.migrationFailedAt);
}

function clearMigrationFailure(store: LyreStore): void {
	if (store.read((doc) => doc.migrationFailedAt) === undefined) return;
	try {
		store.mutate((doc) => {
			doc.migrationFailedAt = undefined;
		});
	} catch (err) {
		console.error('migrateFromIndexedDbOnce: failed to clear migration failure marker', err);
	}
}
