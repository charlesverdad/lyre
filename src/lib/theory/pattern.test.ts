import { describe, expect, it } from 'vitest';
import { derivePattern, suggestPatterns } from './pattern';

describe('derivePattern', () => {
	it('derives soundingKey from shapeKey + capo (no wraparound)', () => {
		expect(derivePattern({ shapeKey: 'G', capo: 2 })).toEqual({
			soundingKey: 'A',
			shapeKey: 'G',
			capo: 2
		});
	});

	it('derives soundingKey from shapeKey + capo with wraparound', () => {
		// G (7) + 7 = 14 -> mod12 = 2 -> D
		expect(derivePattern({ shapeKey: 'G', capo: 7 })).toEqual({
			soundingKey: 'D',
			shapeKey: 'G',
			capo: 7
		});
	});

	it('derives shapeKey from soundingKey + capo', () => {
		// Ab (8) with G (7) shapes needs capo 1.
		expect(derivePattern({ soundingKey: 'Ab', capo: 1 })).toEqual({
			soundingKey: 'Ab',
			shapeKey: 'G',
			capo: 1
		});
	});

	it('derives capo from soundingKey + shapeKey', () => {
		expect(derivePattern({ soundingKey: 'A', shapeKey: 'G' })).toEqual({
			soundingKey: 'A',
			shapeKey: 'G',
			capo: 2
		});
	});

	it('derives capo with wraparound when shape is above sounding pitch class', () => {
		// Sounding G (7), shape A (9): capo = (7 - 9) mod 12 = 10.
		expect(derivePattern({ soundingKey: 'G', shapeKey: 'A' })).toEqual({
			soundingKey: 'G',
			shapeKey: 'A',
			capo: 10
		});
	});

	it('matches the worked example from the domain model (Ab, G shapes, capo 1)', () => {
		expect(derivePattern({ shapeKey: 'G', capo: 1 })).toEqual({
			soundingKey: 'Ab',
			shapeKey: 'G',
			capo: 1
		});
		// Same fact, other direction: given sounding Ab and G shapes, capo must be 1.
		expect(derivePattern({ soundingKey: 'Ab', shapeKey: 'G' })).toEqual({
			soundingKey: 'Ab',
			shapeKey: 'G',
			capo: 1
		});
	});

	it('throws when fewer than two fields are provided', () => {
		// @ts-expect-error - intentionally invalid input for the runtime guard
		expect(() => derivePattern({ shapeKey: 'G' })).toThrow();
	});

	it('normalizes an out-of-range capo input into 0..11', () => {
		expect(derivePattern({ shapeKey: 'G', capo: 14 })).toEqual({
			soundingKey: 'A',
			shapeKey: 'G',
			capo: 2
		});
	});
});

describe('suggestPatterns', () => {
	it('ranks target B with A capo 2 first (per domain-model.md §4 worked example)', () => {
		const suggestions = suggestPatterns('B');
		expect(suggestions[0]).toMatchObject({ shapeKey: 'A', capo: 2 });
		expect(suggestions[1]).toMatchObject({ shapeKey: 'G', capo: 4 });
		expect(suggestions[2]).toMatchObject({ shapeKey: 'E', capo: 7 });
	});

	it('excludes capo > 9 by default', () => {
		const suggestions = suggestPatterns('B');
		expect(suggestions.every((s) => s.capo <= 9)).toBe(true);
		// C shapes would need capo 11 for target B — must not appear.
		expect(suggestions.find((s) => s.shapeKey === 'C')).toBeUndefined();
	});

	it('includes unavailable capos when requested, flagged', () => {
		const suggestions = suggestPatterns('B', { includeUnavailable: true });
		const cShape = suggestions.find((s) => s.shapeKey === 'C');
		expect(cShape).toMatchObject({ shapeKey: 'C', capo: 11, available: false });
	});

	it('suggests capo 0 with the target sounding key itself as one option', () => {
		const suggestions = suggestPatterns('G', { includeUnavailable: true });
		const selfShape = suggestions.find((s) => s.shapeKey === 'G');
		expect(selfShape).toMatchObject({ shapeKey: 'G', capo: 0, tier: 'ideal' });
	});

	it('honors a custom comfort order', () => {
		const suggestions = suggestPatterns('B', { comfortOrder: ['E', 'A'] });
		// Within the custom comfort group, still sorted by capo ascending: A(2) before E(7).
		expect(suggestions[0]).toMatchObject({ shapeKey: 'A', capo: 2 });
		expect(suggestions[1]).toMatchObject({ shapeKey: 'E', capo: 7 });
	});

	it('returns exactly 10 suggestions by default (12 shapes minus 2 over capo 9)', () => {
		const suggestions = suggestPatterns('B');
		expect(suggestions).toHaveLength(10);
	});

	it('every suggestion satisfies the pattern invariant', () => {
		for (const s of suggestPatterns('Eb', { includeUnavailable: true })) {
			expect(s.capo).toBeGreaterThanOrEqual(0);
			expect(s.capo).toBeLessThanOrEqual(11);
		}
	});
});
