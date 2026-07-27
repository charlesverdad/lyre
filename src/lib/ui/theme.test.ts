import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// theme.svelte.ts guards every `document`/`localStorage` access behind
// `typeof x === 'undefined'` checks, so a couple of hand-rolled fakes are
// enough to exercise it under Node — no jsdom/happy-dom test environment
// (and no extra devDependency) needed for this file.
//
// The module holds its `mode` in module-scoped `$state`, so each test
// resets the module registry and re-imports it to get a fresh instance.

function createFakeDocumentElement() {
	const attributes = new Map<string, string>();
	return {
		attributes,
		setAttribute: vi.fn((name: string, value: string) => {
			attributes.set(name, value);
		}),
		removeAttribute: vi.fn((name: string) => {
			attributes.delete(name);
		})
	};
}

function createFakeLocalStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => (store.has(key) ? (store.get(key) ?? null) : null)),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			store.delete(key);
		})
	};
}

describe('theme.svelte.ts', () => {
	let documentElement: ReturnType<typeof createFakeDocumentElement>;

	beforeEach(() => {
		vi.resetModules();
		documentElement = createFakeDocumentElement();
		vi.stubGlobal('document', { documentElement });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('ignores an invalid/garbage stored value and falls back to system', async () => {
		vi.stubGlobal('localStorage', createFakeLocalStorage({ 'lyre:theme': 'purple' }));
		const { initTheme, theme } = await import('./theme.svelte');

		initTheme();

		expect(theme.mode).toBe('system');
		expect(documentElement.removeAttribute).toHaveBeenCalledWith('data-theme');
		expect(documentElement.setAttribute).not.toHaveBeenCalled();
	});

	it('setTheme persists the choice to localStorage and applies data-theme', async () => {
		const localStorage = createFakeLocalStorage();
		vi.stubGlobal('localStorage', localStorage);
		const { setTheme, theme } = await import('./theme.svelte');

		setTheme('dark');

		expect(theme.mode).toBe('dark');
		expect(documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
		expect(localStorage.setItem).toHaveBeenCalledWith('lyre:theme', 'dark');
	});

	it('system mode removes the data-theme attribute rather than setting it', async () => {
		const localStorage = createFakeLocalStorage();
		vi.stubGlobal('localStorage', localStorage);
		const { setTheme, theme } = await import('./theme.svelte');

		setTheme('dark');
		setTheme('system');

		expect(theme.mode).toBe('system');
		expect(documentElement.removeAttribute).toHaveBeenLastCalledWith('data-theme');
		expect(localStorage.setItem).toHaveBeenLastCalledWith('lyre:theme', 'system');
	});

	it('is a safe no-op when localStorage throws', async () => {
		const localStorage = createFakeLocalStorage();
		localStorage.setItem.mockImplementation(() => {
			throw new Error('quota exceeded');
		});
		vi.stubGlobal('localStorage', localStorage);
		const { setTheme, theme } = await import('./theme.svelte');

		expect(() => setTheme('light')).not.toThrow();
		// The DOM side of the effect still applies even though persistence failed.
		expect(theme.mode).toBe('light');
		expect(documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
	});
});
