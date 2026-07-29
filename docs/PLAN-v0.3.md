# PLAN v0.3.0 — Collections + localStorage persistence

Two owner-requested changes:

1. **Collections** — group songs into named sets (the first half of the
   worship-leader story in [roadmap.md](roadmap.md) Phase 1/2: build a set,
   reorder it, open songs from it).
2. **All song data in `localStorage`** — replace IndexedDB/Dexie as the store
   of record with a single-key `localStorage` document, migrating any existing
   IndexedDB library on first boot.

## Why localStorage is a safe swap here

A personal songbook is small text: a chart is ~2–6 KB of ChordPro, so the
~5 MB per-origin `localStorage` budget holds hundreds of songs. In exchange we
get a synchronous, single-key, atomically-written store that is trivial to
inspect, export, and reason about — no schema migrations, no transaction
plumbing, no async-index semantics. The cost is a hard ceiling, so the store
**must** detect `QuotaExceededError` and surface it rather than silently
losing a save (see E1 §Quota).

This is not a durability upgrade on its own: both IndexedDB and
`localStorage` are evictable (Safari ITP clears both after ~7 days of no
visits for non-installed sites). Export/import (F5) remains the backup story,
and E1 additionally requests `navigator.storage.persist()`.

## Tasks

Sub-PRs target the `v0.3.0` version branch, branch name `v0.3.0-task-<ID>`,
title `<ID>: <summary>` (AGENTS.md Workflow). Sequential — each starts from
the previous one merged.

| ID | Scope | Depends on |
|---|---|---|
| E1 | localStorage store + IndexedDB migration; repo/liveQuery rewritten on it | — |
| E2 | Collections domain: types, repo CRUD, cascades, export/import | E1 |
| E3 | Collections UI: library segmented control, collection screen, add-to-collection | E2 |
| E4 | E2E coverage + docs sync | E3 |

## E1 — localStorage as the store of record

**New**: `src/lib/db/store.ts`. One `localStorage` key, `lyre:library:v1`,
holding the whole library as a JSON document:

```ts
export interface LibraryDoc {
	schemaVersion: 2;
	songs: SongRecord[];
	charts: ChartRecord[];
	patterns: PatternRecord[];
	collections: CollectionRecord[];      // E1 ships these as always-[]
	collectionItems: CollectionItemRecord[]; // E2 fills them in
}
```

E1 defines the collection record types (below) and carries the two empty
arrays through load/save/migration so E2 is purely additive.

`LyreStore` responsibilities:

- Lazy-load and cache the doc in memory; every mutation applies in memory and
  then serializes the whole doc back under the single key (atomic — no
  partially-written library).
- `read<T>(fn: (doc: LibraryDoc) => T): T` and
  `mutate<T>(fn: (doc: LibraryDoc) => T): T` — `mutate` persists after `fn`
  returns and notifies subscribers; if `fn` throws, nothing is written.
- `subscribe(listener: () => void): () => void` — fired after every committed
  mutation, and on the `window` `storage` event (cross-tab sync: re-read the
  key and notify).
- Injectable backing store: `new LyreStore(storage: Storage = localStorage,
  key = 'lyre:library:v1')`, mirroring today's `database: LyreDatabase =
  defaultDb` parameter convention, so tests pass an in-memory `Storage` fake.
  Guard `typeof localStorage === 'undefined'` (SSR/prerender, privacy modes)
  by falling back to an in-memory store — the app must still render.
- Corrupt/unparseable JSON: do **not** wipe it. Rename the bad value to
  `lyre:library:v1.corrupt-<n>`, start from an empty doc, log loudly.

**Quota**: catch `QuotaExceededError` on write, roll the in-memory doc back to
its pre-mutation snapshot, and throw a typed `StorageQuotaError`. Callers that
save user content (add/edit song, import) must surface it as a readable
message ("Storage is full — export your library and remove some songs"),
never a silent failure or an unhandled rejection.

**Migration** (`src/lib/db/migrateFromIndexedDb.ts`): on first store load, if
the `localStorage` key is absent and an IndexedDB database named `lyre`
exists, read `songs`/`charts`/`patterns` out of it with the raw IndexedDB API
and seed the document. Rules:

- **Never delete the IndexedDB database.** It stays as a safety net.
- Migration failure must not brick the app: log, start empty, and leave the
  key unset so a later boot retries.
- Runs once, awaited before any screen renders library data — add the await to
  the root layout's load/init path so no screen can observe a pre-migration
  empty library.
- Unit-test it with `fake-indexeddb` (already a devDependency), seeding a
  Dexie-shaped database.

**Repo rewrite**: `src/lib/db/repo.ts` keeps its exported function names,
signatures, and `async` shape — the optional trailing `database:
LyreDatabase` parameter becomes an optional trailing `store: LyreStore`.
Every existing invariant stays: exactly-one-preferred-pattern per chart,
delete-song cascade, `savePattern` upsert-by-id, sort orders. `Promise`
returns are preserved even though the store is synchronous, so no call site or
test changes shape.

`src/lib/db/liveQuery.svelte.ts` loses its Dexie `liveQuery` dependency and
re-runs its querier on `store.subscribe`. Its public shape
(`createLiveQuery(querier, initialValue) -> { value, destroy() }`) is
unchanged — the library screen's `untrack` pattern must keep working.

`exportImport.ts` moves onto the store (zip format unchanged in E1).

**Remove Dexie** from `package.json` once nothing imports it (the migration
reader uses raw IndexedDB). `src/lib/db/schema.ts` goes away; keep
`createTestDatabase`'s role by exporting `createTestStore(): LyreStore`.

## E2 — Collections domain

```ts
/** A named, ordered set of songs (a service set, a rehearsal list). */
export interface CollectionRecord {
	id: string;
	name: string;
	description?: string;
	createdAt: string;
	updatedAt: string;
}

