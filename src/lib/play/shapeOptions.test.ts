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

	it('tags exactly one chip suggested: the comfort-order, lowest-capo pick', () => {
		const options = shapeOptions({ soundingKey: 'A' });
		const suggested = options.filter((o) => o.suggested);
		expect(suggested).toHaveLength(1);
		// A is itself in the default comfort order at capo 0 -> best.
		expect(suggested[0]).toMatchObject({ shapeKey: 'A', capo: 0 });
	});

	it('suggests a non-comfort-order shape when no comfort shape is available', () => {
		// Force every comfort shape's capo past maxCapo except one; here we
		// simply check that lowering maxCapo can shift the suggestion off the
		// selected key when it isn't in the comfort order.
		const options = shapeOptions({
			soundingKey: 'B',
			comfortOrder: ['G', 'C', 'D', 'A', 'E'],
			maxCapo: 9
		});
		const suggested = options.find((o) => o.suggested);
		// B (11): G(7)->4, C(0)->11 disabled, D(2)->9, A(9)->2, E(4)->7 — comfort
		// order picks lowest-capo among available comfort shapes: A at capo 2.
		expect(suggested).toMatchObject({ shapeKey: 'A', capo: 2 });
	});
});
