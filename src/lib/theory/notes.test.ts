import { describe, expect, it } from 'vitest';
import {
	allCanonicalKeyNames,
	CANONICAL_KEY_NAMES,
	degreeToSpelling,
	keyAccidentalPreference,
	keyNameAccidentalPreference,
	keyNameToPitchClass,
	pitchClassToKeyName,
	spellPitch
} from './notes';

describe('keyNameToPitchClass / pitchClassToKeyName', () => {
	it('round-trips every canonical key name', () => {
		for (let pc = 0; pc < 12; pc++) {
			const name = pitchClassToKeyName(pc as never);
			expect(keyNameToPitchClass(name)).toBe(pc);
		}
	});

	it('uses guitar-world canonical spellings, not naive sharps', () => {
		expect(pitchClassToKeyName(1 as never)).toBe('Db');
		expect(pitchClassToKeyName(3 as never)).toBe('Eb');
		expect(pitchClassToKeyName(6 as never)).toBe('F#');
		expect(pitchClassToKeyName(8 as never)).toBe('Ab');
		expect(pitchClassToKeyName(10 as never)).toBe('Bb');
	});

	it('accepts common enharmonic spellings on parse', () => {
		expect(keyNameToPitchClass('C#')).toBe(1);
		expect(keyNameToPitchClass('Gb')).toBe(6);
		expect(keyNameToPitchClass('B#')).toBe(0);
		expect(keyNameToPitchClass('Cb')).toBe(11);
	});

	it('accepts unicode accidentals', () => {
		expect(keyNameToPitchClass('F♯')).toBe(6);
		expect(keyNameToPitchClass('D♭')).toBe(1);
	});

	it('returns null for garbage input', () => {
		expect(keyNameToPitchClass('H')).toBeNull();
		expect(keyNameToPitchClass('')).toBeNull();
	});

	it('allCanonicalKeyNames matches the exported table', () => {
		expect(allCanonicalKeyNames()).toBe(CANONICAL_KEY_NAMES);
		expect(allCanonicalKeyNames()).toHaveLength(12);
	});
});

describe('keyAccidentalPreference', () => {
	it('flat-side keys prefer flat', () => {
		expect(keyAccidentalPreference(1 as never)).toBe('flat'); // Db
		expect(keyAccidentalPreference(3 as never)).toBe('flat'); // Eb
		expect(keyAccidentalPreference(5 as never)).toBe('flat'); // F
		expect(keyAccidentalPreference(8 as never)).toBe('flat'); // Ab
		expect(keyAccidentalPreference(10 as never)).toBe('flat'); // Bb
	});

	it('sharp-side and natural keys prefer sharp', () => {
		expect(keyAccidentalPreference(0 as never)).toBe('sharp'); // C
		expect(keyAccidentalPreference(2 as never)).toBe('sharp'); // D
		expect(keyAccidentalPreference(6 as never)).toBe('sharp'); // F#
		expect(keyAccidentalPreference(7 as never)).toBe('sharp'); // G
	});

	it('keyNameAccidentalPreference matches by name', () => {
		expect(keyNameAccidentalPreference('F')).toBe('flat');
		expect(keyNameAccidentalPreference('E')).toBe('sharp');
	});
});

describe('spellPitch', () => {
	it('spells the key root with 0 letter steps', () => {
		expect(spellPitch(5 as never, 5 as never, 0)).toBe('F');
	});

	it('spells the same pitch class differently depending on requested letter step', () => {
		// Pitch class 6 (tritone above C) as the 4th scale letter (F) sharpened...
		expect(spellPitch(6 as never, 0 as never, 3)).toBe('F#');
		// ...or as the 5th scale letter (G) flattened.
		expect(spellPitch(6 as never, 0 as never, 4)).toBe('Gb');
	});
});

