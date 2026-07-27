<script lang="ts">
	/**
	 * Disabled "Grab from URL" input (mvp-spec.md F2's grab flow) — task B4
	 * builds the actual grabber (`src/lib/grab`) and wires this up; kept as
	 * its own tiny component so that wiring is a small diff later, not a
	 * rewrite of the add page.
	 */
	import Link from '@lucide/svelte/icons/link';
</script>

<div class="flex flex-col gap-1.5">
	<span class="text-[13px] font-semibold text-ink-2">Grab from URL</span>
	<div
		class="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 opacity-60"
	>
		<Link class="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
		<input
			type="url"
			disabled
			placeholder="Paste a song URL — coming in this build"
			class="w-full min-w-0 bg-transparent text-[15px] text-ink-3 placeholder:text-ink-3 focus:outline-none"
		/>
	</div>
</div>
