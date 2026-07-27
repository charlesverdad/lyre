import { describe, expect, it } from 'vitest';
import { pickDefaultChart, pickPreferredPattern } from './song';

describe('pickDefaultChart', () => {
	it('returns undefined for an empty list', () => {
		expect(pickDefaultChart([])).toBeUndefined();
	});

	it('prefers a chart named "Default"', () => {
		const charts = [
			{ name: 'Acoustic', createdAt: '2024-01-01T00:00:00.000Z' },
			{ name: 'Default', createdAt: '2024-02-01T00:00:00.000Z' }
		];
		expect(pickDefaultChart(charts)).toBe(charts[1]);
	});

	it('falls back to the earliest-created chart when none is named "Default"', () => {
		const charts = [
			{ name: 'Live version', createdAt: '2024-02-01T00:00:00.000Z' },
			{ name: 'Acoustic', createdAt: '2024-01-01T00:00:00.000Z' }
		];
		expect(pickDefaultChart(charts)).toBe(charts[1]);
	});
});

describe('pickPreferredPattern', () => {
	it('returns undefined when no pattern is preferred yet', () => {
		expect(pickPreferredPattern([{ isPreferred: false }])).toBeUndefined();
	});

	it('returns the preferred pattern', () => {
		const patterns = [{ isPreferred: false }, { isPreferred: true }];
		expect(pickPreferredPattern(patterns)).toBe(patterns[1]);
	});
});
