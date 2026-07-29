/**
 * Persists the Library screen's Songs/Collections segmented-control choice
 * across visits (task E3, docs/PLAN-v0.3.md §E3: "Selection persists like
 * the sort preference does"). Same localStorage idiom as
 * `src/lib/library/sortPreference.ts` — kept as a sibling module rather than
 * folded into that file since the two preferences are independent and each
 * has its own storage key.
 */

export type LibraryViewMode = 'songs' | 'collections';

const STORAGE_KEY = 'lyre:libraryView';
const VALID_MODES: readonly LibraryViewMode[] = ['songs', 'collections'];

function isLibraryViewMode(value: unknown): value is LibraryViewMode {
	return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

/** Read the persisted view mode, falling back to `fallback` if unset/invalid/unavailable. */
export function loadLibraryViewMode(fallback: LibraryViewMode = 'songs'): LibraryViewMode {
	if (typeof localStorage === 'undefined') return fallback;
	const stored = localStorage.getItem(STORAGE_KEY);
	return isLibraryViewMode(stored) ? stored : fallback;
}

/** Persist the view mode. A no-op (never throws) if storage is unavailable. */
export function saveLibraryViewMode(mode: LibraryViewMode): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// Storage unavailable (private browsing, quota) — the in-memory choice
		// still applies for this session.
	}
}
