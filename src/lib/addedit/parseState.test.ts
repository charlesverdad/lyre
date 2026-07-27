import { describe, expect, it } from 'vitest';
import { renderChord } from '$lib/theory/chords';
import { canSaveChart, deriveChartParseState } from './parseState';

const PLAIN_CHART = ['Verse 1', 'G           C', 'Amazing grace how sweet the sound'].join('\n');

const HEADER_CHART = [
	'Original in Ab. Capo 1, play in G.',
	'',
	'Verse 1',
	'G           C',
	'Amazing grace how sweet the sound'
].join('\n');

describe('deriveChartParseState', () => {
	it('parses plaintext charts and reports the inferred source key', () => {
		const state = deriveChartParseState(PLAIN_CHART);
		// No header present — inferSourceKeyFromChords (chart.ts) picks the last
		// major-triad chord's root, "C" here.
		expect(state.sourceKey).toBe('C');
		expect(state.doc.sourceKey).toBe('C');
		expect(state.isEmpty).toBe(false);
		expect(state.initialPattern).toBeUndefined();
	});

	it('surfaces a complete pattern header as initialPattern', () => {
		const state = deriveChartParseState(HEADER_CHART);
		expect(state.initialPattern).toEqual({ soundingKey: 'Ab', shapeKey: 'G', capo: 1 });
		expect(state.sourceKey).toBe('G');
	});

	it('flags empty/whitespace-only paste as empty', () => {
		const state = deriveChartParseState('   \n  \n');
		expect(state.isEmpty).toBe(true);
	});

	it('reparses against an overridden source key so the same letters round-trip', () => {
		const state = deriveChartParseState(PLAIN_CHART, 'A');
		expect(state.sourceKey).toBe('A');
		// The chord letters typed in the paste ("G", "C") must still render as
		// "G"/"C" once re-parsed under the corrected key — overriding the key
		// picker corrects a misdetection, it doesn't transpose the chart.
		const firstLineChords = state.doc.sections[0].lines
			.flatMap((line) => line.chords)
			.map((c) => renderChord(c.chord, state.sourceKey));
		expect(firstLineChords).toEqual(['G', 'C']);
	});

	it('is a no-op when the override matches the already-inferred key', () => {
		const state = deriveChartParseState(PLAIN_CHART, 'C');
		expect(state.sourceKey).toBe('C');
	});
});

describe('canSaveChart', () => {
	it('requires both a non-empty title and a successful parse', () => {
		const state = deriveChartParseState(PLAIN_CHART);
		expect(canSaveChart('', state)).toBe(false);
		expect(canSaveChart('  ', state)).toBe(false);
		expect(canSaveChart('Amazing Grace', state)).toBe(true);
	});

	it('is false when parsing produced no content', () => {
		const state = deriveChartParseState('   ');
		expect(canSaveChart('Amazing Grace', state)).toBe(false);
	});

	it('is false when there is no parse state yet', () => {
		expect(canSaveChart('Amazing Grace', undefined)).toBe(false);
	});
});