describe('degreeToSpelling', () => {
	it('spells the diatonic I IV V vi chords of G major correctly (1-4-5-6m)', () => {
		const g = keyNameToPitchClass('G')!;
		expect(degreeToSpelling(g, 0)).toBe('G');
		expect(degreeToSpelling(g, 5)).toBe('C');
		expect(degreeToSpelling(g, 7)).toBe('D');
		expect(degreeToSpelling(g, 9)).toBe('E');
	});

	it('spells the diatonic I IV V vi chords of F major with Bb, never A#', () => {
		const f = keyNameToPitchClass('F')!;
		expect(degreeToSpelling(f, 0)).toBe('F');
		expect(degreeToSpelling(f, 5)).toBe('Bb');
		expect(degreeToSpelling(f, 7)).toBe('C');
		expect(degreeToSpelling(f, 9)).toBe('D');
		expect(degreeToSpelling(f, 5)).not.toBe('A#');
	});

	it('spells the tritone (#4/b5) per the key accidental preference', () => {
		const c = keyNameToPitchClass('C')!;
		expect(degreeToSpelling(c, 6)).toBe('F#'); // sharp-preference key
		const f = keyNameToPitchClass('F')!;
		// Tritone above F, flat side: borrows the 5th-degree letter (C) flattened.
		expect(degreeToSpelling(f, 6)).toBe('Cb');
	});

	it('always spells borrowed (b2/b3/b6/b7) chromatic degrees flat, even in sharp-preference keys', () => {
		// b7 of D is C natural (not "C#" cancelled to a sharp spelling) — the
		// letter is fixed by the borrowed-chord convention, not the key's own
		// accidental preference.
		expect(degreeToSpelling(keyNameToPitchClass('D')!, 10)).toBe('C');
		// b6 of C is Ab, never G#.
		expect(degreeToSpelling(keyNameToPitchClass('C')!, 8)).toBe('Ab');
		// b3 of C is Eb, never D#.
		expect(degreeToSpelling(keyNameToPitchClass('C')!, 3)).toBe('Eb');
		// b7 of E is D natural.
		expect(degreeToSpelling(keyNameToPitchClass('E')!, 10)).toBe('D');
		// b6 of G is Eb.
		expect(degreeToSpelling(keyNameToPitchClass('G')!, 8)).toBe('Eb');
	});

	// Borrowed-chord degrees always use the *flattened upper-neighbor letter*
	// (b2/b3/b6/b7), regardless of the key's own sharp/flat preference. That
	// letter sometimes needs a "b" (e.g. C -> Eb) and sometimes doesn't,
	// because flattening a key's own sharp scale degree can land back on a
	// natural (e.g. E's major 3rd is G#, so its b3 is G natural, not G#).
	// Table below is derived from that rule for every sharp-preference key
	// (per domain-model.md §4, refined) plus two flat-preference keys.
	const BORROWED_DEGREE_TABLE: Record<string, [b2: string, b3: string, b6: string, b7: string]> = {
		C: ['Db', 'Eb', 'Ab', 'Bb'],
		D: ['Eb', 'F', 'Bb', 'C'],
		E: ['F', 'G', 'C', 'D'],
		'F#': ['G', 'A', 'D', 'E'],
		G: ['Ab', 'Bb', 'Eb', 'F'],
		A: ['Bb', 'C', 'F', 'G'],
		B: ['C', 'D', 'G', 'A'],
		F: ['Gb', 'Ab', 'Db', 'Eb'],
		Bb: ['Cb', 'Db', 'Gb', 'Ab']
	};

	it('spells b2/b3/b6/b7 as the flattened upper-neighbor letter, in every key', () => {
		for (const [key, [b2, b3, b6, b7]] of Object.entries(BORROWED_DEGREE_TABLE)) {
			const pc = keyNameToPitchClass(key)!;
			expect([key, degreeToSpelling(pc, 1)]).toEqual([key, b2]);
			expect([key, degreeToSpelling(pc, 3)]).toEqual([key, b3]);
			expect([key, degreeToSpelling(pc, 8)]).toEqual([key, b6]);
			expect([key, degreeToSpelling(pc, 10)]).toEqual([key, b7]);
		}
	});
});
