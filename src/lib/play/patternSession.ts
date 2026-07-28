/**
 * Pattern-application state machine for play mode (task B3,
 * domain-model.md §1 "the two distinct transpose operations").
 *
 * Three tiers, deliberately kept apart so casual fiddling never silently
 * overwrites what reopening the song shows (mvp-spec.md F3, acceptance
 * walkthrough steps 3–5):
 *
 *  - `saved`   — the chart's persisted preferred pattern. Only changes when
 *                the user explicitly taps "Save as my pattern"; this is what
 *                the song opens to next time, unconditionally.
 *  - `working` — the pattern actually rendered on screen this session. Only
 *                changes when the transpose sheet's footer is pressed (either
 *                button) — opening the sheet and turning dials alone must
 *                not touch the live chart.
 *  - `draft`   — the transpose sheet's in-progress scratch pattern. Starts
 *                as a copy of `working` each time the sheet opens; discarded
 *                (reverted to `working`) if the sheet is dismissed any other
 *                way (backdrop tap, Escape).
 *
 * The two transpose intents are kept distinct per domain-model.md §1:
 *  - `withSuggestion` — "change the key": caller picks a `(soundingKey,
 *    shapeKey, capo)` triple, typically from `suggestPatterns` after
 *    `stepSoundingKeyTarget`.
 *  - `withShapeKey` — "change how I play it": `soundingKey` fixed, `capo`
 *    recomputed.
 *  - `withCapo` — the live capo-swap adjustment: `soundingKey` fixed,
 *    `shapeKey` recomputed.
 */

import { derivePattern } from '$lib/theory/pattern';
import { keyNameToPitchClass, pitchClassToKeyName } from '$lib/theory/notes';
import type { Pattern, PitchClass } from '$lib/theory/types';
import { clampFontScale } from './fontScale';

/** A `Pattern` plus the play-mode display prefs that travel with it. */
export interface PlayPattern extends Pattern {
	fontScale: number;
}

export interface PatternSessionState {
	saved: PlayPattern;
	working: PlayPattern;
	draft: PlayPattern;
}

function clone(pattern: PlayPattern): PlayPattern {
	return { ...pattern };
}

/** Start a session: `working` and `draft` both begin equal to the saved pattern. */
export function createPatternSession(saved: PlayPattern): PatternSessionState {
	return { saved: clone(saved), working: clone(saved), draft: clone(saved) };
}

function patternsEqual(a: Pattern, b: Pattern): boolean {
	return a.soundingKey === b.soundingKey && a.shapeKey === b.shapeKey && a.capo === b.capo;
}

/** Whether the sheet's draft differs from what's currently on screen. */
export function isDraftDirty(state: PatternSessionState): boolean {
	return (
		!patternsEqual(state.draft, state.working) || state.draft.fontScale !== state.working.fontScale
	);
}

/** Whether `working` (what's on screen) differs from `saved` (what reopening the song shows). */
export function isSessionOnly(state: PatternSessionState): boolean {
	return (
		!patternsEqual(state.working, state.saved) || state.working.fontScale !== state.saved.fontScale
	);
}

/** Open the transpose sheet: reset `draft` to whatever is currently on screen. */
export function openDraft(state: PatternSessionState): PatternSessionState {
	return { ...state, draft: clone(state.working) };
}

/** Dismiss the sheet without applying: revert `draft` back to `working`. */
export function cancelDraft(state: PatternSessionState): PatternSessionState {
	return { ...state, draft: clone(state.working) };
}

/**
 * Intent 2 ("change how I play it", domain-model.md §1): keep `soundingKey`,
 * pick a new `shapeKey`, recompute `capo`.
 */
export function withShapeKey(state: PatternSessionState, shapeKey: string): PatternSessionState {
	const derived = derivePattern({ soundingKey: state.draft.soundingKey, shapeKey });
	return { ...state, draft: { ...derived, fontScale: state.draft.fontScale } };
}

