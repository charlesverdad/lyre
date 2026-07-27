/**
 * Play-mode font scale clamp (docs/design.md "Type": "pinch/stepper
 * scalable 14–28px, persisted per pattern"; mvp-spec.md F3).
 */

export const MIN_FONT_SCALE = 14;
export const MAX_FONT_SCALE = 28;
export const DEFAULT_FONT_SCALE = 17;
export const FONT_SCALE_STEP = 1;

/** Clamp a font size to the play-mode range, defaulting when not a finite number. */
export function clampFontScale(px: number | undefined): number {
	if (px === undefined || !Number.isFinite(px)) return DEFAULT_FONT_SCALE;
	return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(px)));
}

/** Step the font scale by one increment, clamped to range. */
export function stepFontScale(current: number, direction: 1 | -1): number {
	return clampFontScale(current + direction * FONT_SCALE_STEP);
}
