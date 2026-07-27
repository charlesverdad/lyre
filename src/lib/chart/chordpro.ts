/**
 * ChordPro <-> ChartDoc (domain-model.md §3): inline `[G]` chords at exact
 * indices, `{title:}`/`{key:}`/`{comment:}` directives, and
 * `{soc}/{eoc}/{sov}/{eov}/{sob}/{eob}` section markers (plus their long-form
 * `{start_of_chorus}` aliases and inline labels).
 *
 * `chartDocToChordPro` is the inverse of `parseChordPro`: serializing a
 * `ChartDoc` and re-parsing the result reproduces the original doc, because
 * chords are carried as key-relative degrees (rendered in `doc.sourceKey`
 * on the way out, re-parsed against the same `{key:}` on the way back in).
 */

import { chordToDegree, parseChordToken, renderChord } from '../theory/chords';
import type { Chord, ChartDoc, KeyName, Line } from '../theory/types';
import { matchSectionLabel, normalizeLyricText } from './plaintext';

const TITLE_RE = /^\{(?:title|t)\s*:\s*(.*?)\s*\}\s*$/i;
const KEY_RE = /^\{key\s*:\s*(.*?)\s*\}\s*$/i;
const COMMENT_RE = /^\{(?:comment|c)\s*:\s*(.*?)\s*\}\s*$/i;
const ANY_DIRECTIVE_RE = /^\{.*\}\s*$/;

type SectionKeyword = 'verse' | 'chorus' | 'bridge';

const DEFAULT_LABEL: Record<SectionKeyword, string> = {
	verse: 'Verse',
	chorus: 'Chorus',
	bridge: 'Bridge'
};

const SHORT_TO_KEYWORD: Record<string, SectionKeyword> = { v: 'verse', c: 'chorus', b: 'bridge' };

const LONG_START_RE = /^\{start_of_(verse|chorus|bridge)(?:\s*:\s*(.*?))?\}\s*$/i;
const LONG_END_RE = /^\{end_of_(verse|chorus|bridge)\}\s*$/i;
const SHORT_START_RE = /^\{so([vcb])(?:\s*:\s*(.*?))?\}\s*$/i;
const SHORT_END_RE = /^\{eo([vcb])\}\s*$/i;

function matchSectionBoundary(line: string): { type: 'start' | 'end'; label?: string } | null {
	const trimmed = line.trim();

	let m = LONG_START_RE.exec(trimmed);
	if (m) {
		const kw = m[1].toLowerCase() as SectionKeyword;
		return { type: 'start', label: m[2]?.trim() || DEFAULT_LABEL[kw] };
	}
	if (LONG_END_RE.test(trimmed)) return { type: 'end' };

	m = SHORT_START_RE.exec(trimmed);
	if (m) {
		const kw = SHORT_TO_KEYWORD[m[1].toLowerCase()];
		return { type: 'start', label: m[2]?.trim() || DEFAULT_LABEL[kw] };
	}
	if (SHORT_END_RE.test(trimmed)) return { type: 'end' };

	return null;
}

/** Parse a line of lyrics with inline `[Chord]` markers into a `Line`. */
function parseInlineLine(line: string, sourceKey: KeyName): Line {
	let lyrics = '';
	const chords: { chord: Chord; index: number }[] = [];
	const re = /\[([^\]]*)\]/g;
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line))) {
		lyrics += line.slice(lastIndex, m.index);
		const token = m[1];
		const parsed = parseChordToken(token);
		const chord = parsed
			? chordToDegree(parsed, sourceKey)
			: { degree: 0, quality: '', raw: token };
		chords.push({ chord, index: lyrics.length });
		lastIndex = re.lastIndex;
	}
	lyrics += line.slice(lastIndex);
	return { lyrics: normalizeLyricText(lyrics), chords };
}

/** Render a `Line` back to inline ChordPro, chords rendered in `key`. */
function serializeLine(line: Line, key: KeyName): string {
	if (line.chords.length === 0) return line.lyrics;
	const sorted = [...line.chords].sort((a, b) => a.index - b.index);
	let out = '';
	let last = 0;
	for (const { chord, index } of sorted) {
		out += line.lyrics.slice(last, index);
		out += `[${renderChord(chord, key)}]`;
		last = index;
	}
	out += line.lyrics.slice(last);
	return out;
}

