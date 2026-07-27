<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/ui/Button.svelte';
	import ChartPreview from '$lib/ui/ChartPreview.svelte';
	import MetadataForm from '$lib/ui/MetadataForm.svelte';
	import TopBar from '$lib/ui/TopBar.svelte';
	import { createSong } from '$lib/db/repo';
	import {
		buildCreateSongInput,
		canSaveChart,
		deriveChartParseState,
		emptyMetadataForm,
		type MetadataFormValues
	} from '$lib/addedit';
	import { formatPatternSummary } from '$lib/library/format';
	import GrabPlaceholder from './GrabPlaceholder.svelte';

	let rawText = $state('');
	let form = $state<MetadataFormValues>(emptyMetadataForm());
	// True once the user has hand-picked a key different from the inferred
	// one — after that, the picker stops following re-parses of `rawText`.
	let keyManuallySet = $state(false);
	let saving = $state(false);

	// `undefined` while the paste box is empty, so the empty-state hint only
	// shows once the user has actually typed/pasted something.
	let parseState = $derived.by(() =>
		rawText.trim()
			? deriveChartParseState(rawText, keyManuallySet ? form.sourceKey : undefined)
			: undefined
	);

	// Re-sync the key picker + pattern-derived fields whenever a *new* parse
	// happens, unless the user already overrode the key by hand.
	$effect(() => {
		if (!parseState || keyManuallySet) return;
		form = { ...form, sourceKey: parseState.sourceKey };
	});

	let patternChip = $derived(
		parseState?.initialPattern ? formatPatternSummary(parseState.initialPattern) : undefined
	);

	let canSave = $derived(canSaveChart(form.title, parseState) && !saving);

	function onMetadataChange(next: MetadataFormValues) {
		if (next.sourceKey !== form.sourceKey) keyManuallySet = true;
		form = next;
	}

	async function save() {
		if (!parseState || !canSave) return;
		saving = true;
		try {
			const input = buildCreateSongInput(form, parseState.doc, parseState.initialPattern);
			const result = await createSong(input);
			// /song/[id] (task B3) doesn't exist yet, so $app/paths#resolve can't
			// type-check it — plain goto() is the documented escape hatch
			// (see src/routes/(app)/library/+page.svelte).
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`/song/${result.song.id}`);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Add — Lyre</title>
</svelte:head>

<TopBar title="Add" />

<div class="flex flex-col gap-6 px-4 pb-8">
	<GrabPlaceholder />

	<div class="flex items-center gap-3">
		<div class="h-px flex-1 bg-line"></div>
		<span class="text-[13px] text-ink-3">or paste</span>
		<div class="h-px flex-1 bg-line"></div>
	</div>

	<label class="flex flex-col gap-1.5">
		<span class="text-[13px] font-semibold text-ink-2">Paste a chart</span>
		<textarea
			bind:value={rawText}
			rows="10"
			placeholder="Paste a chart — ChordPro or chords-above-lyrics, e.g.

G            C
Amazing grace, how sweet the sound"
			class="chord w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] whitespace-pre text-ink placeholder:font-sans placeholder:whitespace-pre-line placeholder:text-ink-3 focus:outline-none"
		></textarea>
	</label>

	{#if rawText.trim() && parseState?.isEmpty}
		<p class="text-[13px] text-ink-2">Couldn't find chords — check the format.</p>
	{/if}

	{#if parseState && !parseState.isEmpty}
		<div class="flex flex-col gap-2">
			<span class="text-[13px] font-semibold text-ink-2">Preview</span>
			<div class="rounded-xl border border-line bg-surface px-3 py-3">
				<ChartPreview doc={parseState.doc} shapeKey={form.sourceKey} />
			</div>
		</div>

		<MetadataForm values={form} onchange={onMetadataChange} {patternChip} />

		<Button size="lg" disabled={!canSave} onclick={save}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
	{/if}
</div>
