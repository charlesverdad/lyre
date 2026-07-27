import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('sortPreference', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('falls back when nothing is stored', async () => {
		vi.stubGlobal('localStorage', createFakeLocalStorage());
		const { loadSortPreference } = await import('./sortPreference');
		expect(loadSortPreference('alpha')).toBe('alpha');
	});

	it('falls back on a garbage stored value', async () => {
		vi.stubGlobal('localStorage', createFakeLocalStorage({ 'lyre:librarySort': 'oldest' }));
		const { loadSortPreference } = await import('./sortPreference');
		expect(loadSortPreference('alpha')).toBe('alpha');
	});

	it('round-trips a valid saved choice', async () => {
		const localStorage = createFakeLocalStorage();
		vi.stubGlobal('localStorage', localStorage);
		const { loadSortPreference, saveSortPreference } = await import('./sortPreference');

		saveSortPreference('recentlyAdded');

		expect(localStorage.setItem).toHaveBeenCalledWith('lyre:librarySort', 'recentlyAdded');
		expect(loadSortPreference('alpha')).toBe('recentlyAdded');
	});

	it('is a safe no-op when localStorage is unavailable', async () => {
		vi.stubGlobal('localStorage', undefined);
		const { loadSortPreference, saveSortPreference } = await import('./sortPreference');
		expect(() => saveSortPreference('alpha')).not.toThrow();
		expect(loadSortPreference('recentlyPlayed')).toBe('recentlyPlayed');
	});

	it('is a safe no-op when localStorage throws', async () => {
		const localStorage = createFakeLocalStorage();
		localStorage.setItem.mockImplementation(() => {
			throw new Error('quota exceeded');
		});
		vi.stubGlobal('localStorage', localStorage);
		const { saveSortPreference } = await import('./sortPreference');
		expect(() => saveSortPreference('alpha')).not.toThrow();
	});
});
