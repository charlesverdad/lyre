<script lang="ts">
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import ListItem from '$lib/ui/ListItem.svelte';
	import SearchBar from '$lib/ui/SearchBar.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import TabBar from '$lib/ui/TabBar.svelte';
	import TopBar from '$lib/ui/TopBar.svelte';
	import { theme, setTheme, type ThemeMode } from '$lib/ui/theme.svelte';

	// Living styleguide — not part of the app shell (excluded from the tab
	// bar / (app) route group). Renders every src/lib/ui component in both
	// themes side by side, forced via a local `data-theme` attribute on each
	// panel (see the non-`:root`-scoped rules in src/routes/layout.css).

	let searchValue = $state('');
	let sheetOpen = $state(false);

	const modes: { value: ThemeMode; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];
</script>

<svelte:head>
	<title>UI styleguide — Lyre</title>
</svelte:head>

<div class="min-h-dvh bg-bg pb-16 text-ink">
	<header class="border-b border-line px-4 py-4">
		<h1 class="text-[22px] font-bold text-ink">/dev/ui — component styleguide</h1>
		<p class="mt-1 text-[13px] text-ink-2">
			Every src/lib/ui component, rendered in both themes. Panels below are pinned to light/dark
			regardless of the page theme.
		</p>

		<div class="mt-3 flex gap-2" role="radiogroup" aria-label="Page theme">
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
	</header>

	<div class="grid grid-cols-1 gap-0 md:grid-cols-2">
		{#each [{ mode: 'light', label: 'Light' }, { mode: 'dark', label: 'Dark' }] as panel (panel.mode)}
			<div data-theme={panel.mode} class="min-h-full space-y-8 bg-bg p-4 text-ink">
				<p class="text-[13px] font-semibold text-ink-2 uppercase">{panel.label}</p>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">Type scale</h2>
					<p class="text-[13px] text-ink">13 — placeholders, metadata</p>
					<p class="text-[15px] text-ink">15 — body, list rows</p>
					<p class="text-[17px] text-ink">17 — titles, play-mode base</p>
					<p class="text-[22px] font-semibold text-ink">22 — section headers</p>
					<p class="text-[28px] font-bold text-ink">28 — large title</p>
					<p class="chord text-[17px] text-ink">G D/F# Em7 Cadd9</p>
				</section>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">Button</h2>
					<div class="flex flex-wrap items-center gap-2">
						<Button variant="primary" size="sm">Primary sm</Button>
						<Button variant="primary" size="md">Primary md</Button>
						<Button variant="primary" size="lg">Primary lg</Button>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<Button variant="ghost" size="md">Ghost</Button>
						<Button variant="destructive" size="md">Delete song</Button>
						<Button variant="primary" size="md" disabled>Disabled</Button>
					</div>
				</section>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">Badge</h2>
					<Badge>Capo 2 · G shapes · sounds in A</Badge>
				</section>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">SearchBar</h2>
					<SearchBar bind:value={searchValue} placeholder="Search library" />
				</section>

				<section class="space-y-0 border-y border-line">
					<h2 class="py-2 text-[15px] font-semibold text-ink">ListItem</h2>
					<ListItem title="Goodness of God" subtitle="Capo 2 · G shapes · sounds in A" />
					<ListItem title="10,000 Reasons" subtitle="No capo · sounds in C" onclick={() => {}}>
						{#snippet trailing()}
							<span class="text-ink-3">›</span>
						{/snippet}
					</ListItem>
				</section>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">TopBar</h2>
					<div class="border border-line">
						<TopBar title="Library">
							{#snippet actions()}
								<Button variant="ghost" size="sm">Sort</Button>
							{/snippet}
						</TopBar>
					</div>
				</section>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">EmptyState</h2>
					<div class="border border-line">
						<EmptyState
							icon={LibraryBig}
							title="No songs yet"
							description="Add your first song to build your library."
						/>
					</div>
				</section>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">Sheet</h2>
					<Button variant="ghost" size="md" onclick={() => (sheetOpen = true)}>Open sheet</Button>
				</section>

				<section class="space-y-2">
					<h2 class="text-[15px] font-semibold text-ink">TabBar</h2>
					<div class="border border-line">
						<TabBar sticky={false} />
					</div>
				</section>
			</div>
		{/each}
	</div>
</div>

<Sheet bind:open={sheetOpen} title="Transpose">
	<p class="pb-4 text-[15px] text-ink-2">Sheet content — scrim tap or Escape closes this.</p>
	<Button variant="primary" size="md" onclick={() => (sheetOpen = false)}>Done</Button>
</Sheet>