/**
 * The capo-stepper adjustment (domain-model.md §1): keep `soundingKey`, move
 * `capo`, recompute `shapeKey` in the opposite direction.
 */
export function withCapo(state: PatternSessionState, capo: number): PatternSessionState {
	const derived = derivePattern({ soundingKey: state.draft.soundingKey, capo });
	return { ...state, draft: { ...derived, fontScale: state.draft.fontScale } };
}

/**
 * The transpose sheet's "Play in key" picker (task D3): keep `shapeKey`,
 * pick a new `soundingKey`, recompute `capo`. Mirrors `withShapeKey` with
 * the fixed/free roles swapped — together the two calls implement the
 * "play in key K, with shape S" mental model directly:
 * `derivePattern({soundingKey: K, shapeKey: S})`.
 */
export function withSoundingKey(
	state: PatternSessionState,
	soundingKey: string
): PatternSessionState {
	const derived = derivePattern({ soundingKey, shapeKey: state.draft.shapeKey });
	return { ...state, draft: { ...derived, fontScale: state.draft.fontScale } };
}

/**
 * Intent 1 ("change the key", domain-model.md §1): apply a full
 * `(soundingKey, shapeKey, capo)` triple, typically a `suggestPatterns` row
 * for a new target sounding key.
 */
export function withSuggestion(
	state: PatternSessionState,
	suggestion: Pattern
): PatternSessionState {
	return { ...state, draft: { ...suggestion, fontScale: state.draft.fontScale } };
}

/** Update the draft's font scale (A-/A+ stepper inside the sheet), clamped to 14–28px. */
export function withFontScale(state: PatternSessionState, fontScale: number): PatternSessionState {
	return { ...state, draft: { ...state.draft, fontScale: clampFontScale(fontScale) } };
}

/**
 * Update the font scale of the live view directly (the bottom bar's A-/A+
 * stepper, outside the transpose sheet) — takes effect immediately, session
 * only, per mvp-spec.md F3: font scale "persisted on the pattern record
 * ... when 'Save as my pattern' pressed, else session-only." `draft` is kept
 * in sync so a later "Save as my pattern" (even without touching transpose
 * controls) persists the font size currently on screen.
 */
export function withWorkingFontScale(
	state: PatternSessionState,
	fontScale: number
): PatternSessionState {
	const clamped = clampFontScale(fontScale);
	const working = { ...state.working, fontScale: clamped };
	return { ...state, working, draft: { ...state.draft, fontScale: clamped } };
}

/** "Just for now": apply the draft to the live view only; `saved` is untouched. */
export function applyJustForNow(state: PatternSessionState): PatternSessionState {
	const working = clone(state.draft);
	return { ...state, working, draft: clone(working) };
}

/**
 * "Save as my pattern": apply the draft to the live view *and* to `saved`.
 * Callers persist `state.draft` to the DB first (via `repo.savePattern`)
 * and only call this once that succeeds.
 */
export function applySaveAsMyPattern(state: PatternSessionState): PatternSessionState {
	const applied = clone(state.draft);
	return { saved: clone(applied), working: clone(applied), draft: clone(applied) };
}

/**
 * Step a sounding key by one semitone (the sounding-key stepper's ±1 button,
 * domain-model.md §1 intent 1). Purely a target-key computation — callers
 * feed the result into `suggestPatterns` to rank shape/capo suggestions for
 * it, then `withSuggestion` to actually apply one.
 */
export function stepSoundingKeyTarget(soundingKey: string, direction: 1 | -1): string {
	const pc = keyNameToPitchClass(soundingKey);
	if (pc === null) {
		throw new Error(`stepSoundingKeyTarget: unrecognized key "${soundingKey}"`);
	}
	const next = (((pc + direction) % 12) + 12) % 12;
	return pitchClassToKeyName(next as PitchClass);
}
