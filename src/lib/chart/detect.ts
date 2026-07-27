/**
 * Format sniffing and the one-call "grab this pasted text" convenience API.
 */

import type { ChartDoc, KeyName } from '../theory/types';
import { parseChordPro } from './chordpro';
import { parsePatternHeader, type PatternHeaderResult } from './header';
import { parsePlaintextChart } from './plaintext';

const CHORDPRO_DIRECTIVE_RE = /\{[a-zA-Z_][a-zA-Z0-9_-]*(?::[^}]*)?\}/;
const INLINE_CHORD_RE = /\[[A-G](?:#{1,2}|b{1,2}|♯|♭)?[^[\]]*\]/;

/** Sniff whether `text` is ChordPro (directives and/or inline `[chords]`) or plaintext. */
export function detectFormat(text: string): 'chordpro' | 'plaintext' {
	if (CHORDPRO_DIRECTIVE_RE.test(text) || INLINE_CHORD_RE.test(text)) return 'chordpro';
	return 'plaintext';
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
	const sourceKey: KeyName = header.shapeKey ?? header.soundingKey ?? 'C';
	const doc = parsePlaintextChart(header.remainingText, sourceKey);
	return { doc, header };
}
