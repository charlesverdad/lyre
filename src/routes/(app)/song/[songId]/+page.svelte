<script lang="ts">
	/**
	 * Play mode (task B3, mvp-spec.md F3) — "the" screen: chart rendering,
	 * the transpose sheet (domain-model.md §1), font scale + view toggles,
	 * and a screen wake lock while it's open.
	 */
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Music from '@lucide/svelte/icons/music';
	import Mic from '@lucide/svelte/icons/mic';
	import ListMusic from '@lucide/svelte/icons/list-music';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import Check from '@lucide/svelte/icons/check';

	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ListItem from '$lib/ui/ListItem.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TopBar from '$lib/ui/TopBar.svelte';

	import { getSongWithDetails, savePattern, touchLastPlayed } from '$lib/db/repo';
	import {
		addSongToCollection,
		createCollection,
		listCollections,
		listCollectionsForSong,
		removeSongFromCollection,
		type CollectionSummary
	} from '$lib/db/collections';
	import { createLiveQuery, type LiveQueryHandle } from '$lib/db/liveQuery.svelte';
	import { StorageQuotaError } from '$lib/db/store';
	import type { ChartRecord, PatternRecord, SongRecord, ChartDoc } from '$lib/theory/types';
	import { parseChordPro } from '$lib/chart/chordpro';

	import ChordChart from '$lib/play/ChordChart.svelte';
	import {
		formatAnswerHeadline,
		formatAnswerSubline,
		formatBadge,
		formatChipCapo
	} from '$lib/play/format';
	import { DEFAULT_FONT_SCALE, clampFontScale, stepFontScale } from '$lib/play/fontScale';
	import {
		applyJustForNow,
		applySaveAsMyPattern,
		cancelDraft,
		createPatternSession,
		openDraft,
		withShapeKey,
		withSoundingKey,
		withWorkingFontScale,
		type PatternSessionState,
		type PlayPattern
	} from '$lib/play/patternSession';
	import { keyOptions, shapeOptions, type ShapeOption } from '$lib/play/shapeOptions';
	import { pickDefaultChart, pickPreferredPattern } from '$lib/play/song';

	type LoadState = 'loading' | 'song-not-found' | 'no-chart' | 'ready';

	let loadState = $state<LoadState>('loading');
	let song = $state<SongRecord | undefined>();
	let chart = $state<(ChartRecord & { patterns: PatternRecord[] }) | undefined>();
	let doc = $state<ChartDoc | undefined>();
	let preferredPattern = $state<PatternRecord | undefined>();
	let session = $state<PatternSessionState | undefined>();

	let viewMode = $state<'both' | 'chordsOnly' | 'lyricsOnly'>('both');
	let transposeSheetOpen = $state(false);
	// StorageQuotaError copy (task E1, docs/PLAN-v0.3.md §E1: never a silent
	// failure or unhandled rejection when a save hits the localStorage quota).
	let patternSaveError = $state<string | undefined>();
	// Non-blocking: `touchLastPlayed`'s write failing shouldn't stop the song
	// from being usable, just surface a quiet note (review fix, task E1).
	let recentlyPlayedError = $state<string | undefined>();
	let moreShapesOpen = $state(false);
	let bottomBarVisible = $state(true);

	// "Play in key" chips: tagged against `song.defaultKey` — the chart's
	// original *sounding* key (set from the initial grabbed/entered pattern's
	// soundingKey) — not `chart.sourceKey`, which is the shape key the chords
	// are written in and only coincides with the sounding key at capo 0
	// (review fix, task D3).
	const keyChoices = $derived(song ? keyOptions(song.defaultKey) : []);

	const songId = $derived(page.params.songId);

	$effect(() => {
		const id = songId;
		if (!id) return;
		void load(id);
	});

	async function load(id: string) {
		loadState = 'loading';
		recentlyPlayedError = undefined;
		const details = await getSongWithDetails(id);
		if (!details) {
			loadState = 'song-not-found';
			return;
		}

		const defaultChart = pickDefaultChart(details.charts);
		if (!defaultChart) {
			song = details.song;
			loadState = 'no-chart';
			return;
		}

		song = details.song;
		chart = defaultChart;
		doc = parseChordPro(defaultChart.chordproSource, { sourceKey: defaultChart.sourceKey });
		preferredPattern = pickPreferredPattern(defaultChart.patterns);

		const saved: PlayPattern = preferredPattern
			? {
					soundingKey: preferredPattern.soundingKey,
					shapeKey: preferredPattern.shapeKey,
					capo: preferredPattern.capo,
					fontScale: clampFontScale(preferredPattern.fontScale)
				}
			: {
					soundingKey: defaultChart.sourceKey,
					shapeKey: defaultChart.sourceKey,
					capo: 0,
					fontScale: DEFAULT_FONT_SCALE
				};

		session = createPatternSession(saved);
		viewMode = 'both';
		loadState = 'ready';

		// F1 "recently played" sort — stamp on every open, not gated on anything
		// else. A full-document write, so it can throw `StorageQuotaError` for a
		// full-storage user — caught here (review fix, task E1) rather than
		// left to reject the `void load(id)` call below unhandled; the song is
		// already rendered by this point, so a failed timestamp shouldn't block
		// reading it, just get a quiet inline note.
		try {
			await touchLastPlayed(id);
		} catch (err) {
			console.error('touchLastPlayed failed', err);
			recentlyPlayedError =
				err instanceof StorageQuotaError
					? err.message
					: "Couldn't update recently-played — storage write failed.";
		}
	}

	// --- Transpose sheet -----------------------------------------------

	function openTransposeSheet() {
		if (!session) return;
		session = openDraft(session);
		moreShapesOpen = false;
		patternSaveError = undefined;
		transposeSheetOpen = true;
	}

	// Fires on *any* dialog close (backdrop tap, Escape, or our own footer
	// handlers below setting `transposeSheetOpen = false`). Safe to always
	// revert the draft here: the footer handlers already sync
	// draft === working before closing, so this is a no-op in that case.
	function handleSheetClosed() {
		if (!session) return;
		session = cancelDraft(session);
	}

	/** "Play in key" picker (task D3, intent 1): keep shape, pick a new sounding key. */
	function pickSoundingKey(key: string) {
		if (!session) return;
		session = withSoundingKey(session, key);
	}

	const shapeChoices = $derived(
		session ? shapeOptions({ soundingKey: session.draft.soundingKey }) : []
	);
	const comfortShapeChoices = $derived(shapeChoices.slice(0, 5));
	const moreShapeChoices = $derived(shapeChoices.slice(5));
	const visibleShapeChoices = $derived(moreShapesOpen ? shapeChoices : comfortShapeChoices);

	/** "With shapes" picker (task D3, intent 2): keep sounding key, pick a new shape. */
	function pickShape(option: ShapeOption) {
		if (!session || option.disabled) return;
		session = withShapeKey(session, option.shapeKey);
	}

	/** Highest capo considered playable — matches `shapeOptions`/`withSoundingKey`'s default. */
	const MAX_CAPO = 9;

	async function handleSaveAsMyPattern() {
		if (!session || !chart) return;
		const draft = session.draft;
		// Belt-and-braces guard (review fix, task D3): `withSoundingKey` already
		// auto-switches shapes to avoid landing on an unplayable capo, but never
		// persist one regardless of how the draft got here.
		if (draft.capo > MAX_CAPO) return;
		patternSaveError = undefined;
		try {
			const record = await savePattern({
				// Update the current preferred pattern in place rather than
				// inserting a new row each time (repo.ts `savePattern` upserts on
				// `id`) — otherwise every "Save as my pattern" tap would leave
				// behind an orphaned, no-longer-preferred pattern row.
				id: preferredPattern?.id,
				chartId: chart.id,
				label: preferredPattern?.label ?? 'My usual',
				soundingKey: draft.soundingKey,
				shapeKey: draft.shapeKey,
				capo: draft.capo,
				fontScale: draft.fontScale,
				isPreferred: true
			});
			preferredPattern = record;
			session = applySaveAsMyPattern(session);
			transposeSheetOpen = false;
		} catch (err) {
			patternSaveError =
				err instanceof StorageQuotaError ? err.message : 'Could not save — please try again.';
		}
	}

	function handleJustForNow() {
		if (!session) return;
		session = applyJustForNow(session);
		transposeSheetOpen = false;
	}

	// --- Bottom bar: font scale + view toggles --------------------------

	function stepFont(direction: 1 | -1) {
		if (!session) return;
		session = withWorkingFontScale(session, stepFontScale(session.working.fontScale, direction));
	}

	function setViewMode(mode: 'chordsOnly' | 'lyricsOnly') {
		viewMode = viewMode === mode ? 'both' : mode;
	}

	function goToEdit() {
		if (!songId) return;
		goto(resolve('/(app)/edit/[songId]', { songId }));
	}

	// --- Add to collection (task E3, docs/PLAN-v0.3.md §E3) --------------

	let addToCollectionOpen = $state(false);
	let addToCollectionError = $state<string | undefined>();
	let newCollectionName = $state('');
	let creatingCollection = $state(false);

	interface AddToCollectionData {
		collections: CollectionSummary[];
		memberIds: Set<string>;
	}

	// Live so a membership edit made here (or on the collection screen, in
	// another tab, anywhere) reflects immediately — same `untrack` shape as
	// the library screen's live query.
	let addToCollectionHandle = $state<LiveQueryHandle<AddToCollectionData | undefined>>();
	$effect(() => {
		const id = songId;
		const handle = createLiveQuery<AddToCollectionData | undefined>(
			async () => {
				if (!id) return undefined;
				const [collections, memberOf] = await Promise.all([
					listCollections(),
					listCollectionsForSong(id)
				]);
				return { collections, memberIds: new Set(memberOf.map((c) => c.id)) };
			},
			untrack(() => addToCollectionHandle?.value)
		);
		addToCollectionHandle = handle;
		return () => handle.destroy();
	});

	function openAddToCollection() {
		addToCollectionError = undefined;
		newCollectionName = '';
		addToCollectionOpen = true;
	}

	async function toggleCollectionMembership(collectionId: string, isMember: boolean) {
		if (!songId) return;
		addToCollectionError = undefined;
		try {
			if (isMember) {
				await removeSongFromCollection(collectionId, songId);
			} else {
				await addSongToCollection(collectionId, songId);
			}
		} catch (err) {
			addToCollectionError =
				err instanceof StorageQuotaError ? err.message : 'Could not update — please try again.';
		}
	}

	async function createAndAddCollection() {
		const name = newCollectionName.trim();
		if (!name || !songId) return;
		addToCollectionError = undefined;
		creatingCollection = true;
		try {
			const collection = await createCollection({ name });
			await addSongToCollection(collection.id, songId);
			newCollectionName = '';
		} catch (err) {
			addToCollectionError =
				err instanceof StorageQuotaError ? err.message : 'Could not create — please try again.';
		} finally {
			creatingCollection = false;
		}
	}

	// --- Wake lock + collapsible bottom bar ------------------------------

	onMount(() => {
		let wakeLock: { release: () => Promise<void> } | undefined;

		async function requestWakeLock() {
			const nav = navigator as Navigator & {
				wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
			};
			if (!nav.wakeLock) return;
			try {
				wakeLock = await nav.wakeLock.request('screen');
			} catch {
				// Quiet feature-detect failure (unsupported, backgrounded tab, etc).
			}
		}

		function handleVisibilityChange() {
			if (document.visibilityState === 'visible') void requestWakeLock();
		}

		let lastScrollY = window.scrollY;
		function handleScroll() {
			const y = window.scrollY;
			if (y <= 40) bottomBarVisible = true;
			else if (y > lastScrollY + 4) bottomBarVisible = false;
			else if (y < lastScrollY - 4) bottomBarVisible = true;
			lastScrollY = y;
		}

		void requestWakeLock();
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('scroll', handleScroll);
			void wakeLock?.release();
		};
	});
