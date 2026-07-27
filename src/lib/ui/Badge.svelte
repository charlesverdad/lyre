<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<!-- e.g. "Capo 2 · G shapes · sounds in A" — pill, hairline border, no fill. -->
<span
	class="inline-flex items-center rounded-full border border-line px-3 py-1 text-[13px] text-ink-2 {className}"
>
	{@render children()}
</span>
