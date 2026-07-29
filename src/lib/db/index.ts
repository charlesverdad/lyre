/**
 * Public entry point for Lyre's local-first data layer (task A3; store of
 * record rewritten task E1 onto localStorage, docs/PLAN-v0.3.md §E1).
 */

export {
	LyreStore,
	InMemoryStorage,
	StorageQuotaError,
	defaultStore,
	createTestStore,
	requestPersistentStorage,
	LIBRARY_STORAGE_KEY
} from './store';
export type { LibraryDoc } from './store';
export { migrateFromIndexedDbOnce, getMigrationFailure } from './migrateFromIndexedDb';
export type {
	SongSort,
	SongWithDetails,
	CreateSongInput,
	CreateSongResult,
	SavePatternInput,
	SongListEntry,
	UpdateSongAndChartInput
} from './repo';
export {
	createSong,
	updateSong,
	updateChart,
	updateSongAndChart,
	deleteSong,
	listSongs,
	listSongsWithDefaultPattern,
	searchSongs,
	getSongWithDetails,
	setPreferredPattern,
	savePattern,
	touchLastPlayed
} from './repo';
export { SCHEMA_VERSION, exportLibrary, importLibrary } from './exportImport';
export type { ImportResult } from './exportImport';
