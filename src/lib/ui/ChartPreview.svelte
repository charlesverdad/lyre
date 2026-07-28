<script lang="ts">
	/**
	 * Dumb chart renderer for the add/edit screens (task B2, mvp-spec.md F2).
	 * Renders a `ChartDoc` chord-over-lyrics, in a given shape key — nothing
	 * more (no transpose controls, no play-mode chrome). B3's play-mode chart
	 * view is expected to build its own richer renderer; this one is not
	 * meant to be shared with it.
	 *
	 * Since chords are stored key-relative (`degree` above `doc.sourceKey`),
	 * passing a `shapeKey` different from `doc.sourceKey` re-spells the same
	 * chords in that key — that's the whole trick behind pattern rendering
	 * (domain-model.md §1, §3).
	 */
	import { renderChord } from '$lib/theory/chords';
	import type { ChartDoc, Line } from '$lib/theory/types';
	import { isUnknownChord } from '$lib/addedit/chordValidation';

	interface Props {
		doc: ChartDoc;
		shapeKey: string;
		/** Underline unparseable chord tokens (edit flow's live validation). */
		highlightUnknownChords?: boolean;
		class?: string;
	}

	let { doc, shapeKey, highlightUnknownChords = false, class: className = '' }: Props = $props();

	/** Build the chord row text for a line: chord tokens placed at their char index, space-padded. */
	function chordRow(line: Line): { text: string; unknown: boolean }[] {
		if (line.chords.length === 0) return [];
		const sorted = [...line.chords].sort((a, b) => a.index - b.index);
		const cells: { text: string; unknown: boolean }[] = [];
		let cursor = 0;
		for (const { chord, index } of sorted) {
			const pad = Math.max(index - cursor, cells.length === 0 ? 0 : 1);
			if (pad > 0) cells.push({ text: ' '.repeat(pad), unknown: false });
			const rendered = renderChord(chord, shapeKey);
			cells.push({ text: rendered, unknown: isUnknownChord(chord) });
			cursor = index + rendered.length;
		}
		return cells;
	}
</script>

<div class="flex flex-col gap-4 {className}">
	{#each doc.sections as section, sectionIndex (sectionIndex)}
		<div class="flex flex-col gap-1">
			{#if section.label}
				<p class="pt-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
					{section.label}
				</p>
			{/if}
			{#each section.lines as line, lineIndex (lineIndex)}
				<div class="leading-[1.6]">
					{#if line.chords.length > 0}
						<div class="chord text-[14px] whitespace-pre text-ink" aria-hidden="true">
							{#each chordRow(line) as cell, cellIndex (cellIndex)}
								{#if cell.unknown && highlightUnknownChords}
									<span class="underline decoration-wavy decoration-2 underline-offset-2"
										>{cell.text}</span
									>
								{:else}
									{cell.text}
								{/if}
							{/each}
						</div>
					{/if}
					<p class="min-h-[1.6em] text-[15px] whitespace-pre-wrap text-ink">
						{line.lyrics}
					</p>
				</div>
			{/each}
		</div>
	{/each}
</div>
