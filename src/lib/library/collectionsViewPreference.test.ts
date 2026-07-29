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

describe('collectionsViewPreference', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('falls back when nothing is stored', async () => {
		vi.stubGlobal('localStorage', createFakeLocalStorage());
		const { loadLibraryViewMode } = await import('./collectionsViewPreference');
		expect(loadLibraryViewMode('collections')).toBe('collections');
	});

	it('falls back on a garbage stored value', async () => {
		vi.stubGlobal('localStorage', createFakeLocalStorage({ 'lyre:libraryView': 'wat' }));
		const { loadLibraryViewMode } = await import('./collectionsViewPreference');
		expect(loadLibraryViewMode('songs')).toBe('songs');
	});

	it('round-trips a valid saved choice', async () => {
		const localStorage = createFakeLocalStorage();
		vi.stubGlobal('localStorage', localStorage);
		const { loadLibraryViewMode, saveLibraryViewMode } =
			await import('./collectionsViewPreference');

		saveLibraryViewMode('collections');

		expect(localStorage.setItem).toHaveBeenCalledWith('lyre:libraryView', 'collections');
		expect(loadLibraryViewMode('songs')).toBe('collections');
	});

	it('is a safe no-op when localStorage is unavailable', async () => {
		vi.stubGlobal('localStorage', undefined);
		const { loadLibraryViewMode, saveLibraryViewMode } =
			await import('./collectionsViewPreference');
		expect(() => saveLibraryViewMode('collections')).not.toThrow();
		expect(loadLibraryViewMode('songs')).toBe('songs');
	});

	it('is a safe no-op when localStorage throws', async () => {
		const localStorage = createFakeLocalStorage();
		localStorage.setItem.mockImplementation(() => {
			throw new Error('quota exceeded');
		});
		vi.stubGlobal('localStorage', localStorage);
		const { saveLibraryViewMode } = await import('./collectionsViewPreference');
		expect(() => saveLibraryViewMode('songs')).not.toThrow();
	});
});
