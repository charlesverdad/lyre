<script lang="ts">
	import { untrack } from 'svelte';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ListItem from '$lib/ui/ListItem.svelte';
	import SearchBar from '$lib/ui/SearchBar.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TopBar from '$lib/ui/TopBar.svelte';
	import { createLiveQuery, type LiveQueryHandle } from '$lib/db/liveQuery.svelte';
	import {
		deleteSong,
		listSongsWithDefaultPattern,
		searchSongs,
		type SongSort
	} from '$lib/db/repo';
	import {
		createCollection,
		deleteCollection,
		listCollections,
		updateCollection
	} from '$lib/db/collections';
	import { StorageQuotaError } from '$lib/db/store';
	import { formatPatternSummary, formatSongSubtitle } from '$lib/library/format';
	import { loadSortPreference, saveSortPreference } from '$lib/library/sortPreference';
	import {
		loadLibraryViewMode,
		saveLibraryViewMode,
		type LibraryViewMode
	} from '$lib/library/collectionsViewPreference';

	interface LibraryRow {
		id: string;
		title: string;
		subtitle: string;
	}

	interface CollectionRow {
		id: string;
		name: string;
		description?: string;
		songCount: number;
	}

	const SORT_OPTIONS: { value: SongSort; label: string }[] = [
		{ value: 'recentlyPlayed', label: 'Recently played' },
		{ value: 'recentlyAdded', label: 'Recently added' },
		{ value: 'alpha', label: 'A–Z' }
	];

	const VIEW_OPTIONS: { value: LibraryViewMode; label: string }[] = [
		{ value: 'songs', label: 'Songs' },
		{ value: 'collections', label: 'Collections' }
	];

	let viewMode = $state<LibraryViewMode>(loadLibraryViewMode());
	let sort = $state<SongSort>(loadSortPreference());
	let searchValue = $state('');
	let debouncedQuery = $state('');
	let deleteTarget = $state<LibraryRow | undefined>();
	let deleteSheetOpen = $state(false);
	// StorageQuotaError copy (task E1, docs/PLAN-v0.3.md §E1: never a silent
	// failure or unhandled rejection when a save/delete hits the quota).
	let deleteError = $state<string | undefined>();

	// F1: "instant client-side search" — debounce the query a touch so fast
	// typing doesn't thrash the live query below, but it's still effectively
	// instant to a person typing. Shared by both the song search and the
	// collections-mode name filter (task E3) — only one search box is ever on
	// screen at a time, so one debounce is enough.
	$effect(() => {
		const next = searchValue;
		const timer = setTimeout(() => {
			debouncedQuery = next;
		}, 150);
		return () => clearTimeout(timer);
	});

	function changeViewMode(next: LibraryViewMode) {
		viewMode = next;
		saveLibraryViewMode(next);
	}

	// --- Songs mode -----------------------------------------------------

	// `createLiveQuery` re-runs its querier on every store mutation, but it
	// doesn't know about outside reactive deps like `sort`/`debouncedQuery` —
	// so this effect tears down and recreates the subscription whenever they
	// change, and otherwise leaves it running. That live subscription is also
	// what satisfies "refresh after delete and when returning to the page"
	// (B1 point 8): any write through repo.ts (including deleteSong) re-runs
	// the query automatically, no manual invalidation needed.
	// `undefined` (as opposed to `[]`) marks "no result yet" so the first
	// render doesn't flash the empty state before the query resolves; once
	// loaded, a sort/search change reuses the previous rows as the next
	// handle's initial value so *those* don't flash back to empty either.
	let listHandle = $state<LiveQueryHandle<LibraryRow[] | undefined>>();
	$effect(() => {
		const currentSort = sort;
		const query = debouncedQuery.trim();

		// `untrack` here is load-bearing, not decorative: this effect *writes*
		// `listHandle` below, so an untracked read of `listHandle?.value` seeds
		// the new query's initial value from the previous one (per the comment
		// above) without also making `listHandle` one of this effect's own
		// dependencies — otherwise every run's `listHandle = handle` write
		// would immediately re-trigger this same effect, forever (Svelte's
		// `effect_update_depth_exceeded`, hit while testing task C2's e2e
		// suite: the library screen never got past its loading state).
		const handle = createLiveQuery(
			async () => {
				const entries = await listSongsWithDefaultPattern(currentSort);
				const rows = entries.map((entry) => ({
					id: entry.song.id,
					title: entry.song.title,
					subtitle: formatSongSubtitle(
						entry.song.authors,
						entry.preferredPattern ? formatPatternSummary(entry.preferredPattern) : undefined
					)
				}));
				if (!query) return rows;
				const matches = await searchSongs(query);
				const matchIds = new Set(matches.map((song) => song.id));
				return rows.filter((row) => matchIds.has(row.id));
			},
			untrack(() => listHandle?.value)
		);

		listHandle = handle;
		return () => handle.destroy();
	});

	let songsLoaded = $derived(listHandle?.value !== undefined);
	let songRows = $derived(listHandle?.value ?? []);

	function changeSort(next: SongSort) {
		sort = next;
		saveSortPreference(next);
	}

	function goToSong(id: string) {
		goto(resolve('/(app)/song/[songId]', { songId: id }));
	}

	function openDeleteSheet(row: LibraryRow, event: Event) {
		event.stopPropagation();
		deleteTarget = row;
		deleteError = undefined;
		deleteSheetOpen = true;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		deleteError = undefined;
		try {
			await deleteSong(deleteTarget.id);
			deleteSheetOpen = false;
			deleteTarget = undefined;
		} catch (err) {
			// Keep the sheet open with a readable message rather than an
			// unhandled rejection (review fix, task E1) — the sheet staying
			// open with no explanation would look like the tap did nothing.
			deleteError =
				err instanceof StorageQuotaError ? err.message : 'Could not delete — please try again.';
		}
	}

	function cancelDelete() {
		deleteSheetOpen = false;
		deleteTarget = undefined;
		deleteError = undefined;
	}

	// --- Collections mode (task E3, docs/PLAN-v0.3.md §E3) ---------------

	// Same shape and same `untrack` reasoning as the song list effect above.
	let collectionsHandle = $state<LiveQueryHandle<CollectionRow[] | undefined>>();
	$effect(() => {
		const query = debouncedQuery.trim().toLowerCase();
		const handle = createLiveQuery(
			async () => {
				const summaries = await listCollections();
				const rows = summaries.map((summary) => ({
					id: summary.collection.id,
					name: summary.collection.name,
					description: summary.collection.description,
					songCount: summary.songCount
				}));
				if (!query) return rows;
				return rows.filter((row) => row.name.toLowerCase().includes(query));
			},
			untrack(() => collectionsHandle?.value)
		);
		collectionsHandle = handle;
		return () => handle.destroy();
	});

	let collectionsLoaded = $derived(collectionsHandle?.value !== undefined);
	let collectionRows = $derived(collectionsHandle?.value ?? []);

	function goToCollection(id: string) {
		goto(resolve('/(app)/collection/[collectionId]', { collectionId: id }));
	}

	function collectionSubtitle(row: CollectionRow): string {
		if (row.songCount === 0) return 'No songs yet';
		return row.songCount === 1 ? '1 song' : `${row.songCount} songs`;
	}

	// Create/rename share one sheet + form: `formMode` picks which repo call
	// `submitCollectionForm` makes, `formTarget` carries the id being renamed.
	let formMode = $state<'create' | 'rename'>('create');
	let formTarget = $state<CollectionRow | undefined>();
	let formSheetOpen = $state(false);
	let formName = $state('');
	let formDescription = $state('');
	let formError = $state<string | undefined>();
	let formSaving = $state(false);

	function openCreateSheet() {
		formMode = 'create';
		formTarget = undefined;
		formName = '';
		formDescription = '';
		formError = undefined;
		formSheetOpen = true;
	}

	function openRenameSheet(row: CollectionRow) {
		formMode = 'rename';
		formTarget = row;
		formName = row.name;
		formDescription = row.description ?? '';
		formError = undefined;
		formSheetOpen = true;
	}

	function cancelForm() {
		formSheetOpen = false;
		formError = undefined;
	}

	async function submitCollectionForm() {
		const name = formName.trim();
		if (!name) {
			formError = 'Name is required.';
			return;
		}
		formError = undefined;
		formSaving = true;
		try {
			const description = formDescription.trim() || undefined;
			if (formMode === 'create') {
				await createCollection({ name, description });
			} else if (formTarget) {
				await updateCollection(formTarget.id, { name, description });
			}
			formSheetOpen = false;
		} catch (err) {
			formError =
				err instanceof StorageQuotaError ? err.message : 'Could not save — please try again.';
		} finally {
			formSaving = false;
		}
	}

	// Per-row overflow sheet (Rename / Delete) — mirrors the song row's own
	// overflow sheet below, but collections get two actions instead of one.
	let optionsTarget = $state<CollectionRow | undefined>();
	let optionsSheetOpen = $state(false);

	function openCollectionOptions(row: CollectionRow, event: Event) {
		event.stopPropagation();
		optionsTarget = row;
		optionsSheetOpen = true;
	}

	function chooseRenameFromOptions() {
		optionsSheetOpen = false;
		if (optionsTarget) openRenameSheet(optionsTarget);
	}

	let deleteCollectionTarget = $state<CollectionRow | undefined>();
	let deleteCollectionSheetOpen = $state(false);
	let deleteCollectionError = $state<string | undefined>();

	function chooseDeleteFromOptions() {
		optionsSheetOpen = false;
		deleteCollectionTarget = optionsTarget;
		deleteCollectionError = undefined;
		deleteCollectionSheetOpen = true;
	}

	async function confirmDeleteCollection() {
		if (!deleteCollectionTarget) return;
		deleteCollectionError = undefined;
		try {
			await deleteCollection(deleteCollectionTarget.id);
			deleteCollectionSheetOpen = false;
			deleteCollectionTarget = undefined;
		} catch (err) {
			deleteCollectionError =
				err instanceof StorageQuotaError ? err.message : 'Could not delete — please try again.';
		}
	}

	function cancelDeleteCollection() {
		deleteCollectionSheetOpen = false;
		deleteCollectionTarget = undefined;
		deleteCollectionError = undefined;
	}
