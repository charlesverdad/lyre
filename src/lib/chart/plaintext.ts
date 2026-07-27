/**
 * "Chords above lyrics" plain-text chart parsing (domain-model.md §3).
 *
 * This is the format pnwchords and most chord sites use: a line of chord
 * tokens positioned above a line of lyrics, chord columns roughly aligned
 * with the syllable they ring on. We detect chord lines heuristically,
 * align each chord's column to a character index in the following lyric
 * line, and recognize common section-label lines ("Verse 1", "Chorus", …).
 */

import { chordToDegree, parseChordToken } from '../theory/chords';
import type { Chord, ChartDoc, KeyName, Line } from '../theory/types';

/**
 * Normalize curly quotes/apostrophes and non-breaking spaces that chord
 * sites commonly emit, to plain ASCII equivalents.
 */
export function normalizeLyricText(s: string): string {
	return s
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/\u00a0/g, ' ');
}

/**
 * A line counts as a "chord line" if at least 80% of its whitespace-
 * separated tokens parse as chords (domain-model.md §3 vocabulary) and it
 * has at least one token. This tolerates the occasional stray annotation
 * ("x2", "(hold)") on an otherwise all-chord line.
 */
export function isChordLine(line: string): boolean {
	const tokens = line.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return false;
	const parsed = tokens.filter((t) => parseChordToken(t) !== null).length;
	return parsed / tokens.length >= 0.8;
}

const SECTION_KEYWORDS: Record<string, string> = {
	verse: 'Verse',
	chorus: 'Chorus',
	bridge: 'Bridge',
	prechorus: 'Pre-Chorus',
	intro: 'Intro',
	outro: 'Outro',
	tag: 'Tag',
	interlude: 'Interlude'
};

/** Matches a standalone section-label line, e.g. "Verse1", "Chorus", "Pre-Chorus:". */
export const SECTION_LABEL_RE =
	/^\s*(verse|chorus|bridge|pre[\s-]?chorus|intro|outro|tag|interlude)\s*(\d+)?\s*:?\s*$/i;

/**
 * If `line` is a recognized section-label line, return its normalized label
 * (e.g. "Verse1" -> "Verse 1", "PRE-CHORUS" -> "Pre-Chorus"). Otherwise null.
 */
export function matchSectionLabel(line: string): string | null {
	const m = SECTION_LABEL_RE.exec(line);
	if (!m) return null;
	const kw = m[1].toLowerCase().replace(/[\s-]/g, '');
	const base = SECTION_KEYWORDS[kw];
	if (!base) return null;
	const num = m[2];
	return num ? `${base} ${num}` : base;
}

/** Parse every whitespace-separated token in a chord line, with its column. */
function tokenizeChordLine(line: string, sourceKey: KeyName): { chord: Chord; column: number }[] {
	const result: { chord: Chord; column: number }[] = [];
	const re = /\S+/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line))) {
		const token = m[0];
		const parsed = parseChordToken(token);
		const chord = parsed
			? chordToDegree(parsed, sourceKey)
			: { degree: 0, quality: '', raw: token };
		result.push({ chord, column: m.index });
	}
	return result;
}

/** Combine a chord line with the lyric line beneath it, aligning by column. */
function alignChordLine(chordLine: string, lyricLine: string, sourceKey: KeyName): Line {
	const lyrics = normalizeLyricText(lyricLine);
	const tokens = tokenizeChordLine(chordLine, sourceKey);
	const chords = tokens.map(({ chord, column }) => ({
		chord,
		// Clamp to lyric length: chords past the end of the lyric append at the end.
		index: Math.min(column, lyrics.length)
	}));
	return { lyrics, chords };
}

/** A chord line with no following lyric line (instrumental / chord-only chart). */
function chordOnlyLine(chordLine: string, sourceKey: KeyName): Line {
	const tokens = tokenizeChordLine(chordLine, sourceKey);
	const chords = tokens.map(({ chord, column }) => ({ chord, index: column }));
	return { lyrics: '', chords };
}

export interface ParsePlaintextOptions {
	title?: string;
}

/**
 * Parse a "chords above lyrics" plain-text chart into a `ChartDoc`.
 *
 * `sourceKey` is the key the chord *letters in the text* are actually
 * written in (the shape key, in pnwchords-header terms) — NOT necessarily
 * the song's sounding key. Callers combine this with `parsePatternHeader`
 * (see header.ts) to get the full three-part pattern.
 */
export function parsePlaintextChart(
	text: string,
	sourceKey: KeyName,
	opts: ParsePlaintextOptions = {}
): ChartDoc {
	const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
	const sections: { label?: string; lines: Line[] }[] = [];
	let current: { label?: string; lines: Line[] } = { label: undefined, lines: [] };

	const startSection = (label?: string) => {
		sections.push(current);
		current = { label, lines: [] };
	};

	let i = 0;
	while (i < rawLines.length) {
		const line = rawLines[i];

		if (line.trim() === '') {
			current.lines.push({ lyrics: '', chords: [] });
			i++;
			continue;
		}

		const label = matchSectionLabel(line);
		if (label) {
			startSection(label);
			i++;
			continue;
		}

		if (isChordLine(line)) {
			const next = i + 1 < rawLines.length ? rawLines[i + 1] : undefined;
			const nextIsUsableLyric =
				next !== undefined &&
				next.trim() !== '' &&
				matchSectionLabel(next) === null &&
				!isChordLine(next);

			if (nextIsUsableLyric) {
				current.lines.push(alignChordLine(line, next as string, sourceKey));
				i += 2;
			} else {
				current.lines.push(chordOnlyLine(line, sourceKey));
				i += 1;
			}
			continue;
		}

		// Plain lyric line (no chord line above it).
		current.lines.push({ lyrics: normalizeLyricText(line), chords: [] });
		i++;
	}
	sections.push(current);

	// Drop empty/blank-only scaffolding sections produced when a section
	// boundary is the very first/last thing in the text, or leading blank
	// lines precede the first labeled section.
	const isBlankOnly = (s: { label?: string; lines: Line[] }) =>
		s.label === undefined && s.lines.every((l) => l.lyrics === '' && l.chords.length === 0);
	const finalSections = sections.filter((s) => !isBlankOnly(s));

	return { title: opts.title, sourceKey, sections: finalSections };
}
