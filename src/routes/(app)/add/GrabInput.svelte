<script lang="ts">
	/**
	 * "Grab from URL" input (mvp-spec.md F2's grab flow, task C1). Wraps
	 * `src/lib/grab`'s `grabUrl`/`grabFromHtml`: a successful grab is handed
	 * up to the add page via `ongrabbed` to prefill the shared paste-flow
	 * state (same `rawText`/`form`); failures route to per-reason copy, with
	 * `cors-or-network` auto-opening the guided-paste sheet (the only
	 * failure mode a paste can actually fix).
	 */
	import Link from '@lucide/svelte/icons/link';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import {
		grabFromHtml,
		grabUrl,
		safeHttpUrl,
		type GrabFailureReason,
		type GrabResult
	} from '$lib/grab';

	interface Props {
		ongrabbed: (result: GrabResult) => void;
	}

	let { ongrabbed }: Props = $props();

	let url = $state('');
	let grabbing = $state(false);
	let errorReason = $state<GrabFailureReason | undefined>();
	let errorDetail = $state<string | undefined>();

	let pasteSheetOpen = $state(false);
	let pastedHtml = $state('');
	let pasteError = $state<string | undefined>();

	function httpStatusMessage(detail: string | undefined): string {
		const code = detail?.match(/HTTP (\d+)/)?.[1];
		return code
			? `Page not found (HTTP ${code}) — check the link.`
			: 'Page not found — check the link.';
	}

	function messageFor(reason: GrabFailureReason, detail: string | undefined): string {
		switch (reason) {
			case 'http-error':
				return httpStatusMessage(detail);
			case 'unsupported-site':
				return detail ?? 'This site is not supported for grabbing.';
			case 'no-chart-found':
				return "Couldn't find a chart on that page — check the link, or paste the chart text below.";
			case 'cors-or-network':
				return "Couldn't fetch that page automatically — paste it in below instead.";
			case 'invalid-url':
				return "That doesn't look like a web address — paste an http(s) link.";
		}
	}

	function resetError() {
		errorReason = undefined;
		errorDetail = undefined;
	}

	function accept(result: GrabResult) {
		resetError();
		pasteSheetOpen = false;
		pastedHtml = '';
		pasteError = undefined;
		ongrabbed(result);
	}

	async function grab() {
		const trimmed = url.trim();
		if (!trimmed || grabbing) return;
		grabbing = true;
		resetError();
		try {
			const outcome = await grabUrl(trimmed);
			if (outcome.ok) {
				accept(outcome.result);
				return;
			}
			errorReason = outcome.reason;
			errorDetail = outcome.detail;
			if (outcome.reason === 'cors-or-network') {
				pasteSheetOpen = true;
			}
		} finally {
			grabbing = false;
		}
	}

	function openPasteSheet() {
		pasteError = undefined;
		pasteSheetOpen = true;
	}

	function submitPaste() {
		const outcome = grabFromHtml(pastedHtml, url.trim());
		if (outcome.ok) {
			accept(outcome.result);
			return;
		}
		pasteError = messageFor(outcome.reason, outcome.detail);
	}
</script>

<div class="flex flex-col gap-1.5">
	<span class="text-[13px] font-semibold text-ink-2">Grab from URL</span>
	<form
		class="flex items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			grab();
		}}
	>
		<div class="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3">
			<Link class="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
			<input
				type="url"
				bind:value={url}
				placeholder="Paste a song URL, e.g. https://pnwchords.com/…"
				class="w-full min-w-0 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
			/>
		</div>
		<Button type="submit" size="md" disabled={!url.trim() || grabbing}>
			{grabbing ? 'Grabbing…' : 'Grab'}
		</Button>
	</form>

	{#if errorReason}
		<p class="text-[13px] text-ink-2">{messageFor(errorReason, errorDetail)}</p>
		{#if errorReason !== 'cors-or-network'}
			<button
				type="button"
				class="w-fit text-[13px] font-semibold text-ink underline underline-offset-2"
				onclick={openPasteSheet}
			>
				Paste the page instead
			</button>
		{/if}
	{/if}
</div>

<Sheet bind:open={pasteSheetOpen} title="Paste the page">
	<div class="flex flex-col gap-4 pb-2">
		<p class="text-[15px] text-ink-2">
			Open the page in your browser → select all → copy → paste the page source or the chart text
			below.
		</p>
		{#if safeHttpUrl(url.trim())}
			<a
				href={safeHttpUrl(url.trim())}
				target="_blank"
				rel="noopener noreferrer"
				class="flex w-fit items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-2"
			>
				Open the page
				<ExternalLink class="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
			</a>
		{/if}
		<textarea
			bind:value={pastedHtml}
			rows="10"
			placeholder="Paste the page source or the chart text here"
			class="chord w-full resize-y rounded-xl border border-line bg-bg px-3 py-2.5 text-[13px] whitespace-pre text-ink placeholder:font-sans placeholder:whitespace-pre-line placeholder:text-ink-3 focus:outline-none"
		></textarea>
		{#if pasteError}
			<p class="text-[13px] text-ink-2">{pasteError}</p>
		{/if}
		<Button size="lg" disabled={!pastedHtml.trim()} onclick={submitPaste}>Use this text</Button>
	</div>
</Sheet>
