<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { initTheme } from '$lib/ui/theme.svelte';
	import { requestPersistentStorage } from '$lib/db/store';

	let { children } = $props();

	// Sync reactive theme state (used by the settings page toggle) with the
	// choice the blocking inline script in app.html already applied to <html>.
	$effect(() => {
		initTheme();
	});

	// Register the offline service worker (task C1, src/service-worker.ts).
	// SvelteKit doesn't register it for you — see
	// https://svelte.dev/docs/kit/service-workers.
	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register(`${base}/service-worker.js`, { type: 'module' });
		}
		// Best-effort, never-blocking ask that the browser not evict this
		// origin's storage under pressure (task E1, docs/PLAN-v0.3.md §E1).
		requestPersistentStorage();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
