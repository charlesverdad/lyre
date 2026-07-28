/**
 * Chart-region detection for noisy pasted TEXT (task D1, mvp-spec.md F2).
 *
 * A select-all + copy off a real chord-site page doesn't hand back just the
 * chart: it's nav menus, a search box, "Trending" widgets, the chart itself,
 * then comments/related-posts/footer chrome. This module scores every line
 * for "chart signal" and finds the single densest contiguous window, so the
 * paste flow can parse just that window instead of choking on the whole
 * page dump.
 *
 * Deliberately text-only heuristics (no DOM) — this runs on whatever the
 * user's clipboard happened to contain, same as the existing chord-line/
 * section-label heuristics in `plaintext.ts` this module builds on.
 */

import { isChordLine, matchSectionLabel } from './plaintext';
import { looksLikePatternHeaderLine } from './header';
import { detectFormat } from './detect';

export interface ExtractRegionResult {
	chartText: string;
	confidence: 'high' | 'low';
}

type LineKind = 'chord' | 'section' | 'header' | 'lyric-adjacent' | 'blank' | 'noise';

/** Inside a candidate window, how many consecutive non-signal lines are tolerated (stanza breaks). */
const MAX_INTERNAL_GAP = 3;
/** How far above a window's start we'll look for a pattern-header line to pull in. */
const HEADER_LOOKBACK = 5;
/** Minimum signal-line density (of the window) to call the extraction "high" confidence. */
const HIGH_CONFIDENCE_DENSITY = 0.4;
/** Minimum signal lines in the window for "high" confidence — one lone chord line isn't a chart. */
const HIGH_CONFIDENCE_MIN_SIGNAL = 2;

function classifyLines(lines: string[]): LineKind[] {
	const kinds: LineKind[] = lines.map((line): LineKind => {
		if (line.trim() === '') return 'blank';
		if (isChordLine(line)) return 'chord';
		if (matchSectionLabel(line)) return 'section';
		if (looksLikePatternHeaderLine(line)) return 'header';
		return 'noise';
	});
	// Second pass: a non-chord line directly following a chord line is the
	// lyric it's aligned to, even though on its own it carries no chord/
	// section/header signal.
	for (let i = 1; i < kinds.length; i++) {
		if (kinds[i] === 'noise' && kinds[i - 1] === 'chord') kinds[i] = 'lyric-adjacent';
	}
	return kinds;
}

function isSignalKind(kind: LineKind): boolean {
	return kind === 'chord' || kind === 'section' || kind === 'header' || kind === 'lyric-adjacent';
}

/**
 * Fraction of non-blank lines in `text` that carry chart signal (chord/
 * section/header/lyric-adjacent). Used both internally and by callers
 * (the paste pipeline, `grabFromHtml`'s raw-text path) to decide whether a
 * pasted blob looks like a clean chart already or needs region extraction
 * run over it first.
 */
export function chartSignalDensity(text: string): number {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const kinds = classifyLines(lines).filter((k) => k !== 'blank');
	if (kinds.length === 0) return 0;
	return kinds.filter(isSignalKind).length / kinds.length;
}

/** True when `text`'s whole-document chart-signal density is low enough to be worth region-extracting first. */
export function looksNoisy(text: string, threshold = HIGH_CONFIDENCE_DENSITY): boolean {
	return chartSignalDensity(text) < threshold;
}

interface Window {
	start: number;
	end: number;
	signalCount: number;
}

/**
 * Slide through `kinds`, growing a window on every signal line and closing
 * it once a run of `MAX_INTERNAL_GAP + 1` **noise** lines is seen. Blank
 * lines never close a window on their own, no matter how many run together
 * — a verse and the bridge that follows it are routinely separated by
 * several blank lines in a real chart (stanza breaks), and closing the
 * window there would silently delete the bridge from the extracted text.
 * Only a genuine run of unrelated page chrome (nav/footer prose, classified
 * `noise`) closes a window. Returns every candidate window found, in
 * document order.
 */
