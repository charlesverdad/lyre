/** Public entry point for Lyre's local-first data layer (task A3). */

export { LyreDatabase, db, createTestDatabase } from './schema';
export type {
	SongSort,
	SongWithDetails,
	CreateSongInput,
	CreateSongResult,
	SavePatternInput
} from './repo';
export {
	createSong,
	updateSong,
	updateChart,
	deleteSong,
	listSongs,
	searchSongs,
	getSongWithDetails,
	setPreferredPattern,
	savePattern,
	touchLastPlayed
} from './repo';
export { SCHEMA_VERSION, exportLibrary, importLibrary } from './exportImport';
export type { ImportResult } from './exportImport';
