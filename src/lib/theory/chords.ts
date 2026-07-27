/**
 * Chord token parsing/rendering: text <-> key-relative `Chord`
 * (domain-model.md §3, §4).
 */

import type { Chord, PitchClass } from './types';
import { degreeToSpelling, keyNameToPitchClass } from './notes';

/** Result of parsing a single chord token, before key-relative normalization. */
export interface ParsedChordToken {
	root: PitchClass;
	/** Canonical quality string, e.g. "", "m", "7", "maj7", "sus4", "m7b5". */
	quality: string;
	bass?: PitchClass;
	/** True for "N.C." (no chord) — root/quality are placeholders, ignored on render. */
	noChord?: true;
}

/**
 * Recognized quality spellings, mapped to their canonical form
 * (domain-model.md §3 vocabulary, plus common aliases). Sorted by input
 * length descending at lookup time so e.g. "maj7" matches before "maj".
 */
const QUALITY_ALIASES: Record<string, string> = {
	// Major triad (bare root already covers this; "maj" is an explicit alias).
	'': '',
	maj: 'maj',
	M: 'maj',
	// Minor triad.
	m: 'm',
	min: 'm',
	'-': 'm',
	// Diminished / augmented.
	dim: 'dim',
	o: 'dim',
	'°': 'dim',
	dim7: 'dim7',
	o7: 'dim7',
	aug: 'aug',
	'+': 'aug',
	// Suspended / added tone.
	sus: 'sus4',
	sus2: 'sus2',
	sus4: 'sus4',
	'2': '2',
	add2: 'add2',
	add9: 'add9',
	add11: 'add11',
	// Plain numeric extensions/power chord.
	'4': '4',
	'5': '5',
	'6': '6',
	'6/9': '6/9',
	'69': '6/9',
	'7': '7',
	'9': '9',
	'11': '11',
	'13': '13',
	// Major 7th family.
	maj7: 'maj7',
	M7: 'maj7',
	Maj7: 'maj7',
	Δ7: 'maj7',
	Δ: 'maj7',
	maj9: 'maj9',
	maj11: 'maj11',
	maj13: 'maj13',
	// Minor 7th family.
	m6: 'm6',
	m7: 'm7',
	m9: 'm9',
	m11: 'm11',
	m13: 'm13',
	madd9: 'madd9',
	mmaj7: 'mmaj7',
	'm(maj7)': 'mmaj7',
	// Half-diminished / altered dominants.
	m7b5: 'm7b5',
	'm7♭5': 'm7b5',
	ø: 'm7b5',
	ø7: 'm7b5',
	'7b5': '7b5',
	'7#5': '7#5',
	'7b9': '7b9',
	'7#9': '7#9',
	'7#11': '7#11',
	'7b13': '7b13',
	'7sus2': '7sus2',
	'7sus4': '7sus4',
	'9sus4': '9sus4'
};

const ROOT_RE = /^([A-G])(#{1,2}|b{1,2}|♯|♭)?/;

const ROOT_LETTER_PITCH: Record<string, number> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11
};

function normalizeAccidentalChars(s: string): string {
	return s.replace(/♯/g, '#').replace(/♭/g, 'b');
}

/** Parse a root+accidental prefix (e.g. "Bb", "F##") into a PitchClass and match length. */
function parseRootFrom(s: string): { pc: PitchClass; length: number } | null {
	const m = ROOT_RE.exec(s);
	if (!m) return null;
	const letter = m[1];
	const accidental = normalizeAccidentalChars(m[2] ?? '');
	let pc = ROOT_LETTER_PITCH[letter];
	for (const ch of accidental) {
		if (ch === '#') pc += 1;
		else if (ch === 'b') pc -= 1;
	}
	pc = (((pc % 12) + 12) % 12) as PitchClass;
	return { pc: pc as PitchClass, length: m[0].length };
}

/** Look up a quality suffix (the text after the root) as a whole. */
function matchQuality(s: string): { quality: string; length: number } | null {
	if (s === '') return { quality: '', length: 0 };
	if (Object.prototype.hasOwnProperty.call(QUALITY_ALIASES, s)) {
		return { quality: QUALITY_ALIASES[s], length: s.length };
	}
	return null;
}

const NO_CHORD_RE = /^N\.?\s*C\.?$/i;

/**
 * Parse a single chord token (e.g. "G", "Bbm7", "F#sus4", "G/B", "N.C.")
 * into root/quality/bass PitchClasses. Returns `null` if the token isn't a
 * recognizable chord — callers should keep the raw text in that case
 * (domain-model.md §3: "Unrecognized chords pass through verbatim").
 */
export function parseChordToken(token: string): ParsedChordToken | null {
	const trimmed = token.trim();
	if (trimmed.length === 0) return null;

	if (NO_CHORD_RE.test(trimmed)) {
		return { root: 0, quality: 'N.C.', noChord: true };
	}

	const [rootAndQuality, bassPart, ...rest] = trimmed.split('/');
	if (rest.length > 0) return null; // more than one slash — not a chord we understand

	const root = parseRootFrom(rootAndQuality);
	if (!root) return null;

	const qualityText = rootAndQuality.slice(root.length);
	const matched = matchQuality(qualityText);
	if (!matched) return null;

	let bass: PitchClass | undefined;
	if (bassPart !== undefined) {
		const bassRoot = parseRootFrom(bassPart.trim());
		if (!bassRoot || bassRoot.length !== bassPart.trim().length) return null;
		bass = bassRoot.pc;
	}

	return { root: root.pc, quality: matched.quality, bass };
}

/**
 * Convert a parsed chord token to a key-relative `Chord`
 * (domain-model.md §2, §3: chords are stored as degrees above the chart key).
 */
export function chordToDegree(parsed: ParsedChordToken, key: string): Chord {
	const keyPc = keyNameToPitchClass(key);
	if (keyPc === null) {
		throw new Error(`chordToDegree: unrecognized key "${key}"`);
	}
	if (parsed.noChord) {
		return { degree: 0, quality: 'N.C.' };
	}
	const degree = (((parsed.root - keyPc) % 12) + 12) % 12;
	const bassDegree =
		parsed.bass === undefined ? undefined : (((parsed.bass - keyPc) % 12) + 12) % 12;
	return { degree, quality: parsed.quality, bassDegree };
}

/**
 * Render a key-relative `Chord` as text in the given shape key, per
 * domain-model.md §4: degree-preserving transpose through the key's
 * diatonic/chromatic spelling table; slash chords transpose both root and
 * bass; unparseable chords (`raw` set) pass through verbatim.
 */
export function renderChord(chord: Chord, key: string): string {
	if (chord.raw !== undefined) return chord.raw;
	if (chord.quality === 'N.C.') return 'N.C.';

	const keyPc = keyNameToPitchClass(key);
	if (keyPc === null) {
		throw new Error(`renderChord: unrecognized key "${key}"`);
	}

	const rootName = degreeToSpelling(keyPc, chord.degree);
	const bassName =
		chord.bassDegree === undefined ? '' : `/${degreeToSpelling(keyPc, chord.bassDegree)}`;
	return `${rootName}${chord.quality}${bassName}`;
}
