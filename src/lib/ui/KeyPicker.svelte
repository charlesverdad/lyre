<script lang="ts">
	/** Picker over the 12 canonical keys (task B2), for the add/edit metadata form. */
	import { allCanonicalKeyNames } from '$lib/theory/notes';

	interface Props {
		value: string;
		onchange: (key: string) => void;
		class?: string;
	}

	let { value, onchange, class: className = '' }: Props = $props();
	const keys = allCanonicalKeyNames();
</script>

<div class="flex flex-wrap gap-1.5 {className}" role="radiogroup" aria-label="Key">
	{#each keys as key (key)}
		<button
			type="button"
			role="radio"
			aria-checked={value === key}
			class="chord min-w-10 rounded-lg border px-2.5 py-1.5 text-[13px] transition-opacity duration-150 ease-out {value ===
			key
				? 'border-ink bg-ink text-bg'
				: 'border-line bg-transparent text-ink'}"
			onclick={() => onchange(key)}
		>
			{key}
		</button>
	{/each}
</div>
