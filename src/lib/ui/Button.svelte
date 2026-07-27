<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'ghost' | 'destructive';
	type Size = 'sm' | 'md' | 'lg';

	interface Props extends Omit<HTMLButtonAttributes, 'class'> {
		variant?: Variant;
		size?: Size;
		class?: string;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	// docs/design.md "Type": sizes 13/15/17, weights 400/600/700.
	const sizeClasses: Record<Size, string> = {
		sm: 'text-[13px] px-3 py-1.5 rounded-lg gap-1',
		md: 'text-[15px] px-4 py-2.5 rounded-xl gap-1.5',
		lg: 'text-[17px] px-5 py-3 rounded-xl gap-2'
	};

	// Primary = solid ink-on-bg inversion. Ghost = outline only. Destructive =
	// weight/copy carries the intent, never a color (see docs/design.md).
	const variantClasses: Record<Variant, string> = {
		primary: 'border border-ink bg-ink font-semibold text-bg',
		ghost: 'border border-line bg-transparent font-normal text-ink',
		destructive: 'border border-line bg-transparent font-semibold text-ink'
	};
</script>

<button
	{type}
	class="inline-flex items-center justify-center whitespace-nowrap transition-opacity duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 {sizeClasses[
		size
	]} {variantClasses[variant]} {className}"
	{...rest}
>
	{@render children()}
</button>