/** Membership of one song in one collection. */
export interface CollectionItemRecord {
	id: string;
	collectionId: string;
	songId: string;
	/** Order within the collection; contiguous 0..n-1, resequenced on write. */
	position: number;
	/** Optional per-set note, e.g. "straight into the chorus". */
	note?: string;
}
```

Invariants owned by the repo layer:

- A song appears **at most once** per collection (add is idempotent).
- Positions are contiguous and stable: append puts the song last; removal
  resequences.
- Deleting a collection deletes its items, **never** its songs.
- Deleting a song deletes its collection items (extend `deleteSong`'s
  cascade).

API (`src/lib/db/collections.ts`, re-exported from `src/lib/db/index.ts`):

```ts
createCollection(input: { name: string; description?: string }, store?): Promise<CollectionRecord>
updateCollection(id: string, patch: { name?: string; description?: string }, store?): Promise<void>
deleteCollection(id: string, store?): Promise<void>
listCollections(store?): Promise<CollectionSummary[]>          // alpha by name; { collection, songCount }
getCollectionWithSongs(id: string, store?): Promise<CollectionDetail | undefined>
	// { collection, items: { item, song, defaultChart?, preferredPattern? }[] } ordered by position
addSongToCollection(collectionId: string, songId: string, store?): Promise<void>   // idempotent, appends
removeSongFromCollection(collectionId: string, songId: string, store?): Promise<void>
reorderCollection(collectionId: string, orderedSongIds: string[], store?): Promise<void>
listCollectionsForSong(songId: string, store?): Promise<CollectionRecord[]>
```

`getCollectionWithSongs` resolves each song's default chart + preferred
pattern with the same batched approach as `listSongsWithDefaultPattern` (no
per-song queries), and reuses that helper's default-chart selection rule.

**Export/import**: `SCHEMA_VERSION` → 2; manifest gains `collections` and
`collectionItems`. Import must still accept **v1 archives** (missing arrays
read as empty) — the owner has v1 backups. Merge strategy matches songs:
collection id already present → skip that collection and its items; items
referencing a song that isn't in the target library after import are dropped.

## E3 — Collections UI

Monochrome only, `docs/design.md` tokens; no fourth tab.

- **Library screen**: a two-option segmented control above the search bar —
  `Songs` | `Collections`. Selection persists like the sort preference does.
  In Collections mode the search bar filters collection names
  ("Search collections") and the sort row is hidden.
- **Collections list**: rows of name + `N songs` (`No songs yet` at zero), tap
  opens the collection, overflow sheet offers Rename / Delete (delete confirms
  and states that songs are kept). A `New` action in the top bar and in the
  empty state opens a create sheet (name + optional description).
- **`/collection/[collectionId]`**: top bar with the collection name and a
  back affordance; ordered song rows showing title + pattern summary (reuse
  `formatSongSubtitle`/`formatPatternSummary`); tap opens the song in play
  mode. Per-row overflow: Move up / Move down / Remove from collection —
  buttons, not drag-and-drop (accessible, works on a music stand, no gesture
  conflicts with scrolling). An `Add songs` action opens a sheet with a
  searchable library list and checkmarks for songs already in the set.
  Empty state: "No songs in this set yet."
- **Song screen**: an `Add to collection` action opening a sheet that lists
  every collection with a checkmark for the ones containing this song
  (tapping toggles membership) plus an inline `New collection` field.
- All screens read through `createLiveQuery`, so membership edits reflect
  immediately everywhere.

## E4 — E2E + docs

Playwright specs (public-domain fixtures only): create a collection, add two
songs, reorder, open a song from it, remove one, delete the collection and
confirm the songs survive in the library. Plus a persistence spec: add a song,
reload, and confirm it is still there and that `localStorage` holds the
library key.

Docs synced in the same PR: `mvp-spec.md` (F1 collections, F5 schema v2),
`domain-model.md` §5 (the two new records + invariants), `roadmap.md` (Phase 1
collections → done), and `docs/product-vision.md` if it claims IndexedDB.

## Definition of done

`just verify` and `just e2e` green on every sub-PR; final PR from `v0.3.0` to
`main` listing the merged sub-PRs; the deployed site migrates an existing
IndexedDB library without the owner losing a single song.
