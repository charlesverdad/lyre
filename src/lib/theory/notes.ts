/**
 * Note/key naming primitives: KeyName <-> PitchClass conversion, and the
 * canonical major-key spelling table (domain-model.md §4).
 *
 * Guitar-world convention: prefer flats for the "middle" pitch classes that
 * could go either way (Db, Eb, Gb-as-F#, Ab, Bb), never spell a sharp key's
 * enharmonic sharp root as a double-letter oddity, and never produce
 * "naive" spellings like A# or E# / Cb / Fb for common keys.
 */

import type { PitchClass } from './types';

/** Canonical key name for each pitch class, C=0 … B=11. Index = PitchClass. */
export const CANONICAL_KEY_NAMES: readonly string[] = [
	'C',
	'Db',
	'D',
	'Eb',
	'E',
	'F',
	'F#',
	'G',
	'Ab',
	'A',
	'Bb',
	'B'
];

/** Whether a key's diatonic/chromatic spelling should prefer flats or sharps. */
export type Accidental = 'flat' | 'sharp';

/**
 * Accidental preference per pitch class, following standard key-signature
 * convention (flat-side keys F/Bb/Eb/Ab/Db spell flat, sharp-side and
 * natural keys spell sharp) — used both for choosing the key's own name
 * and for spelling chromatic (non-diatonic) chords within that key
 * (domain-model.md §4 rule 3: "flat keys spell flat, sharp keys spell sharp").
 */
const ACCIDENTAL_PREFERENCE: readonly Accidental[] = [
	'sharp', // C
	'flat', // Db
	'sharp', // D
	'flat', // Eb
	'sharp', // E
	'flat', // F
	'sharp', // F#
	'sharp', // G
	'flat', // Ab
	'sharp', // A
	'flat', // Bb
	'sharp' // B
];

/** All spellings accepted when parsing a KeyName into a PitchClass. */
const NAME_TO_PITCH_CLASS: Record<string, PitchClass> = {
	C: 0,
	'B#': 0,
	Dbb: 0,
	'C#': 1,
	Db: 1,
	D: 2,
	'C##': 2,
	Ebb: 2,
	'D#': 3,
	Eb: 3,
	E: 4,
	Fb: 4,
	'D##': 4,
	F: 5,
	'E#': 5,
	Gbb: 5,
	'F#': 6,
	Gb: 6,
	G: 7,
	'F##': 7,
	Abb: 7,
	'G#': 8,
	Ab: 8,
	A: 9,
	'G##': 9,
	Bbb: 9,
	'A#': 10,
	Bb: 10,
	B: 11,
	Cb: 11,
	'A##': 11
};

/** Parse a KeyName (any reasonable spelling) to its PitchClass. */
export function keyNameToPitchClass(name: string): PitchClass | null {
	const normalized = normalizeAccidentalChars(name.trim());
	const pc = NAME_TO_PITCH_CLASS[normalized];
	return pc === undefined ? null : pc;
}

/** The canonical spelling for a pitch class (domain-model.md §4 rule 2). */
export function pitchClassToKeyName(pc: PitchClass): string {
	return CANONICAL_KEY_NAMES[((pc % 12) + 12) % 12];
}

/** Accidental preference of a given key, by its pitch class. */
export function keyAccidentalPreference(pc: PitchClass): Accidental {
	return ACCIDENTAL_PREFERENCE[((pc % 12) + 12) % 12];
}

/** Accidental preference of a given key, by its KeyName. */
export function keyNameAccidentalPreference(name: string): Accidental {
	const pc = keyNameToPitchClass(name);
	return pc === null ? 'sharp' : keyAccidentalPreference(pc);
}

/**
 * Letter names in order, used to compute diatonic degree-preserving
 * spellings (e.g. so degree 2 in the key of F spells as G, not F##/Ab).
 */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const LETTER_PITCH: Record<(typeof LETTERS)[number], number> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11
};

/** Convert typographic sharp/flat unicode (♯/♭) to ASCII #/b. */
function normalizeAccidentalChars(s: string): string {
	return s.replace(/♯/g, '#').replace(/♭/g, 'b');
}

/**
 * Spell a pitch class as a letter name relative to a key root, preserving
 * the *letter* that is `letterSteps` scale-letters above the key's letter
 * (mod 7), so diatonic/chromatic chords read naturally instead of jumping
 * to an unrelated enharmonic letter.
 *
 * `letterSteps` is a diatonic scale-degree offset (0..6): 0=root letter,
 * 1=second letter, etc. The returned name is that letter plus whatever
 * accidental (#, b, ##, bb, or none) makes it match `targetPc`.
 */
export function spellPitch(targetPc: PitchClass, keyPc: PitchClass, letterSteps: number): string {
	const keyLetterIndex = LETTERS.indexOf(letterNameOf(keyPc));
	const letter = LETTERS[(((keyLetterIndex + letterSteps) % 7) + 7) % 7];
	const naturalPitch = LETTER_PITCH[letter];
	let diff = (((targetPc - naturalPitch) % 12) + 12) % 12;
	// diff is 0..11; map to the smallest signed accidental offset (-2..2 covers
	// all realistic cases we produce, but clamp defensively).
	if (diff > 6) diff -= 12;
	const accidental = diff === 0 ? '' : diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff);
	return `${letter}${accidental}`;
}

/** The canonical natural-ish letter used for a key's own pitch class. */
function letterNameOf(pc: PitchClass): (typeof LETTERS)[number] {
	const name = pitchClassToKeyName(pc);
	return name[0] as (typeof LETTERS)[number];
}

/** All 12 canonical KeyNames, in pitch-class order (0..11). */
export function allCanonicalKeyNames(): readonly string[] {
	return CANONICAL_KEY_NAMES;
}

/** Semitone offsets of the major scale degrees, matching letter steps 0..6. */
const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/**
 * Spell a semitone `degree` (0..11) above `keyPc` as a note name, per
 * domain-model.md §4:
 *  - Diatonic degrees (on the major scale of the key) get the matching
 *    scale letter, spelled naturally or with whatever single accidental the
 *    key signature requires (rule 1/2: degree-preserving transpose).
 *  - Chromatic (non-diatonic) degrees borrow the neighboring scale letter
 *    and accidental according to the key's sharp/flat preference (rule 3).
 */
export function degreeToSpelling(
	keyPc: PitchClass,
	degree: number,
	accidental?: Accidental
): string {
	const d = ((degree % 12) + 12) % 12;
	const pref = accidental ?? keyAccidentalPreference(keyPc);
	const exactIndex = MAJOR_SCALE_SEMITONES.indexOf(d);
	if (exactIndex !== -1) {
		return spellPitch(((keyPc + d) % 12) as PitchClass, keyPc, exactIndex);
	}
	// Chromatic: sits between scale step `below` and `below + 1`.
	let below = 0;
	for (let i = 0; i < MAJOR_SCALE_SEMITONES.length; i++) {
		if (MAJOR_SCALE_SEMITONES[i] < d) below = i;
	}
	const letterSteps = pref === 'sharp' ? below : below + 1;
	return spellPitch(((keyPc + d) % 12) as PitchClass, keyPc, letterSteps);
}
