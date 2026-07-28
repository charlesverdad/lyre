<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/ui/Button.svelte';
	import ChartPreview from '$lib/ui/ChartPreview.svelte';
	import MetadataForm from '$lib/ui/MetadataForm.svelte';
	import TopBar from '$lib/ui/TopBar.svelte';
	import { createSong } from '$lib/db/repo';
	import { StorageQuotaError } from '$lib/db/store';
	import {
		buildCreateSongInput,
		canSaveChart,
		consumeShareTarget,
		deriveChartParseState,
		emptyMetadataForm,
		type MetadataFormValues
	} from '$lib/addedit';
	import {
		formatSourceAttribution,
		safeHttpUrl,
		shouldAutoGrabPastedUrl,
		type GrabController,
		type GrabResult
	} from '$lib/grab';
	import { formatPatternSummary } from '$lib/library/format';
	import GrabInput from './GrabInput.svelte';

	interface GrabMeta {
		sourceUrl: string;
		sourceSite: string;
		fetchedAt: string;
		rawGrabbedText: string;
		sourceAttribution: string;
	}

	let rawText = $state('');
	let form = $state<MetadataFormValues>(emptyMetadataForm());
	// True once the user has hand-picked a key different from the inferred
	// one — after that, the picker stops following re-parses of `rawText`.
	let keyManuallySet = $state(false);
	let saving = $state(false);
	// StorageQuotaError copy (task E1, docs/PLAN-v0.3.md §E1: never a silent
	// failure or unhandled rejection when a save hits the localStorage quota).
	let saveError = $state<string | undefined>();
	// Set once a grab succeeds; carried through to `createSong` on save so the
	// chart keeps its provenance (mvp-spec.md F2: "save with sourceUrl
	// attribution and the raw text preserved"). Editing the paste box
	// afterwards doesn't clear it — edits are an overlay, the grabbed text
	// stays available as the "original".
	let grabMeta = $state<GrabMeta | undefined>();

	// Set once `GrabInput` mounts (task D1), so the main paste textarea's
	// bare-URL paste handler and the share-target hand-off below can drive
	// the exact same grab flow `GrabInput`'s own URL field uses, instead of
	// duplicating `grabUrl`/`grabFromHtml` outcome handling here.
	let grabController: GrabController | undefined;

	// `undefined` while the paste box is empty, so the empty-state hint only
	// shows once the user has actually typed/pasted something.
	let parseState = $derived.by(() =>
		rawText.trim()
			? deriveChartParseState(rawText, keyManuallySet ? form.sourceKey : undefined)
			: undefined
	);

	// Re-sync the key picker + pattern-derived fields whenever a *new* parse
	// happens, unless the user already overrode the key by hand.
	//
	// The equality guard below is load-bearing, not just an optimization:
	// this effect reads `form` (to spread it) whenever it actually runs past
	// the first guard, which makes `form` one of its reactive dependencies —
	// so *any* later edit to `form` (e.g. typing the title) re-triggers this
	// same effect. Without the `sourceKey` check it would then unconditionally
	// reassign `form` to a new object every time, which re-triggers itself
	// forever and blows Svelte's `effect_update_depth_exceeded` guard (and,
	// short of that crash, would spin the CPU) — silently breaking the whole
	// form the moment a header-derived source key differs from the default
	// and the user starts typing. Bailing once `sourceKey` already matches
	// keeps the dependency but makes the repeat runs no-ops.
	$effect(() => {
		if (!parseState || keyManuallySet) return;
		if (form.sourceKey === parseState.sourceKey) return;
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

	function onGrabbed(result: GrabResult) {
		rawText = result.chartText;
		keyManuallySet = false;
		form = {
			...form,
			title: result.title ?? form.title,
			authorsInput: result.artist ?? form.authorsInput
		};
		grabMeta = {
			sourceUrl: result.sourceUrl,
			sourceSite: result.sourceSite,
			fetchedAt: result.fetchedAt,
			rawGrabbedText: result.chartText,
			sourceAttribution: formatSourceAttribution(result.artist, result.sourceSite)
		};
	}

	/**
	 * The main paste textarea's `onpaste`: when the paste box is still empty
	 * and the clipboard payload is just a bare URL (`shouldAutoGrabPastedUrl`,
	 * `$lib/grab/bareUrl.ts`) — not a chart with a link somewhere in it, and
	 * not a URL pasted over/into text that's already there — treat it as a
	 * grab instead of inserting the URL text into the paste box (mvp-spec.md
	 * F2: "just the URL can be pasted and it would crawl itself"). Runs the
	 * exact same `GrabController` flow as `GrabInput`'s own URL field.
	 *
	 * The empty-box gate matters: without it, pasting a URL while the box
	 * already has chart text in it (mid-edit, or adding a source link)
	 * would `preventDefault()` the paste and silently overwrite the whole
	 * textarea via the grab result instead of just inserting the link.
	 */
	function onPasteRawText(e: ClipboardEvent) {
		const text = e.clipboardData?.getData('text') ?? '';
		if (shouldAutoGrabPastedUrl(rawText, text) && grabController) {
			e.preventDefault();
			grabController.grab(text.trim());
		}
	}

	// PWA share-target hand-off (task D1): `/share` stashes whatever the OS
	// share sheet sent before redirecting here. A shared URL drives the same
	// grab flow as a pasted URL; shared text (some browsers share selected
	// text rather than a link) prefills the paste box, which runs through
	// the same noisy-paste extraction as any other paste.
	onMount(() => {
		const shared = consumeShareTarget();
		if (shared.url) {
			grabController?.grab(shared.url);
		} else if (shared.text) {
			rawText = shared.text;
		}
	});

	async function save() {
		if (!parseState || !canSave) return;
		saving = true;
		saveError = undefined;
		try {
			const input = buildCreateSongInput(form, parseState.doc, parseState.initialPattern);
			if (grabMeta) {
				input.chart.sourceUrl = grabMeta.sourceUrl;
				input.chart.sourceSite = grabMeta.sourceSite;
				input.chart.fetchedAt = grabMeta.fetchedAt;
				input.chart.rawGrabbedText = grabMeta.rawGrabbedText;
				input.chart.sourceAttribution = grabMeta.sourceAttribution;
			}
			const result = await createSong(input);
			await goto(resolve('/(app)/song/[songId]', { songId: result.song.id }));
		} catch (err) {
			saveError =
				err instanceof StorageQuotaError ? err.message : 'Could not save — please try again.';
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
	<GrabInput ongrabbed={onGrabbed} oncontroller={(c) => (grabController = c)} />

	<p class="-mt-4 text-[13px] text-ink-3">
		Tip: install Lyre, then share a song page straight to it (Android).
	</p>

	{#if grabMeta}
		{@const safeUrl = safeHttpUrl(grabMeta.sourceUrl)}
		{#if safeUrl}
			<a
				href={safeUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="-mt-4 w-fit text-[13px] text-ink-2 underline underline-offset-2"
			>
				from {grabMeta.sourceSite} ↗
			</a>
		{:else}
			<span class="-mt-4 w-fit text-[13px] text-ink-2">from {grabMeta.sourceSite}</span>
		{/if}
	{/if}

	<div class="flex items-center gap-3">
		<div class="h-px flex-1 bg-line"></div>
		<span class="text-[13px] text-ink-3">or paste</span>
		<div class="h-px flex-1 bg-line"></div>
	</div>

	<label class="flex flex-col gap-1.5">
		<span class="text-[13px] font-semibold text-ink-2">Paste a chart</span>
		<textarea
			bind:value={rawText}
			onpaste={onPasteRawText}
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

	{#if parseState?.trimmedNoise}
		<p class="text-[13px] text-ink-2">Trimmed page noise — check the preview.</p>
	{/if}

	{#if parseState && !parseState.isEmpty}
		<div class="flex flex-col gap-2">
			<span class="text-[13px] font-semibold text-ink-2">Preview</span>
			<div class="rounded-xl border border-line bg-surface px-3 py-3">
				<ChartPreview doc={parseState.doc} shapeKey={form.sourceKey} />
			</div>
		</div>

		<MetadataForm values={form} onchange={onMetadataChange} {patternChip} />

		{#if saveError}
			<p class="text-[13px] text-ink-2">{saveError}</p>
		{/if}

		<Button size="lg" disabled={!canSave} onclick={save}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
	{/if}
</div>
