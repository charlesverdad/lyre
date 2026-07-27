import { describe, expect, it } from 'vitest';
import { formatBadge, formatCapoHint, formatSuggestion } from './format';

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
