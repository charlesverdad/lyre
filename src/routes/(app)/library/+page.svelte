<script lang="ts">
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import TopBar from '$lib/ui/TopBar.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	// Placeholder — real list/search/sort lands in task B1
	// (src/routes/(app)/library/).
</script>

<svelte:head>
	<title>Library — Lyre</title>
</svelte:head>

<TopBar title="Library" />
<EmptyState
	icon={LibraryBig}
	title="No songs yet"
	description="Add your first song to build your library."
/>
