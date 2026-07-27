<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		icon?: Component<{ class?: string; strokeWidth?: number; [key: string]: unknown }>;
		action?: Snippet;
		class?: string;
	}

	let { title, description, icon: Icon, action, class: className = '' }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center {className}">
	{#if Icon}
		<Icon class="h-8 w-8 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
	{/if}
	<p class="text-[17px] font-semibold text-ink">{title}</p>
	{#if description}
		<p class="max-w-xs text-[15px] text-ink-2">{description}</p>
	{/if}
	{#if action}
		<div class="mt-2">{@render action()}</div>
	{/if}
</div>
