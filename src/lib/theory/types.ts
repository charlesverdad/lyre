/**
 * Shared type contracts for Lyre's theory/chart/data layer.
 *
 * These are the interfaces wave-1 tasks (A1 theory engine, A2 chart parsing,
 * A3 data layer) build against — see docs/PLAN-v0.1.md "Shared type
 * contracts" and docs/domain-model.md §2 and §5. Types only, no logic: the
 * actual parsing/transposition/persistence implementations land in their
 * respective task PRs (`src/lib/theory/`, `src/lib/chart/`, `src/lib/db/`).
 */

/** A pitch class, C=0 … B=11 (mod-12 semitone position). */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/**
 * Canonical key spelling, e.g. "A", "Ab", "F#". Not a closed union — the
 * theory engine owns the canonical spelling table (domain-model.md §4).
 */
export type KeyName = string;

/**
 * A chord, stored key-relative: `degree` is semitones above the chart's key
 * root (0..11), never an absolute pitch — this is what keeps a stored
 * ChartDoc key-neutral (domain-model.md §2, §3).
 */
export interface Chord {
	/** Semitones above the key root, 0..11 (Nashville-number equivalent). */
	degree: number;
	/** Chord quality/extension, e.g. "", "m", "7", "maj7", "sus4". */
	quality: string;
	/** Slash-chord bass, also key-relative degree, if present. */
	bassDegree?: number;
	/** Passthrough original text for chords the parser couldn't interpret. */
	raw?: string;
}

/**
 * The user's three-part playing configuration for a chart
 * (domain-model.md §1): `soundingKey = shapeKey + capo` (mod 12).
 */
export interface Pattern {
	/** The pitch the audience hears. */
	soundingKey: KeyName;
	/** The chord family the hands finger, as if no capo. */
	shapeKey: KeyName;
	/** Fret the capo sits on, 0..11. */
	capo: number;
}

/** A single lyric line with its chord placements. */
export type Line = {
	lyrics: string;
	chords: { chord: Chord; index: number }[];
};

/** A key-neutral chord-over-lyrics document (domain-model.md §2, §3). */
export interface ChartDoc {
	title?: string;
	/** The key the chart's chords are stored relative to. */
	sourceKey: KeyName;
	sections: { label?: string; lines: Line[] }[];
}

/** The musical work — one per real-world song (domain-model.md §5). */
export interface SongRecord {
	id: string;
	title: string;
	aliases: string[];
	authors: string[];
	ccliNumber?: string;
	copyright?: string;
	defaultKey: KeyName;
	tempoBpm?: number;
	timeSignature?: string;
	topics: string[];
	createdAt: string;
	updatedAt: string;
	/**
	 * ISO timestamp of the last time this song was opened in play mode.
	 * Optional/additive (task A3 data layer): powers the "recently played"
	 * library sort (mvp-spec.md F1); absent until the first play.
	 */
	lastPlayedAt?: string;
}

/** A chord-over-lyrics document belonging to a Song (domain-model.md §5). */
export interface ChartRecord {
	id: string;
	songId: string;
	/** e.g. "Default", "Acoustic". */
	name: string;
	/** ChordPro source (domain-model.md §3). */
	chordproSource: string;
	sourceKey: KeyName;
	sourceUrl?: string;
	sourceSite?: string;
	fetchedAt?: string;
	/** Preserved original grabbed text, so edits are an overlay. */
	rawGrabbedText?: string;
	sourceAttribution?: string;
	createdAt: string;
	updatedAt: string;
}

/** A user's playing configuration for a Chart (domain-model.md §5). */
export interface PatternRecord extends Pattern {
	id: string;
	chartId: string;
	/** e.g. "My usual". */
	label: string;
	isPreferred: boolean;
	/** Play-mode font size, 14..28px. */
	fontScale?: number;
	autoscrollSpeed?: number;
}
