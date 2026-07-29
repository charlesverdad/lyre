<script lang="ts">
	/**
	 * Collection screen (task E3, docs/PLAN-v0.3.md §E3): an ordered set of
	 * songs. Reordering is buttons (move up/down), not drag-and-drop — the
	 * plan calls this out explicitly (accessible, and no gesture conflict
	 * with scrolling on a music stand).
	 */
	import { untrack } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import ListMusic from '@lucide/svelte/icons/list-music';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ListItem from '$lib/ui/ListItem.svelte';
	import SearchBar from '$lib/ui/SearchBar.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TopBar from '$lib/ui/TopBar.svelte';
	import { createLiveQuery, type LiveQueryHandle } from '$lib/db/liveQuery.svelte';
	import {
		addSongToCollection,
		getCollectionWithSongs,
		removeSongFromCollection,
		reorderCollection,
		type CollectionDetail
	} from '$lib/db/collections';
	import { listSongsWithDefaultPattern } from '$lib/db/repo';
	import { StorageQuotaError } from '$lib/db/store';
	import { formatPatternSummary, formatSongSubtitle } from '$lib/library/format';

	let collectionId = $derived(page.params.collectionId ?? '');

	// Distinguishes "haven't loaded yet" from a genuine "collection not
	// found" (`getCollectionWithSongs` returning `undefined`) — both would
	// otherwise collapse to the same falsy value and flash the not-found
	// state before the first query resolves.
	const NOT_LOADED = Symbol('not-loaded');
	type DetailState = CollectionDetail | undefined | typeof NOT_LOADED;

	// Same `untrack` shape as the library screen's live query (see that
	// file's comment for why it's load-bearing): this effect writes
	// `detailHandle`, so seeding the next query from the previous value must
	// not also make `detailHandle` a dependency of this effect.
	//
	// `seededForId` (review fix) tracks which collection id the *previous*
	// handle's value belonged to, as a plain (non-reactive) variable — it's
	// only ever read/written from inside this same effect. Without it, a
	// same-instance navigation from one collection to another (`/collection/A`
	// → `/collection/B`, no unmount) would seed B's query with A's still-live
	// `detail`, briefly rendering B's URL with A's name/rows and `loaded ===
	// true` before B's query resolves.
	let detailHandle = $state<LiveQueryHandle<DetailState>>();
	let seededForId: string | undefined;
	$effect(() => {
		const id = collectionId;
		const seed = untrack(() => (seededForId === id ? detailHandle?.value : undefined));
		const handle = createLiveQuery<DetailState>(
			async () => (id ? await getCollectionWithSongs(id) : undefined),
			seed ?? NOT_LOADED
		);
		detailHandle = handle;
		seededForId = id;
		return () => handle.destroy();
	});

	// Review fix: `detailHandle` itself is `undefined` on the very first
	// render (this component's `$effect` above hasn't run yet), so checking
	// only `detailHandle?.value !== NOT_LOADED` was true from the start —
	// `undefined !== NOT_LOADED` — and the not-found branch flashed before
	// the live query even existed. Both must be checked.
	let loaded = $derived(detailHandle !== undefined && detailHandle.value !== NOT_LOADED);
	let detail = $derived(
		detailHandle?.value === NOT_LOADED
			? undefined
			: (detailHandle?.value as CollectionDetail | undefined)
	);

	function goToSong(songId: string) {
		goto(resolve('/(app)/song/[songId]', { songId }));
	}

	function backToLibrary() {
		goto(resolve('/library'));
	}

	// --- Reorder / remove -------------------------------------------------

	let reorderError = $state<string | undefined>();

	// Critical note (task E3 brief): build the new order from *fresh* state
	// (`detail`, read at call time — not a value captured when the row was
	// rendered) and pass the complete ordered id list exactly once each, per
	// `reorderCollection`'s duplicate-id hazard.
	async function moveItem(songId: string, direction: -1 | 1) {
		const items = detail?.items;
		if (!items) return;
		const ids = items.map((entry) => entry.song.id);
		const index = ids.indexOf(songId);
		if (index < 0) return;
		const target = index + direction;
		if (target < 0 || target >= ids.length) return;
		[ids[index], ids[target]] = [ids[target], ids[index]];
		reorderError = undefined;
		try {
			await reorderCollection(collectionId, ids);
		} catch (err) {
			reorderError =
				err instanceof StorageQuotaError ? err.message : 'Could not reorder — please try again.';
		}
	}

	async function removeItem(songId: string) {
		reorderError = undefined;
		try {
			await removeSongFromCollection(collectionId, songId);
		} catch (err) {
			reorderError =
				err instanceof StorageQuotaError ? err.message : 'Could not remove — please try again.';
		}
	}

	// Per-row overflow sheet: Move up / Move down / Remove from collection.
	// Review fix: only the song id is captured here — `rowOptionsIndex` below
	// re-derives the position from live `detail` on every render instead of
	// storing a snapshot, so the sheet's disabled states can't go stale if
	// another tab reorders the collection while this sheet is open (a
	// display-only bug: `moveItem` always re-derives its own index and
	// returns early on an out-of-range move, so this never corrupted data —
	// but the buttons could show the wrong enabled/disabled state).
	let rowOptionsTarget = $state<{ songId: string; title: string } | undefined>();
	let rowOptionsSheetOpen = $state(false);
	let rowOptionsIndex = $derived(
		rowOptionsTarget
			? (detail?.items.findIndex((entry) => entry.song.id === rowOptionsTarget!.songId) ?? -1)
			: -1
	);

	function openRowOptions(songId: string, title: string, event: Event) {
		event.stopPropagation();
		rowOptionsTarget = { songId, title };
		rowOptionsSheetOpen = true;
	}

	function closeRowOptions() {
		rowOptionsSheetOpen = false;
	}

	async function moveFromOptions(direction: -1 | 1) {
		if (!rowOptionsTarget) return;
		await moveItem(rowOptionsTarget.songId, direction);
		rowOptionsSheetOpen = false;
	}

	async function removeFromOptions() {
		if (!rowOptionsTarget) return;
		await removeItem(rowOptionsTarget.songId);
		rowOptionsSheetOpen = false;
	}

	// --- Add songs sheet ----------------------------------------------------

	let addSongsOpen = $state(false);
	let addSongsQuery = $state('');
	let addSongsError = $state<string | undefined>();

	interface LibrarySongRow {
		id: string;
		title: string;
		subtitle: string;
	}

	// All songs in the library, independent of this collection's own live
	// query, so the sheet can show every song (not just members) with a
	// checkmark for the ones already in the set.
	let allSongsHandle = $state<LiveQueryHandle<LibrarySongRow[] | undefined>>();
	$effect(() => {
		const handle = createLiveQuery(
			async () => {
				const entries = await listSongsWithDefaultPattern('alpha');
				return entries.map((entry) => ({
					id: entry.song.id,
					title: entry.song.title,
					subtitle: formatSongSubtitle(
						entry.song.authors,
						entry.preferredPattern ? formatPatternSummary(entry.preferredPattern) : undefined
					)
				}));
			},
			untrack(() => allSongsHandle?.value)
		);
		allSongsHandle = handle;
		return () => handle.destroy();
	});

	let memberIds = $derived(new Set((detail?.items ?? []).map((entry) => entry.song.id)));

	let filteredLibrarySongs = $derived.by(() => {
		const rows = allSongsHandle?.value ?? [];
		const query = addSongsQuery.trim().toLowerCase();
		if (!query) return rows;
		return rows.filter((row) => row.title.toLowerCase().includes(query));
	});

	function openAddSongs() {
		addSongsQuery = '';
		addSongsError = undefined;
		addSongsOpen = true;
	}

	async function toggleAddSongsMembership(songId: string, isMember: boolean) {
		addSongsError = undefined;
		try {
			if (isMember) {
				await removeSongFromCollection(collectionId, songId);
			} else {
				await addSongToCollection(collectionId, songId);
			}
		} catch (err) {
			addSongsError =
				err instanceof StorageQuotaError ? err.message : 'Could not update — please try again.';
		}
	}

	function songSubtitle(item: {
		song: { authors: string[] };
		preferredPattern?: { shapeKey: string; capo: number; soundingKey: string };
	}): string {
		return formatSongSubtitle(
			item.song.authors,
			item.preferredPattern ? formatPatternSummary(item.preferredPattern) : undefined
		);
	}
