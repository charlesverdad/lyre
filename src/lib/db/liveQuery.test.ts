import { describe, expect, it } from 'vitest';
import { createTestStore } from './store';
import { createSong } from './repo';
import { createLiveQuery } from './liveQuery.svelte';

function flush() {
	// The store notifies subscribers synchronously from `mutate`, but
	// `createLiveQuery`'s querier runs (and resolves) asynchronously — a
	// couple of ticks is enough for that to land.
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createLiveQuery', () => {
	it('starts at the initial value before the first emission', async () => {
		const store = createTestStore();
		const handle = createLiveQuery(() => store.read((doc) => doc.songs), [], store);
		try {
			expect(handle.value).toEqual([]);
		} finally {
			await flush();
			handle.destroy();
		}
	});

	it('updates reactively when the underlying store changes', async () => {
		const store = createTestStore();
		const handle = createLiveQuery(() => store.read((doc) => doc.songs), [], store);
		await flush();
		expect(handle.value).toEqual([]);

		await createSong(
			{
				song: {
					title: 'Amazing Grace',
					aliases: [],
					authors: ['John Newton'],
					defaultKey: 'Ab',
					topics: []
				},
				chart: { name: 'Default', chordproSource: '[G]Hi', sourceKey: 'Ab' }
			},
			store
		);
		await flush();

		expect(handle.value).toHaveLength(1);
		expect(handle.value[0].title).toBe('Amazing Grace');

		handle.destroy();
	});

	it('stops emitting after destroy()', async () => {
		const store = createTestStore();
		const handle = createLiveQuery(() => store.read((doc) => doc.songs), [], store);
		await flush();
		handle.destroy();

		await createSong(
			{
				song: {
					title: 'After Destroy',
					aliases: [],
					authors: [],
					defaultKey: 'C',
					topics: []
				},
				chart: { name: 'Default', chordproSource: '[C]Hi', sourceKey: 'C' }
			},
			store
		);
		await flush();

		expect(handle.value).toEqual([]);
	});

	it('logs and keeps the last-known-good value when the querier rejects', async () => {
		const store = createTestStore();
		let shouldFail = false;
		const handle = createLiveQuery(
			async () => {
				if (shouldFail) throw new Error('boom');
				return store.read((doc) => doc.songs);
			},
			[],
			store
		);
		await flush();

		shouldFail = true;
		await createSong(
			{
				song: {
					title: 'Triggers a re-run that fails',
					aliases: [],
					authors: [],
					defaultKey: 'C',
					topics: []
				},
				chart: { name: 'Default', chordproSource: '[C]Hi', sourceKey: 'C' }
			},
			store
		);
		await flush();

		// The failed re-run shouldn't have touched `value` — still the empty
		// array from before the mutation, not the new song and not a crash.
		expect(handle.value).toEqual([]);

		handle.destroy();
	});
});
