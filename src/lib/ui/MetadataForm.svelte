<script lang="ts">
	/**
	 * Title/authors/key/tempo/CCLI form for the add/edit screens (task B2,
	 * mvp-spec.md F2: "title (required), authors, original key (required —
	 * inferred, editable), tempo, CCLI# (optional)").
	 */
	import type { MetadataFormValues } from '$lib/addedit/songRecord';
	import Badge from './Badge.svelte';
	import KeyPicker from './KeyPicker.svelte';

	interface Props {
		values: MetadataFormValues;
		onchange: (values: MetadataFormValues) => void;
		/** "Capo 1 · G shapes · sounds in Ab" style chip when the paste's header carried a pattern. */
		patternChip?: string;
		class?: string;
	}

	let { values, onchange, patternChip, class: className = '' }: Props = $props();

	function set<K extends keyof MetadataFormValues>(key: K, value: MetadataFormValues[K]) {
		onchange({ ...values, [key]: value });
	}

	const fieldClass =
		'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none';
	const labelClass = 'text-[13px] font-semibold text-ink-2';
</script>

<div class="flex flex-col gap-4 {className}">
	<label class="flex flex-col gap-1.5">
		<span class={labelClass}>Title *</span>
		<input
			type="text"
			class={fieldClass}
			placeholder="Song title"
			value={values.title}
			oninput={(e) => set('title', e.currentTarget.value)}
			required
		/>
	</label>

	<label class="flex flex-col gap-1.5">
		<span class={labelClass}>Authors</span>
		<input
			type="text"
			class={fieldClass}
			placeholder="Comma-separated, e.g. John Newton, Isaac Watts"
			value={values.authorsInput}
			oninput={(e) => set('authorsInput', e.currentTarget.value)}
		/>
	</label>

	<div class="flex flex-col gap-1.5">
		<span class={labelClass}>Key *</span>
		<KeyPicker value={values.sourceKey} onchange={(key) => set('sourceKey', key)} />
		{#if patternChip}
			<Badge class="mt-1 w-fit">{patternChip}</Badge>
		{/if}
	</div>

	<div class="flex gap-3">
		<label class="flex flex-1 flex-col gap-1.5">
			<span class={labelClass}>Tempo (BPM)</span>
			<input
				type="number"
				inputmode="numeric"
				min="1"
				class={fieldClass}
				placeholder="—"
				value={values.tempoInput}
				oninput={(e) => set('tempoInput', e.currentTarget.value)}
			/>
		</label>
		<label class="flex flex-1 flex-col gap-1.5">
			<span class={labelClass}>CCLI#</span>
			<input
				type="text"
				inputmode="numeric"
				class={fieldClass}
				placeholder="—"
				value={values.ccliNumber}
				oninput={(e) => set('ccliNumber', e.currentTarget.value)}
			/>
		</label>
	</div>
</div>