</script>

<svelte:head>
	<title>{detail ? `${detail.collection.name} — Lyre` : 'Collection — Lyre'}</title>
</svelte:head>

{#if !loaded}
	<TopBar title="Collection">
		{#snippet leading()}
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center text-ink"
				aria-label="Back to Library"
				onclick={backToLibrary}
			>
				<ChevronLeft class="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
			</button>
		{/snippet}
	</TopBar>
{:else if !detail}
	<TopBar title="Collection not found">
		{#snippet leading()}
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center text-ink"
				aria-label="Back to Library"
				onclick={backToLibrary}
			>
				<ChevronLeft class="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
			</button>
		{/snippet}
	</TopBar>
	<!-- Reachable from a stale deep link (a collection deleted elsewhere) — a
	     real not-found state, not a crash (docs/PLAN-v0.3.md §E3). -->
	<EmptyState
		icon={ListMusic}
		title="Collection not found"
		description="This collection may have been deleted."
	>
		{#snippet action()}
			<Button onclick={backToLibrary}>Back to Library</Button>
		{/snippet}
	</EmptyState>
{:else}
	<TopBar title={detail.collection.name}>
		{#snippet leading()}
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center text-ink"
				aria-label="Back to Library"
				onclick={backToLibrary}
			>
				<ChevronLeft class="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
			</button>
		{/snippet}
		{#snippet actions()}
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center text-ink"
				aria-label="Add songs"
				onclick={openAddSongs}
			>
				<Plus class="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
			</button>
		{/snippet}
	</TopBar>

	{#if reorderError}
		<p class="px-4 pb-3 text-[13px] text-ink-2">{reorderError}</p>
	{/if}

	{#if detail.items.length === 0}
		<EmptyState
			icon={ListMusic}
			title="No songs in this set yet"
			description="Add songs from your library to build this set."
		>
			{#snippet action()}
				<Button onclick={openAddSongs}>Add songs</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div>
			{#each detail.items as entry (entry.song.id)}
				<ListItem
					title={entry.song.title}
					subtitle={songSubtitle(entry)}
					onclick={() => goToSong(entry.song.id)}
				>
					{#snippet trailing()}
						<button
							type="button"
							class="flex h-8 w-8 shrink-0 items-center justify-center text-ink-3"
							aria-label="Song options for {entry.song.title}"
							onclick={(event) => openRowOptions(entry.song.id, entry.song.title, event)}
						>
							<EllipsisVertical class="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
						</button>
					{/snippet}
				</ListItem>
			{/each}
		</div>
	{/if}
{/if}

<!-- Per-row overflow: Move up / Move down / Remove from collection. Move
     buttons are disabled (not hidden) at the list ends, per the
     accessibility note in docs/PLAN-v0.3.md §E3. -->
<Sheet bind:open={rowOptionsSheetOpen} title={rowOptionsTarget?.title} onclose={closeRowOptions}>
	<div class="flex flex-col gap-2 pb-2">
		<Button
			variant="ghost"
			size="lg"
			aria-label="Move up"
			disabled={rowOptionsIndex <= 0}
			onclick={() => moveFromOptions(-1)}
		>
			Move up
		</Button>
		<Button
			variant="ghost"
			size="lg"
			aria-label="Move down"
			disabled={rowOptionsIndex < 0 || rowOptionsIndex === (detail?.items.length ?? 1) - 1}
			onclick={() => moveFromOptions(1)}
		>
			Move down
		</Button>
		<Button variant="destructive" size="lg" onclick={removeFromOptions}>
			Remove from collection
		</Button>
	</div>
</Sheet>

<!-- Add songs: searchable library list with checkmarks for existing members. -->
<Sheet bind:open={addSongsOpen} title="Add songs" onclose={() => (addSongsOpen = false)}>
	<div class="flex flex-col gap-3 pb-2">
		<SearchBar bind:value={addSongsQuery} placeholder="Search your library" />
		{#if addSongsError}
			<p class="text-[13px] text-ink-2">{addSongsError}</p>
		{/if}
		<!-- Review fix: distinguish "still loading" / "library has no songs at
		     all" / "search matched nothing" — collapsing all three into one
		     "No songs match." wrongly told a zero-song library the same thing
		     a mistyped search would. -->
		{#if allSongsHandle?.value === undefined}
			<!-- Loading: nothing to show yet, avoids flashing any of the states below. -->
		{:else if allSongsHandle.value.length === 0}
			<div class="flex flex-col items-center gap-3 py-6 text-center">
				<p class="text-[15px] text-ink-2">Your library doesn't have any songs yet.</p>
				<Button onclick={() => goto(resolve('/add'))}>Add a song</Button>
			</div>
		{:else if filteredLibrarySongs.length === 0}
			<p class="py-6 text-center text-[15px] text-ink-2">
				No songs match “{addSongsQuery}”.
			</p>
		{:else}
			<div class="-mx-4">
				{#each filteredLibrarySongs as row (row.id)}
					{@const isMember = memberIds.has(row.id)}
					<ListItem
						title={row.title}
						subtitle={row.subtitle}
						role="checkbox"
						aria-checked={isMember}
						onclick={() => toggleAddSongsMembership(row.id, isMember)}
					>
						{#snippet trailing()}
							{#if isMember}
								<Check class="h-5 w-5 text-ink" strokeWidth={2} aria-hidden="true" />
							{/if}
						{/snippet}
					</ListItem>
				{/each}
			</div>
		{/if}
	</div>
</Sheet>
