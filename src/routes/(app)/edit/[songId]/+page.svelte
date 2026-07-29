<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Button from '$lib/ui/Button.svelte';
	import ChartPreview from '$lib/ui/ChartPreview.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import MetadataForm from '$lib/ui/MetadataForm.svelte';
	import TopBar from '$lib/ui/TopBar.svelte';
	import { getSongWithDetails, updateSongAndChart } from '$lib/db/repo';
	import { StorageQuotaError } from '$lib/db/store';
	import type { ChartRecord, SongRecord } from '$lib/theory/types';
	import {
		buildChartUpdatePatch,
		buildSongUpdatePatch,
		canSaveChart,
		deriveChartParseState,
		metadataFormFromRecords,
		type MetadataFormValues
	} from '$lib/addedit';
	import { formatPatternSummary } from '$lib/library/format';

	const songId = $derived(page.params.songId ?? '');

	/** "Default" if present, else the earliest-created chart — same rule as the Library row (src/lib/db/repo.ts). */
	function pickDefaultChart(charts: ChartRecord[]): ChartRecord | undefined {
		return (
			charts.find((c) => c.name === 'Default') ??
			[...charts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
		);
	}

	let song = $state<SongRecord | undefined>();
	let chart = $state<ChartRecord | undefined>();
	let notFound = $state(false);

	let rawText = $state('');
	let form = $state<MetadataFormValues>();
	let keyManuallySet = $state(false);
	let tab = $state<'edit' | 'preview'>('edit');
	let saving = $state(false);
	// StorageQuotaError copy (task E1, docs/PLAN-v0.3.md §E1: never a silent
	// failure or unhandled rejection when a save hits the localStorage quota).
	let saveError = $state<string | undefined>();

	$effect(() => {
		const id = songId;
		notFound = false;
		song = undefined;
		chart = undefined;
		getSongWithDetails(id).then((details) => {
			if (!details) {
				notFound = true;
				return;
			}
			const defaultChart = pickDefaultChart(details.charts);
			if (!defaultChart) {
				notFound = true;
				return;
			}
			song = details.song;
			chart = defaultChart;
			rawText = defaultChart.chordproSource;
			form = metadataFormFromRecords(details.song, defaultChart);
			keyManuallySet = false;
		});
	});

	let parseState = $derived.by(() =>
		form ? deriveChartParseState(rawText, keyManuallySet ? form.sourceKey : undefined) : undefined
	);

	$effect(() => {
		if (!parseState || !form || keyManuallySet) return;
		if (form.sourceKey !== parseState.sourceKey)
			form = { ...form, sourceKey: parseState.sourceKey };
	});

	let patternChip = $derived(
		parseState?.initialPattern ? formatPatternSummary(parseState.initialPattern) : undefined
	);

	let canSave = $derived(!!form && canSaveChart(form.title, parseState) && !saving);

	function onMetadataChange(next: MetadataFormValues) {
		if (form && next.sourceKey !== form.sourceKey) keyManuallySet = true;
		form = next;
	}

	async function save() {
		if (!song || !chart || !form || !parseState || !canSave) return;
		saving = true;
		saveError = undefined;
		try {
			// One commit for both patches (review fix, task E1): two separate
			// `mutate` calls could quota-fail on the second and strand the
			// metadata patch without the chart edit it was submitted with.
			await updateSongAndChart({
				songId: song.id,
				songPatch: buildSongUpdatePatch(form),
				chartId: chart.id,
				chartPatch: buildChartUpdatePatch(parseState.doc)
			});
			await goto(resolve('/(app)/song/[songId]', { songId: song.id }));
		} catch (err) {
			saveError =
				err instanceof StorageQuotaError ? err.message : 'Could not save — please try again.';
		} finally {
			saving = false;
		}
	}

	function cancel() {
		if (!song) return;
		goto(resolve('/(app)/song/[songId]', { songId: song.id }));
	}
</script>

<svelte:head>
	<title>Edit — Lyre</title>
</svelte:head>

<TopBar title="Edit" />

{#if notFound}
	<EmptyState title="Song not found" description="It may have been deleted." />
{:else if !song || !chart || !form}
	<p class="px-4 py-8 text-[15px] text-ink-2">Loading…</p>
{:else}
	<div class="flex flex-col gap-6 px-4 pb-8">
		<div class="flex rounded-xl border border-line p-1" role="tablist" aria-label="Editor mode">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'edit'}
				class="flex-1 rounded-lg py-1.5 text-[13px] font-semibold {tab === 'edit'
					? 'bg-ink text-bg'
					: 'text-ink-2'}"
				onclick={() => (tab = 'edit')}
			>
				Edit
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'preview'}
				class="flex-1 rounded-lg py-1.5 text-[13px] font-semibold {tab === 'preview'
					? 'bg-ink text-bg'
					: 'text-ink-2'}"
				onclick={() => (tab = 'preview')}
			>
				Preview
			</button>
		</div>

		{#if tab === 'edit'}
			<label class="flex flex-col gap-1.5">
				<span class="text-[13px] font-semibold text-ink-2">ChordPro source</span>
				<textarea
					bind:value={rawText}
					rows="14"
					spellcheck="false"
					class="chord w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] whitespace-pre text-ink focus:outline-none"
				></textarea>
			</label>
			{#if parseState?.isEmpty}
				<p class="text-[13px] text-ink-2">Couldn't find chords — check the format.</p>
			{/if}
		{:else if parseState && !parseState.isEmpty}
			<div class="rounded-xl border border-line bg-surface px-3 py-3">
				<ChartPreview doc={parseState.doc} shapeKey={form.sourceKey} highlightUnknownChords />
			</div>
		{:else}
			<p class="px-1 text-[13px] text-ink-2">Nothing to preview yet.</p>
		{/if}

		<MetadataForm values={form} onchange={onMetadataChange} {patternChip} />

		{#if saveError}
			<p class="text-[13px] text-ink-2">{saveError}</p>
		{/if}

		<div class="flex gap-2">
			<Button size="lg" class="flex-1" disabled={!canSave} onclick={save}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button size="lg" variant="ghost" onclick={cancel}>Cancel</Button>
		</div>
	</div>
{/if}
