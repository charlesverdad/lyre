<script lang="ts">
	/**
	 * "Grab from URL" input (mvp-spec.md F2's grab flow, task C1). A thin view
	 * over `$lib/grab`'s `GrabController` (task D1), which owns the actual
	 * `grabUrl`/`grabFromHtml` outcome handling: a successful grab is handed
	 * up to the add page via `ongrabbed` to prefill the shared paste-flow
	 * state (same `rawText`/`form`); failures route to per-reason copy, with
	 * `cors-or-network` auto-opening the guided-paste sheet (the only
	 * failure mode a paste can actually fix). The controller instance is
	 * exposed via `controller` so the add page's main paste textarea can
	 * trigger the exact same flow when a bare URL is pasted there instead of
	 * the chart text.
	 */
	import Link from '@lucide/svelte/icons/link';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { GrabController, messageFor, safeHttpUrl, type GrabResult } from '$lib/grab';

	interface Props {
		ongrabbed: (result: GrabResult) => void;
		/** Called once with the controller instance so a parent can drive `grab()` from elsewhere (bare-URL paste). */
		oncontroller?: (controller: GrabController) => void;
	}

	let { ongrabbed, oncontroller }: Props = $props();

	const controller = new GrabController((result) => ongrabbed(result));
	$effect(() => {
		oncontroller?.(controller);
	});
</script>

<div class="flex flex-col gap-1.5">
	<span class="text-[13px] font-semibold text-ink-2">Grab from URL</span>
	<form
		class="flex items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			controller.grab();
		}}
	>
		<div class="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
			<Link class="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
			<input
				type="url"
				bind:value={controller.url}
				placeholder="Paste a song URL, e.g. https://pnwchords.com/…"
				class="w-full min-w-0 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
			/>
		</div>
		<Button type="submit" size="md" disabled={!controller.url.trim() || controller.grabbing}>
			{controller.grabbing ? 'Grabbing…' : 'Grab'}
		</Button>
	</form>

	{#if controller.errorReason}
		<p class="text-[13px] text-ink-2">
			{messageFor(controller.errorReason, controller.errorDetail)}
		</p>
		{#if controller.errorReason !== 'cors-or-network'}
			<button
				type="button"
				class="w-fit text-[13px] font-semibold text-ink underline underline-offset-2"
				onclick={() => controller.openPasteSheet()}
			>
				Paste the page instead
			</button>
		{/if}
	{/if}
</div>

<Sheet bind:open={controller.pasteSheetOpen} title="Paste the page">
	<div class="flex flex-col gap-4 pb-2">
		<p class="text-[15px] text-ink-2">
			Open the page in your browser → select all → copy → paste the page source or the chart text
			below.
		</p>
		{#if safeHttpUrl(controller.url.trim())}
			<a
				href={safeHttpUrl(controller.url.trim())}
				target="_blank"
				rel="noopener noreferrer"
				class="flex w-fit items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-2"
			>
				Open the page
				<ExternalLink class="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
			</a>
		{/if}
		<textarea
			bind:value={controller.pastedHtml}
			rows="10"
			placeholder="Paste the page source or the chart text here"
			class="chord w-full resize-y rounded-xl border border-line bg-bg px-3 py-2.5 text-[13px] whitespace-pre text-ink placeholder:font-sans placeholder:whitespace-pre-line placeholder:text-ink-3 focus:outline-none"
		></textarea>
		{#if controller.pasteError}
			<p class="text-[13px] text-ink-2">{controller.pasteError}</p>
		{/if}
		<Button
			size="lg"
			disabled={!controller.pastedHtml.trim()}
			onclick={() => controller.submitPaste()}
		>
			Use this text
		</Button>
	</div>
</Sheet>
