<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Bindable — set to true to open, false to close. */
		open?: boolean;
		title?: string;
		children: Snippet;
		onclose?: () => void;
		class?: string;
	}

	let {
		open = $bindable(false),
		title,
		children,
		onclose,
		class: className = ''
	}: Props = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	// Keep the native <dialog> element (top-layer, native Escape handling, focus
	// trap) in sync with the `open` prop.
	$effect(() => {
		const dialog = dialogEl;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// Body scroll lock while the sheet is open — <dialog> alone doesn't
	// reliably prevent background scroll on all platforms (notably iOS).
	$effect(() => {
		if (typeof document === 'undefined' || !open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});

	function handleClose() {
		open = false;
		onclose?.();
	}

	// Clicking the scrim (the ::backdrop-covered dialog element itself, not
	// its content box) closes the sheet.
	function handleClick(event: MouseEvent) {
		if (event.target === dialogEl) {
			dialogEl?.close();
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={handleClose}
	onclick={handleClick}
	aria-label={title}
	class="sheet m-0 max-h-[85dvh] w-full max-w-[640px] rounded-t-2xl border-0 bg-surface p-0 {className}"
>
	<div class="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line" aria-hidden="true"></div>
	{#if title}
		<h2 class="px-4 pt-3 text-[17px] font-semibold text-ink">{title}</h2>
	{/if}
	<div class="overflow-y-auto px-4 pt-2 pb-[calc(1rem+var(--safe-bottom))]">
		{@render children()}
	</div>
</dialog>

<style>
	/*
	 * Gated on [open]: the UA stylesheet hides a closed <dialog> via
	 * `dialog:not([open]) { display: none }`, which has the same specificity
	 * as an unqualified `dialog.sheet` rule — an unconditional `display`
	 * here would win the cascade by source order and show the sheet even
	 * while closed.
	 */
	dialog.sheet[open] {
		position: fixed;
		inset-inline: 0;
		/*
		 * The UA stylesheet's `dialog:modal` rule sets *both*
		 * `inset-block-start: 0` and `inset-block-end: 0` with
		 * `margin: auto` to center a modal dialog. This component's `m-0`
		 * zeros the margins, and without resetting `inset-block-start` back
		 * to `auto` here, both insets stay at 0 with 0 margin — the box
		 * resolves against the *top* of the viewport instead of the bottom,
		 * even though `inset-block-end: 0` below looks like it should be
		 * enough on its own. Anchoring to the bottom (docs/design.md: sheets
		 * slide from the bottom) needs exactly one inset pinned and the
		 * other freed.
		 */
		inset-block-start: auto;
		inset-block-end: 0;
		margin-inline: auto;
		display: flex;
		flex-direction: column;
		animation: sheet-slide-in 180ms ease-out;
	}

	dialog.sheet::backdrop {
		background: rgb(0 0 0 / 0.4);
	}

	@keyframes sheet-slide-in {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		dialog.sheet[open] {
			animation: none;
		}
	}
</style>
