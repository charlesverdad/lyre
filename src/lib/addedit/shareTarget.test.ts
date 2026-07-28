import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// shareTarget.ts guards every `sessionStorage` access behind a
// `typeof sessionStorage === 'undefined'` check (theme.svelte.ts's pattern,
// src/lib/ui/theme.test.ts) — a hand-rolled fake is enough under Node, no
// jsdom needed.

function createFakeSessionStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => (store.has(key) ? (store.get(key) ?? null) : null),
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		}
	};
}

describe('shareTarget', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('round-trips a stashed url through consumeShareTarget', async () => {
		vi.stubGlobal('sessionStorage', createFakeSessionStorage());
		const { stashShareTarget, consumeShareTarget } = await import('./shareTarget');

		stashShareTarget({ url: 'https://pnwchords.com/song' });

		expect(consumeShareTarget()).toEqual({ url: 'https://pnwchords.com/song' });
	});

	it('clears the stash after consuming it, so a later consume sees nothing', async () => {
		vi.stubGlobal('sessionStorage', createFakeSessionStorage());
		const { stashShareTarget, consumeShareTarget } = await import('./shareTarget');

		stashShareTarget({ text: 'G  C\nAmazing grace' });
		consumeShareTarget();

		expect(consumeShareTarget()).toEqual({});
	});

	it('returns {} when nothing was ever stashed', async () => {
		vi.stubGlobal('sessionStorage', createFakeSessionStorage());
		const { consumeShareTarget } = await import('./shareTarget');

		expect(consumeShareTarget()).toEqual({});
	});

	it('is a safe no-op when sessionStorage is unavailable', async () => {
		vi.stubGlobal('sessionStorage', undefined);
		const { stashShareTarget, consumeShareTarget } = await import('./shareTarget');

		expect(() => stashShareTarget({ url: 'https://example.com' })).not.toThrow();
		expect(consumeShareTarget()).toEqual({});
	});
});
