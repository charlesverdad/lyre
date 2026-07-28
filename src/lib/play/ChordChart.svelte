<script lang="ts">
	/**
	 * Chart renderer for play mode (task B3, mvp-spec.md F3).
	 *
	 * Renders a key-neutral `ChartDoc` (task A2) in a chosen shape key
	 * (`renderChord`, task A1) — chords are pure rendering, the stored chart
	 * never mutates (domain-model.md §2). Chord/lyric alignment uses
	 * `splitChordLine` (`$lib/play/chordLine.ts`): each chord is stacked in
	 * its own column directly above the lyric fragment that follows it, so
	 * alignment holds at any font scale even though lyrics render in a
	 * proportional face (design.md "Type").
	 */
	import type { ChartDoc } from '$lib/theory/types';
	import { renderChord } from '$lib/theory/chords';
	import { splitChordLine } from './chordLine';

	interface Props {
		doc: ChartDoc;
		/** The shape key to render chords in (domain-model.md §1). */
		shapeKey: string;
		/** Play-mode font size in px, 14–28 (design.md "Type"). */
		fontScale: number;
		/** Hide lyric text, showing chord rows only. */
		hideLyrics?: boolean;
		/** Hide chord rows, showing lyric text only (for singing). */
		hideChords?: boolean;
		class?: string;
	}

	let {
		doc,
		shapeKey,
		fontScale,
		hideLyrics = false,
		hideChords = false,
		class: className = ''
	}: Props = $props();

	function isBlankLine(line: ChartDoc['sections'][number]['lines'][number]): boolean {
		return line.lyrics === '' && line.chords.length === 0;
	}

	function isChorusLabel(label: string | undefined): boolean {
		return (label ?? '').toLowerCase().startsWith('chorus');
	}
</script>

<!--
	docs/design.md "Type": chords bold monospace at 0.95em, lyrics regular
	sans with generous line-height (1.6+). Font size is the only thing that scales with
	the A-/A+ stepper — everything else is relative (em/leading) so the whole
	chart grows together.
-->
<div class="chart flex flex-col gap-5 {className}" style="font-size: {fontScale}px">
	{#each doc.sections as section, sectionIndex (sectionIndex)}
		<section class="flex flex-col gap-1">
			{#if section.label}
				<h2
					class="text-[0.76em] font-semibold tracking-wide text-ink-2 uppercase {isChorusLabel(
						section.label
					)
						? 'border-l-2 border-line pl-2'
						: ''}"
				>
					{section.label}
				</h2>
			{/if}

			<div class="flex flex-col">
				{#each section.lines as line, lineIndex (lineIndex)}
					{#if isBlankLine(line)}
						<div class="h-[0.8em]" aria-hidden="true"></div>
					{:else}
						<div class="flex flex-row flex-wrap items-start leading-[1.6]">
							{#each splitChordLine( line, (chord) => renderChord(chord, shapeKey) ) as fragment, fragmentIndex (fragmentIndex)}
								<span class="flex flex-col">
									{#if !hideChords}
										<span class="chord block min-h-[1.3em] text-[0.95em] whitespace-pre text-ink">
											{fragment.chordText ?? ''}
										</span>
									{/if}
									{#if !hideLyrics}
										<span class="block whitespace-pre text-ink">{fragment.lyricText}</span>
									{/if}
								</span>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/each}
</div>
