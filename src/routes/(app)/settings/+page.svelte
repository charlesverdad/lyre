<script lang="ts">
	import TopBar from '$lib/ui/TopBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { theme, setTheme, type ThemeMode } from '$lib/ui/theme.svelte';

	// Real (small) feature: theme toggle, proving the token-override path
	// (data-theme on <html>, see src/routes/layout.css). Everything else on
	// this screen lands in later B-tasks.
	const modes: { value: ThemeMode; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];
</script>

<svelte:head>
	<title>Settings — Lyre</title>
</svelte:head>

<TopBar title="Settings" />

<section class="px-4">
	<h2 class="mb-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Appearance</h2>
	<div class="flex gap-2" role="radiogroup" aria-label="Theme">
		{#each modes as m (m.value)}
			<Button
				variant={theme.mode === m.value ? 'primary' : 'ghost'}
				size="sm"
				aria-pressed={theme.mode === m.value}
				onclick={() => setTheme(m.value)}
			>
				{m.label}
			</Button>
		{/each}
	</div>
</section>
