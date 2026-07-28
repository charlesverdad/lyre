import { describe, expect, it } from 'vitest';
import {
	formatAnswerHeadline,
	formatAnswerSubline,
	formatBadge,
	formatCapoHint,
	formatChipCapo,
	formatSuggestion
} from './format';

describe('formatBadge', () => {
	it('renders the standard badge, mvp-spec.md F3', () => {
		expect(formatBadge({ soundingKey: 'A', shapeKey: 'G', capo: 2 })).toBe(
			'Capo 2 · G shapes · sounds in A'
		);
	});

	it('drops the redundant shapes segment at capo 0, acceptance walkthrough step 5', () => {
		expect(formatBadge({ soundingKey: 'G', shapeKey: 'G', capo: 0 })).toBe('No capo · sounds in G');
	});
});

describe('formatSuggestion', () => {
	it('renders a transpose-sheet suggestion row', () => {
		expect(formatSuggestion({ shapeKey: 'G', capo: 4 })).toBe('G shapes · capo 4');
	});

	it('reads "no capo" at capo 0', () => {
		expect(formatSuggestion({ shapeKey: 'G', capo: 0 })).toBe('G shapes · no capo');
	});
});

describe('formatCapoHint', () => {
	it('renders a bare capo hint for disabled shape options', () => {
		expect(formatCapoHint(11)).toBe('capo 11');
	});
});

describe('formatAnswerHeadline', () => {
	it('renders "Capo N"', () => {
		expect(formatAnswerHeadline({ capo: 2 })).toBe('Capo 2');
	});

	it('renders "No capo" at capo 0', () => {
		expect(formatAnswerHeadline({ capo: 0 })).toBe('No capo');
	});
});

describe('formatAnswerSubline', () => {
	it('renders "{shape} shapes · sounds in {key}"', () => {
		expect(formatAnswerSubline({ soundingKey: 'A', shapeKey: 'G', capo: 2 })).toBe(
			'G shapes · sounds in A'
		);
	});

	it('drops the redundant shapes segment at capo 0', () => {
		expect(formatAnswerSubline({ soundingKey: 'G', shapeKey: 'G', capo: 0 })).toBe('sounds in G');
	});
});

describe('formatChipCapo', () => {
	it('renders "capo N"', () => {
		expect(formatChipCapo(2)).toBe('capo 2');
	});

	it('reads "no capo" at capo 0', () => {
		expect(formatChipCapo(0)).toBe('no capo');
	});
});