</script>

<svelte:head>
	<title>{song ? `${song.title} — Lyre` : 'Lyre'}</title>
</svelte:head>

{#if loadState === 'song-not-found'}
	<TopBar title="Song not found" />
	<EmptyState
		icon={ListMusic}
		title="Song not found"
		description="This song may have been removed from your library."
	>
		{#snippet action()}
			<Button onclick={() => goto(resolve('/library'))}>Back to Library</Button>
		{/snippet}
	</EmptyState>
{:else if loadState === 'no-chart'}
	<TopBar title={song?.title ?? 'Song'} />
	<EmptyState
		icon={ListMusic}
		title="No chart yet"
		description="This song doesn't have a chart to play from."
	>
		{#snippet action()}
			<Button onclick={() => goto(resolve('/library'))}>Back to Library</Button>
		{/snippet}
	</EmptyState>
{:else if loadState === 'ready' && song && doc && session}
	<TopBar title={song.title}>
		{#snippet actions()}
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center text-ink"
				aria-label="Add to collection"
				onclick={openAddToCollection}
			>
				<FolderPlus class="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
			</button>
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center text-ink"
				aria-label="Edit song"
				onclick={goToEdit}
			>
				<SquarePen class="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
			</button>
		{/snippet}
	</TopBar>

	<div class="px-4 pb-3">
		<button type="button" aria-haspopup="dialog" onclick={openTransposeSheet}>
			<Badge>{formatBadge(session.working)}</Badge>
		</button>
	</div>

	{#if recentlyPlayedError}
		<p class="px-4 pb-3 text-[13px] text-ink-2">{recentlyPlayedError}</p>
	{/if}

	<div class="px-4 pt-1 pb-[calc(8rem+var(--safe-bottom))]">
		<ChordChart
			{doc}
			shapeKey={session.working.shapeKey}
			fontScale={session.working.fontScale}
			hideChords={viewMode === 'lyricsOnly'}
			hideLyrics={viewMode === 'chordsOnly'}
		/>
	</div>

	<!-- docs/design.md: "controls collapse to a single translucent bottom bar
	     that hides on scroll" — sits above the app shell's fixed TabBar. -->
	<div
		class="fixed inset-x-0 z-30 border-t border-line bg-bg/80 backdrop-blur transition-transform duration-200 ease-out {bottomBarVisible
			? 'translate-y-0'
			: 'translate-y-full'}"
		style="bottom: calc(4rem + var(--safe-bottom))"
	>
		<div class="mx-auto flex max-w-[640px] items-center justify-between gap-2 px-4 py-2">
			<div class="flex items-center gap-1" role="group" aria-label="Font size">
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink"
					aria-label="Decrease font size"
					onclick={() => stepFont(-1)}
				>
					<Minus class="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
				</button>
				<span class="w-8 text-center text-[13px] text-ink-2">{session.working.fontScale}</span>
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink"
					aria-label="Increase font size"
					onclick={() => stepFont(1)}
				>
					<Plus class="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
				</button>
			</div>
			<div class="flex items-center gap-1" role="group" aria-label="View">
				<Button
					variant={viewMode === 'chordsOnly' ? 'primary' : 'ghost'}
					size="sm"
					aria-pressed={viewMode === 'chordsOnly'}
					onclick={() => setViewMode('chordsOnly')}
				>
					<Music class="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
					Chords
				</Button>
				<Button
					variant={viewMode === 'lyricsOnly' ? 'primary' : 'ghost'}
					size="sm"
					aria-pressed={viewMode === 'lyricsOnly'}
					onclick={() => setViewMode('lyricsOnly')}
				>
					<Mic class="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
					Lyrics
				</Button>
			</div>
		</div>
	</div>

	<Sheet bind:open={transposeSheetOpen} title="Transpose" onclose={handleSheetClosed}>
		<div class="flex flex-col gap-6 pb-2">
			<!-- The answer: "I want to play in key X, with shape Y — tell me the
			     capo." Big and unmissable, replaces the old three-stepper cluster
			     (task D3). aria-live so screen reader users hear the answer
			     update as they tap key/shape chips (review fix). -->
			<div class="flex flex-col gap-0.5 pt-1" aria-live="polite" aria-atomic="true">
				<span class="text-[28px] font-bold text-ink">{formatAnswerHeadline(session.draft)}</span>
				<span class="text-[15px] text-ink-2">{formatAnswerSubline(session.draft)}</span>
			</div>

			<section class="flex flex-col gap-2">
				<h3 class="text-[13px] font-semibold text-ink-2 uppercase">Play in key</h3>
				<div class="flex flex-wrap gap-2">
					{#each keyChoices as option (option.key)}
						{@const selected = session.draft.soundingKey === option.key}
						<button
							type="button"
							aria-pressed={selected}
							aria-label="Play in key {option.key}"
							class="chord flex min-w-[52px] flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-[15px] {selected
								? 'border-ink bg-ink text-bg'
								: 'border-line text-ink'}"
							onclick={() => pickSoundingKey(option.key)}
						>
							<span>{option.key}</span>
							{#if option.isOriginal}
								<span
									class="text-[10px] font-normal uppercase {selected ? 'text-bg/70' : 'text-ink-2'}"
								>
									Original
								</span>
							{/if}
						</button>
					{/each}
				</div>
			</section>

			<section class="flex flex-col gap-2">
				<h3 class="text-[13px] font-semibold text-ink-2 uppercase">With shapes</h3>
				<div class="flex flex-wrap gap-2">
					{#each visibleShapeChoices as option (option.shapeKey)}
						{@const selected = session.draft.shapeKey === option.shapeKey}
						<button
							type="button"
							disabled={option.disabled}
							aria-pressed={selected}
							aria-label="{option.shapeKey} shapes · {formatChipCapo(option.capo)}"
							class="chord flex min-w-[68px] flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-[15px] disabled:opacity-40 {selected
								? 'border-ink bg-ink text-bg'
								: 'border-line text-ink'}"
							onclick={() => pickShape(option)}
						>
							<span>{option.shapeKey}</span>
							<span class="text-[11px] {selected ? 'text-bg/70' : 'text-ink-2'}">
								{formatChipCapo(option.capo)}
							</span>
							{#if option.suggested}
								<span class="text-[10px] uppercase {selected ? 'text-bg/70' : 'text-ink-3'}">
									Suggested
								</span>
							{/if}
						</button>
					{/each}
					{#if !moreShapesOpen && moreShapeChoices.length > 0}
						<button
							type="button"
							class="flex min-w-[68px] items-center justify-center rounded-lg border border-line px-3 py-2 text-[15px] text-ink-2"
							onclick={() => (moreShapesOpen = true)}
						>
							More…
						</button>
					{/if}
				</div>
			</section>

			<div class="flex flex-col gap-2 border-t border-line pt-4">
				{#if patternSaveError}
					<p class="text-[13px] text-ink-2">{patternSaveError}</p>
				{/if}
				<Button size="lg" disabled={session.draft.capo > MAX_CAPO} onclick={handleSaveAsMyPattern}>
					Save as my pattern
				</Button>
				<Button variant="ghost" size="lg" onclick={handleJustForNow}>Just for now</Button>
			</div>
		</div>
	</Sheet>

	<!-- Add to collection: every collection with a checkmark for membership
	     (tap toggles), plus an inline "New collection" field (docs/PLAN-v0.3.md §E3). -->
	<Sheet
		bind:open={addToCollectionOpen}
		title="Add to collection"
		onclose={() => (addToCollectionOpen = false)}
	>
		<div class="flex flex-col gap-3 pb-2">
			{#if addToCollectionError}
				<p class="text-[13px] text-ink-2">{addToCollectionError}</p>
			{/if}

			{#if addToCollectionHandle?.value}
				{#if addToCollectionHandle.value.collections.length === 0}
					<p class="py-2 text-[15px] text-ink-2">No collections yet — create one below.</p>
				{:else}
					<div class="-mx-4">
						{#each addToCollectionHandle.value.collections as { collection, songCount } (collection.id)}
							{@const isMember = addToCollectionHandle.value.memberIds.has(collection.id)}
							<ListItem
								title={collection.name}
								subtitle={songCount === 0
									? 'No songs yet'
									: `${songCount} ${songCount === 1 ? 'song' : 'songs'}`}
								role="checkbox"
								aria-checked={isMember}
								onclick={() => toggleCollectionMembership(collection.id, isMember)}
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
			{/if}

			<label class="flex flex-col gap-1.5 border-t border-line pt-3">
				<span class="text-[13px] font-semibold text-ink-2">New collection</span>
				<div class="flex gap-2">
					<input
						type="text"
						class="w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
						placeholder="e.g. Sunday service"
						bind:value={newCollectionName}
					/>
					<Button onclick={createAndAddCollection} disabled={creatingCollection}>Add</Button>
				</div>
			</label>
		</div>
	</Sheet>
{/if}
