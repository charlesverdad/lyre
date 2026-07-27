// Theme mode: system/light/dark toggle, persisted to localStorage, applied
// via `data-theme` on <html> (see src/routes/layout.css token overrides).
// A blocking inline script in src/app.html applies the persisted choice
// before first paint to avoid a flash of the wrong theme; this module keeps
// reactive UI (e.g. the settings page) in sync with that choice.

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lyre:theme';

let mode = $state<ThemeMode>('system');

function isThemeMode(value: unknown): value is ThemeMode {
	return value === 'system' || value === 'light' || value === 'dark';
}

function applyToDocument(next: ThemeMode) {
	if (typeof document === 'undefined') return;
	if (next === 'system') {
		document.documentElement.removeAttribute('data-theme');
	} else {
		document.documentElement.setAttribute('data-theme', next);
	}
}

/** Call once on app start (e.g. the root layout) to sync in-memory state with localStorage. */
export function initTheme(): void {
	if (typeof localStorage === 'undefined') return;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (isThemeMode(stored)) {
		mode = stored;
	}
	applyToDocument(mode);
}

export function setTheme(next: ThemeMode): void {
	mode = next;
	applyToDocument(next);
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		// Storage unavailable (private browsing, quota) — theme still applies
		// for this session via the DOM attribute.
	}
}

/** Reactive accessor — use as `theme.mode` from a `.svelte` template or `$effect`. */
export const theme = {
	get mode(): ThemeMode {
		return mode;
	}
};
