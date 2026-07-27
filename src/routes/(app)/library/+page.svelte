<script lang="ts">
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
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
	import { formatPatternSummary, formatSongSubtitle } from '$lib/library/format';
	import { loadSortPreference, saveSortPreference } from '$lib/library/sortPreference';

	interface LibraryRow {
		id: string;
		title: string;
		subtitle: string;
	}

	const SORT_OPTIONS: { value: SongSort; label: string }[] = [
		{ value: 'recentlyPlayed', label: 'Recently played' },
		{ value: 'recentlyAdded', label: 'Recently added' },
		{ value: 'alpha', label: 'A–Z' }
	];

	let sort = $state<SongSort>(loadSortPreference());
	let searchValue = $state('');
	let debouncedQuery = $state('');
	let deleteTarget = $state<LibraryRow | undefined>();
	let deleteSheetOpen = $state(false);

	// F1: "instant client-side search" — debounce the query a touch so fast
	// typing doesn't thrash the live query below, but it's still effectively
	// instant to a person typing.
	$effect(() => {
		const next = searchValue;
		const timer = setTimeout(() => {
			debouncedQuery = next;
		}, 150);
		return () => clearTimeout(timer);
	});

	// Dexie's `liveQuery` auto-tracks table reads *inside* the querier, but it
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

		const handle = createLiveQuery(async () => {
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
		}, listHandle?.value);

		listHandle = handle;
		return () => handle.destroy();
	});

	let loaded = $derived(listHandle?.value !== undefined);
	let rows = $derived(listHandle?.value ?? []);

	function changeSort(next: SongSort) {
		sort = next;
		saveSortPreference(next);
	}

	// /song/[id] (task B3) doesn't exist yet, so $app/paths#resolve can't
	// type-check it — plain goto() is the documented escape hatch until then.
	function goToSong(id: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`/song/${id}`);
	}

	function openDeleteSheet(row: LibraryRow, event: Event) {
		event.stopPropagation();
		deleteTarget = row;
		deleteSheetOpen = true;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		await deleteSong(deleteTarget.id);
		deleteSheetOpen = false;
		deleteTarget = undefined;
	}

	function cancelDelete() {
		deleteSheetOpen = false;
		deleteTarget = undefined;
	}
</script>

<svelte:head>
	<title>Library — Lyre</title>
</svelte:head>

<TopBar title="Library" />

<div class="px-4 pb-3">
	<SearchBar bind:value={searchValue} placeholder="Search songs, authors, lyrics" />
</div>

{#if loaded}
	{#if rows.length === 0 && !searchValue.trim()}
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

		{#if rows.length === 0}
			<EmptyState
				icon={LibraryBig}
				title="No matches"
				description="Nothing in your library matches “{searchValue}”."
			/>
		{:else}
			<div>
				{#each rows as row (row.id)}
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

<Sheet bind:open={deleteSheetOpen} title={deleteTarget?.title} onclose={cancelDelete}>
	<div class="flex flex-col gap-4 pb-2">
		<p class="text-[15px] text-ink-2">
			This removes the song, its charts, and every saved pattern. This can't be undone.
		</p>
		<div class="flex flex-col gap-2">
			<Button variant="destructive" size="lg" onclick={confirmDelete}>Delete song</Button>
			<Button variant="ghost" size="lg" onclick={cancelDelete}>Cancel</Button>
		</div>
	</div>
</Sheet>
