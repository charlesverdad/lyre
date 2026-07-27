<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initTheme } from '$lib/ui/theme.svelte';

	let { children } = $props();

	// Sync reactive theme state (used by the settings page toggle) with the
	// choice the blocking inline script in app.html already applied to <html>.
	$effect(() => {
		initTheme();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
