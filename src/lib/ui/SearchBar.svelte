<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		value?: string;
		placeholder?: string;
		class?: string;
	}

	let { value = $bindable(''), placeholder = 'Search', class: className = '' }: Props = $props();
</script>

<div class="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 {className}">
	<Search class="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
	<input
		type="search"
		bind:value
		{placeholder}
		class="w-full min-w-0 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
	/>
	{#if value}
		<button
			type="button"
			class="flex shrink-0 items-center text-ink-3"
			aria-label="Clear search"
			onclick={() => (value = '')}
		>
			<X class="h-4 w-4" strokeWidth={1.5} />
		</button>
	{/if}
</div>
