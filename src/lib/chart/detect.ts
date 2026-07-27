/**
 * Format sniffing and the one-call "grab this pasted text" convenience API.
 */

import { parseChordToken } from '../theory/chords';
import { pitchClassToKeyName } from '../theory/notes';
import type { ChartDoc, KeyName, PitchClass } from '../theory/types';
import { parseChordPro } from './chordpro';
import { parsePatternHeader, type PatternHeaderResult } from './header';
import { isChordLine, parsePlaintextChart } from './plaintext';

const CHORDPRO_DIRECTIVE_RE = /\{[a-zA-Z_][a-zA-Z0-9_-]*(?::[^}]*)?\}/;
const INLINE_CHORD_RE = /\[[A-G](?:#{1,2}|b{1,2}|♯|♭)?[^[\]]*\]/;

/** Sniff whether `text` is ChordPro (directives and/or inline `[chords]`) or plaintext. */
export function detectFormat(text: string): 'chordpro' | 'plaintext' {
	if (CHORDPRO_DIRECTIVE_RE.test(text) || INLINE_CHORD_RE.test(text)) return 'chordpro';
	return 'plaintext';
}

/**
 * When no pattern header states a key, infer the plaintext chart's source
 * key from the chord letters actually present, since a bare chord chart
 * carries no other explicit key statement.
 *
 * Heuristic: prefer the root of the LAST chord in the doc if its quality is
 * a plain major triad ("" or "maj") — songs overwhelmingly resolve back to
 * their tonic — otherwise fall back to the root of the FIRST chord (e.g. a
 * chart that fades out on a non-tonic chord, or whose final line is a
 * turnaround). Returns `undefined` if the text has no recognizable chords
 * at all (e.g. lyrics-only paste).
 */
export function inferSourceKeyFromChords(text: string): KeyName | undefined {
	const roots: { root: PitchClass; quality: string }[] = [];
	for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
		if (!isChordLine(line)) continue;
		for (const token of line.trim().split(/\s+/).filter(Boolean)) {
			const parsed = parseChordToken(token);
			if (parsed && !parsed.noChord) roots.push({ root: parsed.root, quality: parsed.quality });
		}
	}
	if (roots.length === 0) return undefined;

	const last = roots[roots.length - 1];
	const chosen = last.quality === '' || last.quality === 'maj' ? last : roots[0];
	return pitchClassToKeyName(chosen.root);
}

export interface ParseChartResult {
	doc: ChartDoc;
	header: PatternHeaderResult;
}

/**
 * Parse arbitrary pasted/grabbed chart text (ChordPro or "chords above
 * lyrics" plaintext) into a `ChartDoc` plus whatever pattern header info
 * (`Original in Ab. Capo 1, play in G.` and friends) could be extracted.
 *
 * `doc.sourceKey` is always the key the chart's chord letters are literally
 * written in (the "shape key" in pattern-header terms) — see header.ts.
 */
export function parseChart(text: string): ParseChartResult {
	const format = detectFormat(text);

	if (format === 'chordpro') {
		const header = parsePatternHeader(text);
		const doc = parseChordPro(text, { sourceKey: header.shapeKey ?? header.soundingKey });
		const filledHeader: PatternHeaderResult = {
			soundingKey: header.soundingKey ?? doc.sourceKey,
			shapeKey: header.shapeKey ?? doc.sourceKey,
			capo: header.capo ?? 0,
			remainingText: header.remainingText
		};
		return { doc, header: filledHeader };
	}

	const header = parsePatternHeader(text);
	const sourceKey: KeyName =
		header.shapeKey ?? header.soundingKey ?? inferSourceKeyFromChords(header.remainingText) ?? 'C';
	const doc = parsePlaintextChart(header.remainingText, sourceKey);
	return { doc, header };
}
