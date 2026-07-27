<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		trailing?: Snippet;
		onclick?: () => void;
		class?: string;
	}

	let { title, subtitle, trailing, onclick, class: className = '' }: Props = $props();
</script>

<!--
	docs/design.md: "list rows 56px with hairline separators, full-bleed edges
	(16px inset content)". Renders as a <button> when interactive, otherwise a
	plain row.
-->
<svelte:element
	this={onclick ? 'button' : 'div'}
	type={onclick ? 'button' : undefined}
	role={onclick ? 'button' : undefined}
	{onclick}
	class="flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2 text-left {className}"
>
	<span class="min-w-0 flex-1">
		<span class="block truncate text-[17px] text-ink">{title}</span>
		{#if subtitle}
			<span class="mt-0.5 block truncate text-[13px] text-ink-2">{subtitle}</span>
		{/if}
	</span>
	{#if trailing}
		<span class="flex shrink-0 items-center">{@render trailing()}</span>
	{/if}
</svelte:element>
