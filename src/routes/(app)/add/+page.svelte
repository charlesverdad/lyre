<script lang="ts">
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import TopBar from '$lib/ui/TopBar.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	// Placeholder — real grab/paste flow lands in task B2
	// (src/routes/(app)/add/).
</script>

<svelte:head>
	<title>Add — Lyre</title>
</svelte:head>

<TopBar title="Add" />
<EmptyState
	icon={CirclePlus}
	title="Add a song"
	description="Grab a chart from a URL or paste one in — coming soon."
/>