function findWindows(kinds: LineKind[]): Window[] {
	const windows: Window[] = [];
	let cur: Window | null = null;
	let noiseGap = 0;

	for (let i = 0; i < kinds.length; i++) {
		const kind = kinds[i];
		if (isSignalKind(kind)) {
			if (!cur) {
				cur = { start: i, end: i, signalCount: 1 };
			} else {
				cur.end = i;
				cur.signalCount++;
			}
			noiseGap = 0;
		} else if (kind === 'noise' && cur) {
			noiseGap++;
			if (noiseGap > MAX_INTERNAL_GAP) {
				windows.push(cur);
				cur = null;
				noiseGap = 0;
			}
		}
		// Blank lines: no-op — they neither extend nor close a window, they
		// just ride along inside whatever window (if any) is currently open.
	}
	if (cur) windows.push(cur);
	return windows;
}

/**
 * Belt-and-braces safety net on top of `findWindows`'s "only noise closes a
 * window" rule: merge any two adjacent windows whose gap is exclusively
 * blank lines (no noise at all). Should be a no-op given `findWindows`
 * already never splits on blank-only runs, but guards against ever
 * silently dropping a real section between two windows again.
 */
function mergeBlankOnlyGaps(kinds: LineKind[], windows: Window[]): Window[] {
	if (windows.length <= 1) return windows;
	const merged: Window[] = [{ ...windows[0] }];
	for (let i = 1; i < windows.length; i++) {
		const prev = merged[merged.length - 1];
		const next = windows[i];
		const between = kinds.slice(prev.end + 1, next.start);
		const allBlank = between.every((k) => k === 'blank');
		if (allBlank) {
			prev.end = next.end;
			prev.signalCount += next.signalCount;
		} else {
			merged.push({ ...next });
		}
	}
	return merged;
}

/** Extend `start` backward (up to `HEADER_LOOKBACK` lines, skipping only blanks) to catch a preceding pattern-header line. */
function pullInHeader(kinds: LineKind[], start: number): number {
	const limit = Math.max(0, start - HEADER_LOOKBACK);
	for (let i = start - 1; i >= limit; i--) {
		if (kinds[i] === 'header') return i;
		if (kinds[i] !== 'blank') break; // real noise between here and the window — stop looking.
	}
	return start;
}

/**
 * Find the maximal contiguous chart-signal region in `text` and return just
 * that window, trimmed of leading/trailing noise. Falls back to the whole
 * (trimmed) text with `confidence: 'low'` when no chord-line signal is found
 * at all, so callers can still attempt a parse and fail gracefully rather
 * than silently discarding user input.
 */
export function extractChartRegion(text: string): ExtractRegionResult {
	const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
	const kinds = classifyLines(rawLines);
	const windows = mergeBlankOnlyGaps(kinds, findWindows(kinds));

	if (windows.length === 0) {
		return { chartText: text.trim(), confidence: 'low' };
	}

	const best = windows.reduce((a, b) => (b.signalCount > a.signalCount ? b : a));
	const start = pullInHeader(kinds, best.start);

	const chartText = rawLines
		.slice(start, best.end + 1)
		.join('\n')
		.trim();
	const windowLen = best.end - start + 1;
	const density = best.signalCount / windowLen;
	const confidence: ExtractRegionResult['confidence'] =
		density >= HIGH_CONFIDENCE_DENSITY && best.signalCount >= HIGH_CONFIDENCE_MIN_SIGNAL
			? 'high'
			: 'low';

	return { chartText, confidence };
}

export interface NoisyPasteResolution {
	chartText: string;
	/** True when extraction actually changed the text (a real trim happened, not a no-op). */
	trimmedNoise: boolean;
}

/**
 * Best-effort noisy-paste handling, shared by every place raw pasted/grabbed
 * text enters the app (the paste flow's `deriveChartParseState` and
 * `grabFromHtml`'s raw-text path): when `text` is plain "chords above
 * lyrics" (ChordPro is always already-structured, never a raw page dump)
 * and its whole-document chart-signal density is low, run region extraction
 * and use its result if extraction was confident. Otherwise returns `text`
 * unchanged — a no-op for clean pastes and for anything extraction wasn't
 * sure about, so a low-confidence guess never silently discards content the
 * caller could still show a parse-failure message for.
 */
export function resolveNoisyPaste(text: string): NoisyPasteResolution {
	if (detectFormat(text) !== 'plaintext' || !looksNoisy(text)) {
		return { chartText: text, trimmedNoise: false };
	}
	const region = extractChartRegion(text);
	if (region.confidence !== 'high' || !region.chartText.trim()) {
		return { chartText: text, trimmedNoise: false };
	}
	return { chartText: region.chartText, trimmedNoise: region.chartText.trim() !== text.trim() };
}
