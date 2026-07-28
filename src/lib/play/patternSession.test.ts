import { describe, expect, it } from 'vitest';
import { suggestPatterns } from '$lib/theory/pattern';
import {
	applyJustForNow,
	applySaveAsMyPattern,
	cancelDraft,
	createPatternSession,
	isDraftDirty,
	isSessionOnly,
	openDraft,
	stepSoundingKeyTarget,
	withCapo,
	withFontScale,
	withShapeKey,
	withSoundingKey,
	withSuggestion,
	withWorkingFontScale
} from './patternSession';

const GOODNESS: import('./patternSession').PlayPattern = {
	soundingKey: 'Ab',
	shapeKey: 'G',
	capo: 1,
	fontScale: 17
};

describe('createPatternSession', () => {
	it('starts working and draft equal to saved', () => {
		const state = createPatternSession(GOODNESS);
		expect(state.working).toEqual(GOODNESS);
		expect(state.draft).toEqual(GOODNESS);
		expect(isDraftDirty(state)).toBe(false);
		expect(isSessionOnly(state)).toBe(false);
	});
});

describe('intent 2 — change how I play it (withShapeKey)', () => {
	it('keeps soundingKey, recomputes capo', () => {
		let state = createPatternSession(GOODNESS);
		state = withShapeKey(state, 'C');
		expect(state.draft).toMatchObject({ soundingKey: 'Ab', shapeKey: 'C' });
		// Ab (8) - C (0) = 8.
		expect(state.draft.capo).toBe(8);
	});
});

describe('capo stepper (withCapo)', () => {
	it('keeps soundingKey, recomputes shapeKey', () => {
		let state = createPatternSession(GOODNESS);
		state = withCapo(state, 4);
		expect(state.draft.soundingKey).toBe('Ab');
		expect(state.draft.capo).toBe(4);
		// Ab (8) - 4 = 4 -> E.
		expect(state.draft.shapeKey).toBe('E');
	});
});

describe('"Play in key" picker (withSoundingKey)', () => {
	it('keeps shapeKey, recomputes capo', () => {
		let state = createPatternSession(GOODNESS);
		state = withSoundingKey(state, 'A');
		expect(state.draft.shapeKey).toBe('G');
		// A (9) - G (7) = 2.
		expect(state.draft.capo).toBe(2);
		expect(state.draft.soundingKey).toBe('A');
	});

	it('matches derivePattern({soundingKey, shapeKey}) directly (task D3 mental model)', () => {
		let state = createPatternSession(GOODNESS);
		state = withSoundingKey(state, 'B');
		state = withShapeKey(state, 'C');
		// Selecting key K then shape S = derivePattern({soundingKey: K, shapeKey: S}).
		// B (11) - C (0) = 11.
		expect(state.draft).toMatchObject({ soundingKey: 'B', shapeKey: 'C', capo: 11 });
	});

	it('review fix: auto-switches shape when the current one would need capo > maxCapo', () => {
		// GOODNESS is G shapes. F# (6) - G (7) mod 12 = 11 -> unplayable: without
		// the auto-switch this would leave the G chip selected *and* disabled,
		// and "Save as my pattern" would persist an unplayable capo-11 pattern.
		let state = createPatternSession(GOODNESS);
		state = withSoundingKey(state, 'F#');
		expect(state.draft.soundingKey).toBe('F#');
		expect(state.draft.capo).toBeLessThanOrEqual(9);
		// F# (6): comfort shapes available at capo <=9 are E(2), D(4), C(6), A(9)
		// — E is lowest capo, so it's the auto-switch pick.
		expect(state.draft).toMatchObject({ shapeKey: 'E', capo: 2 });
	});

	it('does not auto-switch when the current shape stays within maxCapo', () => {
		let state = createPatternSession(GOODNESS);
		state = withSoundingKey(state, 'A');
		// A (9) - G (7) = 2, well within maxCapo -> shape stays G.
		expect(state.draft).toMatchObject({ shapeKey: 'G', capo: 2 });
	});
});