</script>

<svelte:head>
	<title>Library — Lyre</title>
</svelte:head>

<TopBar title="Library">
	{#snippet actions()}
		{#if viewMode === 'collections'}
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center text-ink"
				aria-label="New collection"
				onclick={openCreateSheet}
			>
				<Plus class="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
			</button>
		{/if}
	{/snippet}
</TopBar>

<div class="flex gap-1 px-4 pb-3" role="radiogroup" aria-label="Library view">
	{#each VIEW_OPTIONS as option (option.value)}
		<Button
			variant={viewMode === option.value ? 'primary' : 'ghost'}
			size="sm"
			aria-pressed={viewMode === option.value}
			onclick={() => changeViewMode(option.value)}
		>
			{option.label}
		</Button>
	{/each}
</div>

<div class="px-4 pb-3">
	<SearchBar
		bind:value={searchValue}
		placeholder={viewMode === 'songs' ? 'Search songs, authors, lyrics' : 'Search collections'}
	/>
</div>

{#if viewMode === 'songs'}
	{#if songsLoaded}
		{#if songRows.length === 0 && !searchValue.trim()}
			<EmptyState
				icon={LibraryBig}
				title="Add your first song"
				description="Grab a chart from a URL or paste one in to build your library."
			>
				{#snippet action()}
					<Button onclick={() => goto(resolve('/add'))}>Add your first song</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="flex gap-1 border-b border-line px-4 py-2" role="radiogroup" aria-label="Sort by">
				{#each SORT_OPTIONS as option (option.value)}
					<Button
						variant={sort === option.value ? 'primary' : 'ghost'}
						size="sm"
						aria-pressed={sort === option.value}
						onclick={() => changeSort(option.value)}
					>
						{option.label}
					</Button>
				{/each}
			</div>

			{#if songRows.length === 0}
				<EmptyState
					icon={LibraryBig}
					title="No matches"
					description="Nothing in your library matches “{searchValue}”."
				/>
			{:else}
				<div>
					{#each songRows as row (row.id)}
						<ListItem title={row.title} subtitle={row.subtitle} onclick={() => goToSong(row.id)}>
							{#snippet trailing()}
								<button
									type="button"
									class="flex h-8 w-8 shrink-0 items-center justify-center text-ink-3"
									aria-label="Song options"
									onclick={(event) => openDeleteSheet(row, event)}
								>
									<EllipsisVertical class="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
								</button>
							{/snippet}
						</ListItem>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
{:else if collectionsLoaded}
	{#if collectionRows.length === 0 && !searchValue.trim()}
		<EmptyState
			icon={LibraryBig}
			title="Create your first collection"
			description="Group songs into a named set — a service, a rehearsal list — and reorder it your way."
		>
			{#snippet action()}
				<Button onclick={openCreateSheet}>New collection</Button>
			{/snippet}
		</EmptyState>
	{:else if collectionRows.length === 0}
		<EmptyState
			icon={LibraryBig}
			title="No matches"
			description="No collections match “{searchValue}”."
		/>
	{:else}
		<div>
			{#each collectionRows as row (row.id)}
				<ListItem
					title={row.name}
					subtitle={collectionSubtitle(row)}
					onclick={() => goToCollection(row.id)}
				>
					{#snippet trailing()}
						<button
							type="button"
							class="flex h-8 w-8 shrink-0 items-center justify-center text-ink-3"
							aria-label="Collection options"
							onclick={(event) => openCollectionOptions(row, event)}
						>
							<EllipsisVertical class="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
						</button>
					{/snippet}
				</ListItem>
			{/each}
		</div>
	{/if}
{/if}

<!-- Song delete sheet (unchanged from before task E3). -->
<Sheet bind:open={deleteSheetOpen} title={deleteTarget?.title} onclose={cancelDelete}>
	<div class="flex flex-col gap-4 pb-2">
		<p class="text-[15px] text-ink-2">
			This removes the song, its charts, and every saved pattern. This can't be undone.
		</p>
		{#if deleteError}
			<p class="text-[13px] text-ink-2">{deleteError}</p>
		{/if}
		<div class="flex flex-col gap-2">
			<Button variant="destructive" size="lg" onclick={confirmDelete}>Delete song</Button>
			<Button variant="ghost" size="lg" onclick={cancelDelete}>Cancel</Button>
		</div>
	</div>
</Sheet>

<!-- Collection row overflow: Rename / Delete. -->
<Sheet
	bind:open={optionsSheetOpen}
	title={optionsTarget?.name}
	onclose={() => (optionsSheetOpen = false)}
>
	<div class="flex flex-col gap-2 pb-2">
		<Button variant="ghost" size="lg" onclick={chooseRenameFromOptions}>Rename</Button>
		<Button variant="destructive" size="lg" onclick={chooseDeleteFromOptions}>Delete</Button>
	</div>
</Sheet>

<!-- Create / rename collection form. -->
<Sheet
	bind:open={formSheetOpen}
	title={formMode === 'create' ? 'New collection' : 'Rename collection'}
	onclose={cancelForm}
>
	<div class="flex flex-col gap-4 pb-2">
		<label class="flex flex-col gap-1.5">
			<span class="text-[13px] font-semibold text-ink-2">Name *</span>
			<input
				type="text"
				class="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
				placeholder="e.g. Sunday service"
				bind:value={formName}
				required
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-[13px] font-semibold text-ink-2">Description</span>
			<input
				type="text"
				class="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
				placeholder="Optional"
				bind:value={formDescription}
			/>
		</label>
		{#if formError}
			<p class="text-[13px] text-ink-2">{formError}</p>
		{/if}
		<div class="flex flex-col gap-2">
			<Button size="lg" onclick={submitCollectionForm} disabled={formSaving}>
				{formMode === 'create' ? 'Create' : 'Save'}
			</Button>
			<Button variant="ghost" size="lg" onclick={cancelForm} disabled={formSaving}>Cancel</Button>
		</div>
	</div>
</Sheet>

<!-- Delete-collection confirmation — must state plainly that songs are kept (docs/PLAN-v0.3.md §E3). -->
<Sheet
	bind:open={deleteCollectionSheetOpen}
	title={deleteCollectionTarget?.name}
	onclose={cancelDeleteCollection}
>
	<div class="flex flex-col gap-4 pb-2">
		<p class="text-[15px] text-ink-2">
			This deletes the collection. The songs in it are kept in your library — only the set itself is
			removed. This can't be undone.
		</p>
		{#if deleteCollectionError}
			<p class="text-[13px] text-ink-2">{deleteCollectionError}</p>
		{/if}
		<div class="flex flex-col gap-2">
			<Button variant="destructive" size="lg" onclick={confirmDeleteCollection}>
				Delete collection
			</Button>
			<Button variant="ghost" size="lg" onclick={cancelDeleteCollection}>Cancel</Button>
		</div>
	</div>
</Sheet>