export interface ParseChordProOptions {
	/** Fallback key for inline chords if the text has no `{key:}` directive. */
	sourceKey?: KeyName;
}

/** Parse a ChordPro document into a `ChartDoc`. */
export function parseChordPro(text: string, opts: ParseChordProOptions = {}): ChartDoc {
	const rawLines = text.replace(/\r\n?/g, '\n').split('\n');

	let title: string | undefined;
	let sourceKey = opts.sourceKey;
	const sections: { label?: string; lines: Line[] }[] = [];
	let current: { label?: string; lines: Line[] } = { label: undefined, lines: [] };

	const startSection = (label?: string) => {
		sections.push(current);
		current = { label, lines: [] };
	};

	for (const line of rawLines) {
		if (line.trim() === '') {
			current.lines.push({ lyrics: '', chords: [] });
			continue;
		}

		const titleMatch = TITLE_RE.exec(line);
		if (titleMatch) {
			title = titleMatch[1];
			continue;
		}

		const keyMatch = KEY_RE.exec(line);
		if (keyMatch) {
			sourceKey = keyMatch[1].trim();
			continue;
		}

		const commentMatch = COMMENT_RE.exec(line);
		if (commentMatch) {
			// ChartDoc has no first-class "comment" concept; keep it visible as
			// a plain (chordless) line rather than silently dropping it.
			current.lines.push({ lyrics: normalizeLyricText(commentMatch[1]), chords: [] });
			continue;
		}

		const boundary = matchSectionBoundary(line);
		if (boundary) {
			startSection(boundary.type === 'start' ? boundary.label : undefined);
			continue;
		}

		const plainLabel = matchSectionLabel(line);
		if (plainLabel) {
			startSection(plainLabel);
			continue;
		}

		// Unrecognized directive (e.g. {tempo: 90}) — not representable in
		// ChartDoc, so it's dropped rather than misread as a lyric line.
		if (ANY_DIRECTIVE_RE.test(line.trim())) continue;

		current.lines.push(parseInlineLine(line, sourceKey ?? 'C'));
	}
	sections.push(current);

	const isBlankOnly = (s: { label?: string; lines: Line[] }) =>
		s.label === undefined && s.lines.every((l) => l.lyrics === '' && l.chords.length === 0);
	const finalSections = sections.filter((s) => !isBlankOnly(s));

	return { title, sourceKey: sourceKey ?? 'C', sections: finalSections };
}

function sectionKeyword(label: string): SectionKeyword | null {
	const l = label.toLowerCase();
	if (l.startsWith('verse')) return 'verse';
	if (l.startsWith('chorus')) return 'chorus';
	if (l.startsWith('bridge')) return 'bridge';
	return null;
}

/**
 * Serialize a `ChartDoc` to ChordPro text. Verse/Chorus/Bridge sections use
 * `{start_of_*: Label}`/`{end_of_*}` wrappers; other section labels
 * (Intro, Outro, Tag, Pre-Chorus, Interlude, custom) fall back to a plain
 * label line, which `parseChordPro` also recognizes — so the round trip
 * `ChartDoc -> ChordPro -> ChartDoc` is lossless.
 */
export function chartDocToChordPro(doc: ChartDoc): string {
	const lines: string[] = [];
	if (doc.title) lines.push(`{title: ${doc.title}}`);
	lines.push(`{key: ${doc.sourceKey}}`);

	for (const section of doc.sections) {
		const kw = section.label ? sectionKeyword(section.label) : null;
		if (section.label && kw) {
			lines.push(`{start_of_${kw}: ${section.label}}`);
		} else if (section.label) {
			lines.push(section.label);
		}

		for (const line of section.lines) {
			lines.push(serializeLine(line, doc.sourceKey));
		}

		if (section.label && kw) {
			lines.push(`{end_of_${kw}}`);
		}
	}

	return lines.join('\n');
}