describe('intent 1 — change the key (stepSoundingKeyTarget + withSuggestion)', () => {
	it('steps the target sounding key by a semitone', () => {
		expect(stepSoundingKeyTarget('A', 1)).toBe('Bb');
		expect(stepSoundingKeyTarget('A', -1)).toBe('Ab');
		expect(stepSoundingKeyTarget('C', -1)).toBe('B');
	});

	it('ranks suggestions for the new target key, comfort order then lowest capo', () => {
		const suggestions = suggestPatterns('G');
		expect(suggestions[0]).toMatchObject({ shapeKey: 'G', capo: 0 });
	});

	it('applies a chosen suggestion to the draft, leaving working/saved untouched', () => {
		let state = createPatternSession({ soundingKey: 'A', shapeKey: 'G', capo: 2, fontScale: 17 });
		const target = stepSoundingKeyTarget(state.working.soundingKey, -1);
		expect(target).toBe('Ab');
		const suggestion = suggestPatterns(target)[0];
		state = withSuggestion(state, suggestion);
		expect(state.draft).toMatchObject(suggestion);
		expect(state.working).toEqual({ soundingKey: 'A', shapeKey: 'G', capo: 2, fontScale: 17 });
		expect(isDraftDirty(state)).toBe(true);
	});
});

describe('acceptance walkthrough (mvp-spec.md), steps 3–5', () => {
	it('key-up (shapes stay G) -> Save as my pattern -> badge reflects it, and it is now the saved pattern', () => {
		// Step 2: grabbed pattern is Ab/G/capo1.
		let state = createPatternSession({ soundingKey: 'Ab', shapeKey: 'G', capo: 1, fontScale: 17 });

		// Step 3: "bump capo to 2 (shapes stay G) -> sounding key recomputes to A" is,
		// precisely, intent 1 (domain-model.md §1: the sheet's Capo stepper instead
		// keeps *soundingKey* fixed and recomputes shape — see the `withCapo`
		// describe block above): step the target sounding key up a semitone, then
		// apply the G-shapes suggestion for it.
		state = openDraft(state);
		const target = stepSoundingKeyTarget(state.draft.soundingKey, 1);
		expect(target).toBe('A');
		const gShapes = suggestPatterns(target).find((s) => s.shapeKey === 'G');
		expect(gShapes).toMatchObject({ shapeKey: 'G', capo: 2 });
		state = withSuggestion(state, gShapes!);
		expect(state.draft).toMatchObject({ soundingKey: 'A', shapeKey: 'G', capo: 2 });

		state = applySaveAsMyPattern(state);
		expect(state.working).toMatchObject({ soundingKey: 'A', shapeKey: 'G', capo: 2 });
		expect(state.saved).toMatchObject({ soundingKey: 'A', shapeKey: 'G', capo: 2 });
		expect(isSessionOnly(state)).toBe(false);

		// Step 5: key-down twice from A -> G, "Just for now".
		state = openDraft(state);
		const secondTarget = stepSoundingKeyTarget(
			stepSoundingKeyTarget(state.working.soundingKey, -1),
			-1
		);
		expect(secondTarget).toBe('G');
		const best = suggestPatterns(secondTarget)[0];
		expect(best).toMatchObject({ shapeKey: 'G', capo: 0 });
		state = withSuggestion(state, best);
		state = applyJustForNow(state);

		expect(state.working).toMatchObject({ soundingKey: 'G', shapeKey: 'G', capo: 0 });
		// Saved pattern is unchanged — reopening the song later shows capo 2 again.
		expect(state.saved).toMatchObject({ soundingKey: 'A', shapeKey: 'G', capo: 2 });
		expect(isSessionOnly(state)).toBe(true);
	});
});

describe('sheet dismissal without a footer action', () => {
	it('cancelDraft reverts draft to working, leaving working/saved untouched', () => {
		let state = createPatternSession(GOODNESS);
		state = openDraft(state);
		state = withCapo(state, 5);
		expect(isDraftDirty(state)).toBe(true);

		state = cancelDraft(state);
		expect(state.draft).toEqual(state.working);
		expect(state.working).toEqual(GOODNESS);
		expect(state.saved).toEqual(GOODNESS);
	});
});

describe('withFontScale', () => {
	it('clamps the draft font scale and only affects the draft', () => {
		let state = createPatternSession(GOODNESS);
		state = withFontScale(state, 40);
		expect(state.draft.fontScale).toBe(28);
		expect(state.working.fontScale).toBe(17);
	});
});

describe('withWorkingFontScale', () => {
	it('applies immediately to working (and keeps draft in sync), leaving saved untouched', () => {
		let state = createPatternSession(GOODNESS);
		state = withWorkingFontScale(state, 22);
		expect(state.working.fontScale).toBe(22);
		expect(state.draft.fontScale).toBe(22);
		expect(state.saved.fontScale).toBe(17);
		expect(isSessionOnly(state)).toBe(true);
	});
});
