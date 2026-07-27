<script lang="ts">
	import TabBar from '$lib/ui/TabBar.svelte';

	let { children } = $props();
</script>

<!-- docs/design.md: mobile-first, single column, max-width 640px centered. -->
<div class="mx-auto min-h-dvh max-w-[640px] bg-bg pb-[calc(4rem+var(--safe-bottom))]">
	{@render children()}
</div>

<TabBar />
