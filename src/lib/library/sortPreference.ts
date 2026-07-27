/**
 * Persists the Library screen's chosen sort order (F1: "Sort: recently
 * played, recently added, alphabetical") across visits, mirroring the
 * localStorage idiom in `src/lib/ui/theme.svelte.ts`.
 */

import type { SongSort } from '$lib/db/repo';

const STORAGE_KEY = 'lyre:librarySort';
const VALID_SORTS: readonly SongSort[] = ['recentlyPlayed', 'recentlyAdded', 'alpha'];

function isSongSort(value: unknown): value is SongSort {
	return typeof value === 'string' && (VALID_SORTS as readonly string[]).includes(value);
}

/** Read the persisted sort choice, falling back to `fallback` if unset/invalid/unavailable. */
export function loadSortPreference(fallback: SongSort = 'recentlyPlayed'): SongSort {
	if (typeof localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(STORAGE_KEY);
	return isSongSort(stored) ? stored : fallback;
}

/** Persist the sort choice. A no-op (never throws) if storage is unavailable. */
export function saveSortPreference(sort: SongSort): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, sort);
	} catch {
		// Storage unavailable (private browsing, quota) — the in-memory choice
		// still applies for this session.
	}
}
