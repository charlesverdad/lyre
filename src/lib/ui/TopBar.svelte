<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		actions?: Snippet;
		class?: string;
	}

	let { title, actions, class: className = '' }: Props = $props();
</script>

<!-- docs/design.md: "large title on top (28/700)". -->
<header
	class="flex items-center justify-between gap-3 px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3 {className}"
>
	<h1 class="truncate text-[28px] font-bold text-ink">{title}</h1>
	{#if actions}
		<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
	{/if}
</header>
