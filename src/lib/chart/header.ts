/**
 * Pattern-header parsing (domain-model.md §3, §6): grabbed charts often open
 * with prose stating the three-part pattern, e.g. pnwchords' "Original in
 * Ab. Capo 1, play in G." or simpler "Key: G" / "Capo 2" lines. We extract
 * whatever's stated and use the theory engine's `derivePattern` to complete
 * the triple when exactly two of three parts are known.
 */

import { derivePattern } from '../theory/pattern';
import type { KeyName } from '../theory/types';
import { isChordLine, matchSectionLabel } from './plaintext';

export interface PatternHeaderResult {
	soundingKey?: KeyName;
	shapeKey?: KeyName;
	capo?: number;
	/** Original text with the consumed header line(s) stripped. */
	remainingText: string;
}

const NOTE = '[A-G](?:#{1,2}|b{1,2}|♯|♭)?';

/** pnwchords style: "Original in Ab. Capo 1, play in G." */
const PNWCHORDS_RE = new RegExp(
	`original\\s+in\\s+(${NOTE})\\.?\\s*capo\\s*(\\d+)\\s*,?\\s*play\\s+in\\s+(${NOTE})\\.?`,
	'i'
);

const KEY_RE = new RegExp(`\\bkey\\s*(?:of|:)\\s*(${NOTE})\\b`, 'i');
const CAPO_RE = /\bcapo\s*(?:on)?\s*:?\s*(\d+)/i;
/** "play in X" / "played in X" / "play with X shapes" — a standalone shape-key statement. */
const PLAY_IN_RE = new RegExp(`\\bplay(?:ed)?\\s+(?:in|with)\\s+(${NOTE})(?:\\s+shapes?)?\\b`, 'i');
const DIRECTIVE_LINE_RE = /^\{.*\}\s*$/;

/** How many leading lines we're willing to scan for header content. */
const MAX_HEADER_LINES = 6;

/**
 * True when `line` looks like a pattern-header statement on its own — one of
 * the same shapes `parsePatternHeader` recognizes (pnwchords' "Original in
 * X. Capo n, play in Y.", "Key: X", "Capo n", "play in X"). Exported for
 * `extractRegion.ts`'s noisy-paste chart-region detection, which needs to
 * spot a header line without re-deriving a full pattern from it — single
 * source of truth for "what does a header line look like" stays here.
 */
export function looksLikePatternHeaderLine(line: string): boolean {
	if (line.trim() === '') return false;
	return (
		PNWCHORDS_RE.test(line) || KEY_RE.test(line) || CAPO_RE.test(line) || PLAY_IN_RE.test(line)
	);
}

/**
 * Extract `{soundingKey?, shapeKey?, capo?}` from a chart's first lines,
 * plus the text with those header line(s) removed. Recognizes:
 *  - "Original in <key>. Capo <n>, play in <key>." (pnwchords)
 *  - "Key: <key>" / "Key of <key>"
 *  - "Capo <n>" / "Capo: <n>" / "Capo on <n>th fret"
 *  - "play in <key>" / "played in <key>" / "play with <key> shapes" as a
 *    standalone shape-key statement (e.g. "Key: G, play in A")
 *  - combinations of the above, on the same or separate lines.
 *
 * If exactly two of the three pattern parts end up known but they're
 * mutually inconsistent for `derivePattern` (e.g. an unrecognized key
 * spelling slipped through), we leave the third part undefined instead of
 * throwing — a malformed header shouldn't crash chart parsing.
 */
export function parsePatternHeader(text: string): PatternHeaderResult {
	const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
	let soundingKey: KeyName | undefined;
	let shapeKey: KeyName | undefined;
	let capo: number | undefined;
	const consumed = new Set<number>();

	const scanLimit = Math.min(rawLines.length, MAX_HEADER_LINES);
	for (let i = 0; i < scanLimit; i++) {
		const line = rawLines[i];
		if (line.trim() === '') continue;
		// Section labels, chord lines, and ChordPro directives all signal the
		// header block (if any) has ended — header text is assumed contiguous
		// from the very top of the file.
		if (matchSectionLabel(line) || isChordLine(line) || DIRECTIVE_LINE_RE.test(line.trim())) {
			break;
		}

		const pnw = PNWCHORDS_RE.exec(line);
		if (pnw) {
			soundingKey = pnw[1];
			capo = parseInt(pnw[2], 10);
			shapeKey = pnw[3];
			consumed.add(i);
			continue;
		}

		let matchedAny = false;
		const keyMatch = KEY_RE.exec(line);
		if (keyMatch && soundingKey === undefined) {
			soundingKey = keyMatch[1];
			matchedAny = true;
		}
		const capoMatch = CAPO_RE.exec(line);
		if (capoMatch && capo === undefined) {
			capo = parseInt(capoMatch[1], 10);
			matchedAny = true;
		}
		const playInMatch = PLAY_IN_RE.exec(line);
		if (playInMatch && shapeKey === undefined) {
			shapeKey = playInMatch[1];
			matchedAny = true;
		}

		if (matchedAny) {
			consumed.add(i);
		} else {
			// A non-blank line that isn't header prose either — stop scanning.
			break;
		}
	}

	const knownCount = [soundingKey, shapeKey, capo].filter((v) => v !== undefined).length;
	if (knownCount === 2) {
		try {
			if (shapeKey !== undefined && capo !== undefined) {
				soundingKey = derivePattern({ shapeKey, capo }).soundingKey;
			} else if (soundingKey !== undefined && capo !== undefined) {
				shapeKey = derivePattern({ soundingKey, capo }).shapeKey;
			} else if (soundingKey !== undefined && shapeKey !== undefined) {
				capo = derivePattern({ soundingKey, shapeKey }).capo;
			}
		} catch {
			// Mutually inconsistent/unrecognized key spellings — keep whatever
			// was directly parsed and leave the derived third field undefined
			// rather than throwing out of a text-parsing function.
		}
	}

	const remainingText = rawLines.filter((_, idx) => !consumed.has(idx)).join('\n');

	return { soundingKey, shapeKey, capo, remainingText };
}
