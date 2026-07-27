import { describe, expect, it } from 'vitest';
import { shapeOptions } from './shapeOptions';

describe('shapeOptions', () => {
	it('orders comfort shapes first (G, C, D, A, E), then the rest chromatically', () => {
		const options = shapeOptions({ soundingKey: 'A' });
		expect(options.slice(0, 5).map((o) => o.shapeKey)).toEqual(['G', 'C', 'D', 'A', 'E']);
		expect(options).toHaveLength(12);
	});

	it('computes each option capo keeping soundingKey fixed', () => {
		const options = shapeOptions({ soundingKey: 'A' });
		const g = options.find((o) => o.shapeKey === 'G');
		// A (9) - G (7) = 2.
		expect(g).toMatchObject({ capo: 2, disabled: false });
		const a = options.find((o) => o.shapeKey === 'A');
		expect(a).toMatchObject({ capo: 0, disabled: false });
	});

	it('disables options whose capo exceeds maxCapo, without hiding them', () => {
		const options = shapeOptions({ soundingKey: 'A', maxCapo: 9 });
		// A (9) - Bb (10) = 11 -> disabled.
		const bb = options.find((o) => o.shapeKey === 'Bb');
		expect(bb).toMatchObject({ capo: 11, disabled: true });
	});

	it('respects a custom comfort order', () => {
		const options = shapeOptions({ soundingKey: 'A', comfortOrder: ['E', 'A'] });
		expect(options.slice(0, 2).map((o) => o.shapeKey)).toEqual(['E', 'A']);
	});
});
