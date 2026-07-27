<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import Settings from '@lucide/svelte/icons/settings';

	// docs/design.md: bottom tab bar (Library · Add · Settings), 1px top
	// hairline, thin-stroke icons; active tab = filled/ink, inactive = ink-3.
	const tabs = [
		{ href: '/library', label: 'Library', icon: LibraryBig },
		{ href: '/add', label: 'Add', icon: CirclePlus },
		{ href: '/settings', label: 'Settings', icon: Settings }
	] as const;

	interface Props {
		/** Fixed to the viewport bottom (default). Set false to embed inline, e.g. in the /dev/ui styleguide. */
		sticky?: boolean;
	}

	let { sticky = true }: Props = $props();
</script>

<nav
	class="{sticky
		? 'fixed inset-x-0 bottom-0 z-40'
		: 'relative'} border-t border-line bg-bg pb-[var(--safe-bottom)]"
	aria-label="Primary"
>
	<div class="mx-auto flex max-w-[640px] items-stretch justify-around">
		{#each tabs as tab (tab.href)}
			{@const active = page.url.pathname.startsWith(tab.href)}
			<a
				href={resolve(tab.href)}
				aria-current={active ? 'page' : undefined}
				class="flex flex-1 flex-col items-center gap-1 py-2 text-[13px]"
			>
				<tab.icon
					class={active ? 'text-ink' : 'text-ink-3'}
					strokeWidth={active ? 2 : 1.5}
					fill={active ? 'currentColor' : 'none'}
					aria-hidden="true"
				/>
				<span class={active ? 'font-semibold text-ink' : 'text-ink-3'}>{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>
