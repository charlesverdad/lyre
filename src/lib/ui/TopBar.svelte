<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** Optional leading affordance before the title, e.g. a back button (task E3, collection screen). */
		leading?: Snippet;
		actions?: Snippet;
		class?: string;
	}

	let { title, leading, actions, class: className = '' }: Props = $props();
</script>

<!-- docs/design.md: "large title on top (28/700)". -->
<header
	class="flex items-center justify-between gap-3 px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3 {className}"
>
	<div class="flex min-w-0 items-center gap-2">
		{#if leading}
			<div class="flex shrink-0 items-center">{@render leading()}</div>
		{/if}
		<h1 class="truncate text-[28px] font-bold text-ink">{title}</h1>
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
	{/if}
</header>
