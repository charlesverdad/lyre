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
 *   - A failure here must never brick the app: log, start empty, and leave
 *     the localStorage key unset so the next boot retries.
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
 * store has no persisted doc yet. Safe to call on every boot — a no-op once
 * migrated (or once the store has any doc, migrated or freshly created).
 */
export async function migrateFromIndexedDbOnce(store: LyreStore = defaultStore): Promise<void> {
	if (store.hasPersistedDoc()) return;

	try {
		const legacy = await readLegacyLibrary();
		if (!legacy) return; // No IndexedDB database (or nothing usable in it) — leave key unset, boot empty.

		store.mutate((doc) => {
			doc.songs = legacy.songs;
			doc.charts = legacy.charts;
			doc.patterns = legacy.patterns;
		});
	} catch (err) {
		// Never brick the app on a migration failure: log loudly, start empty,
		// and leave the key unset so a later boot retries from scratch.
		console.error('migrateFromIndexedDbOnce: migration failed, starting empty library', err);
	}
}
