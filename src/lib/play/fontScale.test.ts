import { describe, expect, it } from 'vitest';
import {
	clampFontScale,
	DEFAULT_FONT_SCALE,
	MAX_FONT_SCALE,
	MIN_FONT_SCALE,
	stepFontScale
} from './fontScale';

describe('clampFontScale', () => {
	it('passes values already in range through', () => {
		expect(clampFontScale(20)).toBe(20);
	});

	it('clamps below the minimum', () => {
		expect(clampFontScale(2)).toBe(MIN_FONT_SCALE);
	});

	it('clamps above the maximum', () => {
		expect(clampFontScale(99)).toBe(MAX_FONT_SCALE);
	});

	it('defaults on undefined/non-finite input', () => {
		expect(clampFontScale(undefined)).toBe(DEFAULT_FONT_SCALE);
		expect(clampFontScale(NaN)).toBe(DEFAULT_FONT_SCALE);
	});

	it('rounds fractional values', () => {
		expect(clampFontScale(17.6)).toBe(18);
	});
});

describe('stepFontScale', () => {
	it('steps up and down by one', () => {
		expect(stepFontScale(17, 1)).toBe(18);
		expect(stepFontScale(17, -1)).toBe(16);
	});

	it('clamps at the boundaries', () => {
		expect(stepFontScale(MAX_FONT_SCALE, 1)).toBe(MAX_FONT_SCALE);
		expect(stepFontScale(MIN_FONT_SCALE, -1)).toBe(MIN_FONT_SCALE);
	});
});
